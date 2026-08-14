'use client';

import { useEffect, useRef, useState } from 'react';
import {
  X, Brush, Eraser, PaintBucket, Minus, Square as SquareIcon,
  Circle as CircleIcon, Undo2, Redo2, Trash2, Save,
} from 'lucide-react';
import {
  parseHex, floodFill, linePoints, brushOffsets, rectPoints, ellipsePoints,
  setPixel, PALETTE, type Point,
} from '@/lib/paint/tools';

type Tool = 'brush' | 'eraser' | 'fill' | 'line' | 'rect' | 'ellipse';

const SIZE = 512;

interface PaintEditorProps {
  isOpen: boolean;
  onClose: () => void;
  /** Existing image to edit, if any. */
  initialUrl?: string | null;
  /** Receives the finished PNG data URL. */
  onSave: (dataUrl: string) => void | Promise<void>;
}

/**
 * A paint editor, so a child can draw their own character.
 *
 * This was the last thing Scratch could do that LingPlay could not. The drawing
 * maths lives in lib/paint/tools.ts and is unit-tested; this component is the
 * canvas shell around it.
 *
 * The result is a PNG applied as the object's texture, which is the 3D analogue
 * of a Scratch costume.
 */
export default function PaintEditor({ isOpen, onClose, initialUrl, onSave }: PaintEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState('#ff3b30');
  const [brushSize, setBrushSize] = useState(12);
  const [saving, setSaving] = useState(false);

  // Undo/redo as full-canvas snapshots. At 512x512 each is ~1MB, so the depth
  // is capped rather than unbounded.
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const shapeStartRef = useRef<Point | null>(null);
  /** Canvas contents before a shape drag, so the preview can be rolled back. */
  const shapeBaseRef = useRef<ImageData | null>(null);

  const ctx = () => canvasRef.current?.getContext('2d', { willReadFrequently: true }) ?? null;

  useEffect(() => {
    if (!isOpen) return;
    const c = ctx();
    if (!c) return;

    c.clearRect(0, 0, SIZE, SIZE);
    undoRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);

    if (initialUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => c.drawImage(img, 0, 0, SIZE, SIZE);
      // A failed load just leaves a blank canvas, which is a fine starting point.
      img.src = initialUrl;
    }
  }, [isOpen, initialUrl]);

  const pushUndo = () => {
    const c = ctx();
    if (!c) return;
    undoRef.current.push(c.getImageData(0, 0, SIZE, SIZE));
    if (undoRef.current.length > 20) undoRef.current.shift();
    redoRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const undo = () => {
    const c = ctx();
    const snapshot = undoRef.current.pop();
    if (!c || !snapshot) return;
    redoRef.current.push(c.getImageData(0, 0, SIZE, SIZE));
    c.putImageData(snapshot, 0, 0);
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(true);
  };

  const redo = () => {
    const c = ctx();
    const snapshot = redoRef.current.pop();
    if (!c || !snapshot) return;
    undoRef.current.push(c.getImageData(0, 0, SIZE, SIZE));
    c.putImageData(snapshot, 0, 0);
    setCanRedo(redoRef.current.length > 0);
    setCanUndo(true);
  };

  const clear = () => {
    const c = ctx();
    if (!c) return;
    pushUndo();
    c.clearRect(0, 0, SIZE, SIZE);
  };

  /** Pointer position in canvas pixels, accounting for CSS scaling. */
  const toCanvas = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
    };
  };

  /** Stamp the brush along a set of points, straight into the pixel buffer. */
  const stamp = (points: Point[], erase: boolean) => {
    const c = ctx();
    if (!c) return;
    const image = c.getImageData(0, 0, SIZE, SIZE);
    const rgba = erase ? { r: 0, g: 0, b: 0, a: 0 } : parseHex(color);
    const offsets = brushOffsets(brushSize);

    for (const p of points) {
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      for (const o of offsets) {
        const x = px + o.x;
        const y = py + o.y;
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
        setPixel(image.data, SIZE, x, y, rgba);
      }
    }
    c.putImageData(image, 0, 0);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const c = ctx();
    if (!c) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    pushUndo();

    if (tool === 'fill') {
      const image = c.getImageData(0, 0, SIZE, SIZE);
      floodFill(image.data, SIZE, SIZE, Math.round(p.x), Math.round(p.y), parseHex(color));
      c.putImageData(image, 0, 0);
      return;
    }

    drawingRef.current = true;
    lastPointRef.current = p;

    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      shapeStartRef.current = p;
      shapeBaseRef.current = c.getImageData(0, 0, SIZE, SIZE);
      return;
    }
    stamp([p], tool === 'eraser');
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const c = ctx();
    if (!c) return;
    const p = toCanvas(e);

    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      // Repaint from the pre-drag snapshot so the preview doesn't smear.
      if (shapeBaseRef.current) c.putImageData(shapeBaseRef.current, 0, 0);
      const start = shapeStartRef.current!;
      const points =
        tool === 'line' ? linePoints(start, p)
        : tool === 'rect' ? rectPoints(start, p)
        : ellipsePoints(start, p);
      stamp(points, false);
      return;
    }

    // Pointer events are sparse, so interpolate or a fast stroke leaves gaps.
    const last = lastPointRef.current ?? p;
    stamp(linePoints(last, p), tool === 'eraser');
    lastPointRef.current = p;
  };

  const onPointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
    shapeStartRef.current = null;
    shapeBaseRef.current = null;
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      await onSave(canvas.toDataURL('image/png'));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const TOOLS: Array<{ id: Tool; icon: typeof Brush; label: string }> = [
    { id: 'brush', icon: Brush, label: 'Brush' },
    { id: 'eraser', icon: Eraser, label: 'Eraser' },
    { id: 'fill', icon: PaintBucket, label: 'Fill' },
    { id: 'line', icon: Minus, label: 'Line' },
    { id: 'rect', icon: SquareIcon, label: 'Rectangle' },
    { id: 'ellipse', icon: CircleIcon, label: 'Circle' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-black tracking-tight text-slate-900">Draw your character</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 gap-4 overflow-hidden p-4">
          {/* Tools */}
          <div className="flex w-16 shrink-0 flex-col gap-1.5">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                title={t.label}
                className={`flex h-12 items-center justify-center rounded-xl border transition ${
                  tool === t.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <t.icon className="h-5 w-5" />
              </button>
            ))}

            <div className="mt-2 border-t border-slate-200 pt-2">
              <button
                onClick={undo}
                disabled={!canUndo}
                title="Undo"
                className="flex h-10 w-full items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:opacity-30"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                title="Redo"
                className="flex h-10 w-full items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:opacity-30"
              >
                <Redo2 className="h-4 w-4" />
              </button>
              <button
                onClick={clear}
                title="Clear everything"
                className="flex h-10 w-full items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Canvas. The checkerboard shows transparency. */}
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <canvas
              ref={canvasRef}
              width={SIZE}
              height={SIZE}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="max-h-full max-w-full touch-none rounded-xl border border-slate-200"
              style={{
                aspectRatio: '1 / 1',
                cursor: 'crosshair',
                backgroundImage:
                  'linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0,0 8px,8px -8px,-8px 0px',
              }}
            />
          </div>

          {/* Colours + size */}
          <div className="w-40 shrink-0 space-y-4">
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Colour
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    title={c}
                    className={`h-6 w-6 rounded-md border transition ${
                      color === c ? 'border-slate-900 ring-2 ring-slate-900/20' : 'border-slate-200'
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="mt-2 h-8 w-full cursor-pointer rounded-lg border border-slate-200"
              />
            </div>

            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Size · {brushSize}
              </div>
              <input
                type="range"
                min={1}
                max={64}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full accent-slate-900"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Use this drawing'}
          </button>
        </div>
      </div>
    </div>
  );
}
