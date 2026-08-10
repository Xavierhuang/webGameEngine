'use client';

import { useRef, useState, useEffect } from 'react';
import { X, Shapes, Plus, Trash2, Move3D, RotateCw, Maximize2 } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Box as DreiBox, Sphere as DreiSphere, TransformControls } from '@react-three/drei';
import { PALETTE } from '../common/design';

interface ModelBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (composite: any) => void;
}

type Part = {
  id: string;
  shape: string;
  color: string;
  size: number;
  offset: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number }; // degrees
};

const presets = [
  { shape: 'box', name: 'Box' },
  { shape: 'sphere', name: 'Sphere' },
  { shape: 'cylinder', name: 'Cylinder' },
  { shape: 'cone', name: 'Cone' },
  { shape: 'pyramid', name: 'Pyramid' },
  { shape: 'torus', name: 'Torus' },
  { shape: 'capsule', name: 'Capsule' },
  { shape: 'plane', name: 'Plane' },
];

export default function ModelBuilder({ isOpen, onClose, onSave }: ModelBuilderProps) {
  const [name, setName] = useState('Composite');
  const [parts, setParts] = useState<Part[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [moveSnap, setMoveSnap] = useState<number | null>(null); // world units
  const [rotateSnapDeg, setRotateSnapDeg] = useState<number | null>(null); // degrees
  const [scaleSnap, setScaleSnap] = useState<number | null>(null); // scale units
  const orbitRef = useRef<any>(null);

  // Keyboard shortcuts for gizmo modes and quick selection clearing.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '1') {
        setGizmoMode('translate');
      } else if (e.key === '2') {
        setGizmoMode('rotate');
      } else if (e.key === '3') {
        setGizmoMode('scale');
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const addPart = (shape: string) => {
    setParts((p) => [
      ...p,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shape,
        color: '#60A5FA',
        size: 50,
        offset: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
      },
    ]);
  };

  const updatePart = (id: string, patch: Partial<Part>) => {
    setParts((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const removePart = (id: string) => {
    setParts((p) => p.filter((x) => x.id !== id));
  };

  const handleSave = () => {
    onSave({
      id: `composite-${Date.now()}`,
      name,
      color: '#60A5FA',
      shape: 'composite',
      size: 1,
      description: 'Composite from primitives',
      properties: {
        shape: 'composite',
        children: parts.map(({ shape, color, size, offset, rotation }) => ({
          shape,
          color,
          size,
          offset,
          rotation: rotation || { x: 0, y: 0, z: 0 },
        })),
      },
    });
    onClose();
  };

  // 3D preview renderer for a single part
  const PartPreview = ({
    part,
    isSelected,
    onSelect,
  }: {
    part: Part;
    isSelected: boolean;
    onSelect: (id: string) => void;
  }) => {
    const scaleVal = (part.size || 50) / 100;
    const scale: [number, number, number] = [scaleVal, scaleVal, scaleVal];
    const pos: [number, number, number] = [part.offset.x, part.offset.y, part.offset.z];
    const rot = part.rotation || { x: 0, y: 0, z: 0 };
    const rotRad: [number, number, number] = [
      (rot.x * Math.PI) / 180,
      (rot.y * Math.PI) / 180,
      (rot.z * Math.PI) / 180,
    ];
    const meshRef = useRef<any>(null);

    const onObjectChange = () => {
      if (!meshRef.current) return;
      const p = parts.find((x) => x.id === part.id);
      if (!p) return;
      const next: Partial<Part> = {};
      next.offset = {
        x: meshRef.current.position.x,
        y: meshRef.current.position.y,
        z: meshRef.current.position.z,
      };
      const rx = meshRef.current.rotation.x;
      const ry = meshRef.current.rotation.y;
      const rz = meshRef.current.rotation.z;
      next.rotation = { x: Math.round((rx * 180) / Math.PI), y: Math.round((ry * 180) / Math.PI), z: Math.round((rz * 180) / Math.PI) };
      if (gizmoMode === 'scale') {
        const s = meshRef.current.scale.x;
        next.size = Math.round(s * 100);
      }
      updatePart(part.id, next);
    };

    const wrap = (node: JSX.Element) => {
      if (!isSelected) return node;
      const rotationSnap = rotateSnapDeg ? (rotateSnapDeg * Math.PI) / 180 : undefined;
      return (
        <TransformControls
          object={meshRef}
          mode={gizmoMode}
          showX
          showY
          showZ
          onObjectChange={onObjectChange}
          onMouseDown={() => {
            if (orbitRef.current) orbitRef.current.enabled = false;
          }}
          onMouseUp={() => {
            if (orbitRef.current) orbitRef.current.enabled = true;
          }}
          translationSnap={moveSnap ?? undefined}
          rotationSnap={rotationSnap}
          scaleSnap={scaleSnap ?? undefined}
        >
          {node}
        </TransformControls>
      );
    };
    if (part.shape === 'sphere') {
      return wrap(
        <DreiSphere
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scaleVal}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <meshStandardMaterial color={part.color} />
        </DreiSphere>
      );
    }
    if (part.shape === 'cylinder') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scale}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    if (part.shape === 'cone') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scale}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <coneGeometry args={[0.6, 1, 24]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    if (part.shape === 'pyramid') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scale}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <coneGeometry args={[0.7, 1, 4]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    if (part.shape === 'torus') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scaleVal}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <torusGeometry args={[0.6, 0.2, 16, 32]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    if (part.shape === 'capsule') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scale}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    if (part.shape === 'plane') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          scale={scale}
          rotation={[-Math.PI / 2 + rotRad[0], rotRad[1], rotRad[2]]}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    // default: box
    return wrap(
      <DreiBox
        ref={meshRef}
        position={pos}
        rotation={rotRad}
        scale={scale}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(part.id);
        }}
      >
        <meshStandardMaterial color={part.color} />
      </DreiBox>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white"
              style={{ background: PALETTE.control }}
            >
              <Shapes className="w-5 h-5" />
            </span>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-none mb-0.5">
                Composite builder
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-900">
                Model Builder
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto flex-1">
          {/* Right Pane: Preview + Gizmos + Name */}
          <div className="md:col-span-2">
            {/* Live 3D preview */}
            <div className="w-full h-96 relative rounded-2xl border border-slate-200 mb-3 overflow-hidden bg-slate-50">
              <div className="absolute z-10 top-2 left-2 text-[11px] text-slate-700 bg-white/95 px-2.5 py-1.5 rounded-lg pointer-events-none shadow-sm border border-slate-200">
                Click a part to select · <span className="font-semibold">1</span> Move · <span className="font-semibold">2</span> Rotate · <span className="font-semibold">3</span> Scale · <span className="font-semibold">Esc</span> Clear
              </div>
              <Canvas camera={{ position: [0, 3, 6], fov: 55 }}>
                <ambientLight intensity={0.6} />
                <directionalLight position={[5, 10, 5]} intensity={0.8} />
                <Grid args={[20, 20]} cellSize={1} cellColor="#CBD5E1" sectionColor="#94A3B8" />
                <group position={[0, 0, 0]} onClick={() => setSelectedId(null)}>
                  {parts.map((p) => (
                    <PartPreview
                      key={p.id}
                      part={p}
                      isSelected={p.id === selectedId}
                      onSelect={(id) => {
                        setSelectedId(id);
                        setGizmoMode('translate');
                      }}
                    />
                  ))}
                </group>
                <OrbitControls ref={orbitRef} />
              </Canvas>
            </div>
            {/* Gizmo mode */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Gizmo</span>
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
                <PillButton active={gizmoMode === 'translate'} onClick={() => setGizmoMode('translate')} icon={<Move3D className="w-3.5 h-3.5" />}>Move</PillButton>
                <PillButton active={gizmoMode === 'rotate'} onClick={() => setGizmoMode('rotate')} icon={<RotateCw className="w-3.5 h-3.5" />}>Rotate</PillButton>
                <PillButton active={gizmoMode === 'scale'} onClick={() => setGizmoMode('scale')} icon={<Maximize2 className="w-3.5 h-3.5" />}>Scale</PillButton>
              </div>
            </div>
            {/* Snap controls */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-xs">
              <SnapRow label="Move snap" value={moveSnap} options={[{ v: null, label: 'Off' }, { v: 0.5, label: '0.5' }, { v: 1, label: '1' }]} onSelect={setMoveSnap} />
              <SnapRow label="Rotate snap" value={rotateSnapDeg} options={[{ v: null, label: 'Off' }, { v: 15, label: '15°' }, { v: 45, label: '45°' }]} onSelect={setRotateSnapDeg} />
              <SnapRow label="Scale snap" value={scaleSnap} options={[{ v: null, label: 'Off' }, { v: 0.1, label: '0.1' }, { v: 0.25, label: '0.25' }]} onSelect={setScaleSnap} />
            </div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg mb-4 focus:ring-2 focus:ring-slate-900 focus:border-transparent text-slate-900"
            />
          </div>
          {/* Left Pane: Add Parts + Parts List */}
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Add parts</div>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((p) => (
                  <button
                    key={p.shape}
                    onClick={() => addPart(p.shape)}
                    className="inline-flex items-center gap-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg p-2.5 text-sm text-slate-800 font-medium transition"
                  >
                    <Plus className="w-3.5 h-3.5 text-slate-500" />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Parts</div>
              <div className="space-y-2 max-h-[calc(90vh-380px)] overflow-auto pr-1">
                {parts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 text-center">
                    No parts yet. Add one from above.
                  </div>
                ) : (
                  parts.map((part) => (
                    <div
                      key={part.id}
                      className={`rounded-xl border p-3 transition ${
                        selectedId === part.id ? 'border-slate-900 shadow-sm ring-1 ring-slate-900' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <button
                          onClick={() => setSelectedId(part.id)}
                          className="font-semibold text-slate-900 text-sm capitalize"
                        >
                          {part.shape}
                        </button>
                        <button
                          onClick={() => removePart(part.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-6 gap-2">
                        <div className="col-span-2">
                          <PartFieldLabel>Color</PartFieldLabel>
                          <input
                            type="color"
                            value={part.color}
                            onChange={(e) => updatePart(part.id, { color: e.target.value })}
                            className="w-full h-9 rounded-md border border-slate-200"
                          />
                        </div>
                        <PartField label="Size" value={part.size} onChange={(v) => updatePart(part.id, { size: v })} />
                        <PartField label="X" value={part.offset.x} onChange={(v) => updatePart(part.id, { offset: { ...part.offset, x: v } })} />
                        <PartField label="Y" value={part.offset.y} onChange={(v) => updatePart(part.id, { offset: { ...part.offset, y: v } })} />
                        <PartField label="Z" value={part.offset.z} onChange={(v) => updatePart(part.id, { offset: { ...part.offset, z: v } })} />
                        <PartField
                          label="Rot X"
                          value={part.rotation?.x ?? 0}
                          onChange={(v) => updatePart(part.id, { rotation: { ...(part.rotation || { x: 0, y: 0, z: 0 }), x: v } })}
                        />
                        <PartField
                          label="Rot Y"
                          value={part.rotation?.y ?? 0}
                          onChange={(v) => updatePart(part.id, { rotation: { ...(part.rotation || { x: 0, y: 0, z: 0 }), y: v } })}
                        />
                        <PartField
                          label="Rot Z"
                          value={part.rotation?.z ?? 0}
                          onChange={(v) => updatePart(part.id, { rotation: { ...(part.rotation || { x: 0, y: 0, z: 0 }), z: v } })}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={handleSave}
                disabled={parts.length === 0}
                className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-full font-semibold transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save composite
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Local UI helpers ------------------------------------------------------

function PillButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs font-semibold rounded-md px-2.5 py-1.5 transition ${
        active
          ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function SnapRow<T extends number | null>({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: T;
  options: { v: T; label: string }[];
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-slate-100 border border-slate-200">
        {options.map((o) => {
          const isActive = value === o.v;
          return (
            <button
              key={String(o.v)}
              onClick={() => onSelect(o.v)}
              className={`text-[11px] font-semibold rounded px-2 py-0.5 transition ${
                isActive ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PartFieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-medium text-slate-500 mb-0.5">{children}</label>;
}

function PartField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <PartFieldLabel>{label}</PartFieldLabel>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value || '0'))}
        className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs text-slate-900 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
      />
    </div>
  );
}


