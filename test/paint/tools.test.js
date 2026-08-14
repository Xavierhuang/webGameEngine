const {
  parseHex, toHex, floodFill, linePoints, brushOffsets,
  rectPoints, ellipsePoints, getPixel, setPixel, PALETTE,
} = require('../.build/lib/paint/tools.js');

let failures = 0;
function eq(a, b, label) {
  if (!Object.is(a, b)) { failures++; console.log(`FAIL ${label}: expected ${b}, got ${a}`); }
  else console.log(`ok   ${label}`);
}
function ok(c, label) { eq(Boolean(c), true, label); }

// --- colour parsing ---------------------------------------------------------
eq(toHex(parseHex('#ff0000')), '#ff0000', 'round-trips a 6-digit hex');
eq(toHex(parseHex('#f00')), '#ff0000', 'expands 3-digit shorthand');
eq(parseHex('#ff000080').a, 128, 'reads the alpha channel');
eq(parseHex('ff0000').r, 255, 'tolerates a missing #');
// Garbage must not produce NaN into a pixel buffer.
eq(parseHex('nonsense').r, 0, 'garbage falls back to black');
eq(parseHex('#gggggg').a, 255, 'non-hex characters fall back');
eq(parseHex(null).a, 255, 'null falls back');
ok(PALETTE.length >= 16, `palette has ${PALETTE.length} colours`);

// --- flood fill -------------------------------------------------------------
function blankCanvas(w, h) { return new Uint8ClampedArray(w * h * 4); }

{
  const W = 8, H = 8;
  const data = blankCanvas(W, H);
  const red = { r: 255, g: 0, b: 0, a: 255 };
  const filled = floodFill(data, W, H, 0, 0, red);
  eq(filled, 64, 'fills an entire blank canvas');
  eq(getPixel(data, W, 7, 7).r, 255, 'reaches the far corner');
}

{
  // A wall down the middle must contain the fill.
  const W = 8, H = 8;
  const data = blankCanvas(W, H);
  const wall = { r: 0, g: 0, b: 255, a: 255 };
  for (let y = 0; y < H; y++) setPixel(data, W, 4, y, wall);

  const red = { r: 255, g: 0, b: 0, a: 255 };
  const filled = floodFill(data, W, H, 0, 0, red);
  eq(filled, 32, 'fill stops at a wall');
  eq(getPixel(data, W, 5, 0).r, 0, 'does not leak past the wall');
  eq(getPixel(data, W, 4, 0).b, 255, 'leaves the wall intact');
}

{
  // Filling with the existing colour would otherwise never terminate.
  const W = 4, H = 4;
  const data = blankCanvas(W, H);
  const transparent = { r: 0, g: 0, b: 0, a: 0 };
  eq(floodFill(data, W, H, 0, 0, transparent), 0, 'filling with the same colour is a no-op');
}

{
  const W = 4, H = 4;
  const data = blankCanvas(W, H);
  const red = { r: 255, g: 0, b: 0, a: 255 };
  eq(floodFill(data, W, H, -1, 0, red), 0, 'out-of-bounds start is ignored');
  eq(floodFill(data, W, H, 99, 99, red), 0, 'far out-of-bounds start is ignored');
}

{
  // A large canvas must not blow the stack — the reason the fill is iterative.
  const W = 300, H = 300;
  const data = blankCanvas(W, H);
  const red = { r: 255, g: 0, b: 0, a: 255 };
  eq(floodFill(data, W, H, 150, 150, red), 90000, 'fills a 300x300 canvas without overflowing');
}

// --- lines ------------------------------------------------------------------
{
  const pts = linePoints({ x: 0, y: 0 }, { x: 5, y: 0 });
  eq(pts.length, 6, 'horizontal line has every pixel');
  const diag = linePoints({ x: 0, y: 0 }, { x: 3, y: 3 });
  eq(diag.length, 4, 'diagonal line is continuous');
  eq(linePoints({ x: 2, y: 2 }, { x: 2, y: 2 }).length, 1, 'a point is one pixel');
  // Sparse pointer events mean strokes rely on this being gap-free.
  const steep = linePoints({ x: 0, y: 0 }, { x: 2, y: 9 });
  for (let i = 1; i < steep.length; i++) {
    const dx = Math.abs(steep[i].x - steep[i - 1].x);
    const dy = Math.abs(steep[i].y - steep[i - 1].y);
    ok(dx <= 1 && dy <= 1, `steep line step ${i} is adjacent`);
  }
}

// --- brush ------------------------------------------------------------------
ok(brushOffsets(1).length >= 1, 'a 1px brush paints at least one pixel');
ok(brushOffsets(10).length > brushOffsets(4).length, 'bigger brush covers more');
ok(brushOffsets(0).length >= 1, 'zero size still paints something');
{
  // Round, not square.
  const offs = brushOffsets(10);
  ok(!offs.some((o) => o.x === 5 && o.y === 5), 'brush is circular, not square');
}

// --- shapes -----------------------------------------------------------------
{
  const r = rectPoints({ x: 0, y: 0 }, { x: 3, y: 3 });
  ok(r.some((p) => p.x === 0 && p.y === 0), 'rect includes its corner');
  ok(r.some((p) => p.x === 3 && p.y === 3), 'rect includes the far corner');
  ok(!r.some((p) => p.x === 1 && p.y === 1), 'rect is an outline, not filled');

  const e = ellipsePoints({ x: 0, y: 0 }, { x: 20, y: 20 });
  ok(e.length > 8, 'ellipse has enough points to look round');
  ok(e.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), 'ellipse points are finite');
  eq(ellipsePoints({ x: 5, y: 5 }, { x: 5, y: 5 }).length, 1, 'degenerate ellipse is one point');
}

if (failures > 0) { console.log(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nAll paint tests passed');
