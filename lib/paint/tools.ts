/**
 * Paint tool maths — pure, no canvas, so it can be unit-tested in node.
 *
 * Scratch ships a full paint editor and LingPlay had nothing: a child could
 * pick a character but never draw one. This is the drawing core; the canvas
 * component is a thin shell over it.
 *
 * Everything works on a flat RGBA byte array laid out exactly like
 * `ImageData.data`, so the component can hand its buffer straight in.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type Point = { x: number; y: number };

/** Parse `#rgb`, `#rrggbb` or `#rrggbbaa`. Returns opaque black if unparseable. */
export function parseHex(hex: string): RGBA {
  const fallback: RGBA = { r: 0, g: 0, b: 0, a: 255 };
  if (typeof hex !== 'string') return fallback;

  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return fallback;
  if (!/^[0-9a-fA-F]+$/.test(h)) return fallback;

  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255,
  };
}

export function toHex({ r, g, b }: RGBA): string {
  const part = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function getPixel(data: Uint8ClampedArray, width: number, x: number, y: number): RGBA {
  const i = (y * width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

export function setPixel(data: Uint8ClampedArray, width: number, x: number, y: number, c: RGBA): void {
  const i = (y * width + x) * 4;
  data[i] = c.r;
  data[i + 1] = c.g;
  data[i + 2] = c.b;
  data[i + 3] = c.a;
}

function sameColor(a: RGBA, b: RGBA, tolerance: number): boolean {
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance &&
    Math.abs(a.a - b.a) <= tolerance
  );
}

/**
 * Flood fill (the paint-bucket tool), scanline-based.
 *
 * Iterative rather than recursive on purpose: a recursive fill blows the stack
 * on a large area, which on a 512x512 canvas is a very ordinary thing for a
 * child to do.
 */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fill: RGBA,
  tolerance = 8
): number {
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return 0;

  const target = getPixel(data, width, startX, startY);
  // Filling with the colour already there would loop forever.
  if (sameColor(target, fill, 0)) return 0;

  let filled = 0;
  const stack: Point[] = [{ x: startX, y: startY }];

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    if (y < 0 || y >= height) continue;

    // Walk left to the span start.
    let left = x;
    while (left >= 0 && sameColor(getPixel(data, width, left, y), target, tolerance)) left--;
    left++;

    let spanAbove = false;
    let spanBelow = false;

    for (let i = left; i < width && sameColor(getPixel(data, width, i, y), target, tolerance); i++) {
      setPixel(data, width, i, y, fill);
      filled++;

      if (y > 0) {
        const above = sameColor(getPixel(data, width, i, y - 1), target, tolerance);
        if (above && !spanAbove) {
          stack.push({ x: i, y: y - 1 });
          spanAbove = true;
        } else if (!above) {
          spanAbove = false;
        }
      }
      if (y < height - 1) {
        const below = sameColor(getPixel(data, width, i, y + 1), target, tolerance);
        if (below && !spanBelow) {
          stack.push({ x: i, y: y + 1 });
          spanBelow = true;
        } else if (!below) {
          spanBelow = false;
        }
      }
    }
  }

  return filled;
}

/**
 * Bresenham line. Pointer events arrive sparsely, so a fast stroke would
 * otherwise paint disconnected dots instead of a line.
 */
export function linePoints(from: Point, to: Point): Point[] {
  const points: Point[] = [];
  let x0 = Math.round(from.x);
  let y0 = Math.round(from.y);
  const x1 = Math.round(to.x);
  const y1 = Math.round(to.y);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  // Bounded so a malformed input can't spin forever.
  const limit = dx + dy + 2;
  for (let i = 0; i <= limit; i++) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return points;
}

/** Filled-circle offsets for a brush of the given diameter. */
export function brushOffsets(size: number): Point[] {
  const s = Math.max(1, Math.round(size));
  const radius = s / 2;
  const r = Math.ceil(radius);
  const offsets: Point[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= radius * radius) offsets.push({ x: dx, y: dy });
    }
  }
  // A size-1 brush must still paint its own pixel.
  return offsets.length > 0 ? offsets : [{ x: 0, y: 0 }];
}

/** Outline points of a rectangle between two corners. */
export function rectPoints(a: Point, b: Point): Point[] {
  const x0 = Math.round(Math.min(a.x, b.x));
  const x1 = Math.round(Math.max(a.x, b.x));
  const y0 = Math.round(Math.min(a.y, b.y));
  const y1 = Math.round(Math.max(a.y, b.y));

  const points: Point[] = [];
  for (let x = x0; x <= x1; x++) {
    points.push({ x, y: y0 }, { x, y: y1 });
  }
  for (let y = y0; y <= y1; y++) {
    points.push({ x: x0, y }, { x: x1, y });
  }
  return points;
}

/** Outline points of an ellipse inscribed in the box between two corners. */
export function ellipsePoints(a: Point, b: Point): Point[] {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  if (rx < 0.5 || ry < 0.5) return [{ x: Math.round(cx), y: Math.round(cy) }];

  const points: Point[] = [];
  // Step count scales with size so large ellipses stay continuous.
  const steps = Math.max(24, Math.ceil((rx + ry) * 2));
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    points.push({ x: Math.round(cx + Math.cos(t) * rx), y: Math.round(cy + Math.sin(t) * ry) });
  }
  return points;
}

/** The starter palette. Bright, high-contrast, and includes skin tones. */
export const PALETTE: string[] = [
  '#000000', '#7f7f7f', '#c3c3c3', '#ffffff',
  '#ff3b30', '#ff9500', '#ffcc00', '#34c759',
  '#00c7be', '#30b0c7', '#007aff', '#5856d6',
  '#af52de', '#ff2d55', '#a2845e', '#8b5a2b',
  '#ffdbac', '#f1c27d', '#e0ac69', '#c68642',
];
