/**
 * Video motion detection.
 *
 * Pure and dependency-free: it takes two frames of RGBA pixels and returns how
 * much moved and in which direction. No camera, no canvas, no DOM — so the
 * maths can be tested against frames constructed by hand, which is the only way
 * to know it is right. The browser plumbing lives in components/player.
 *
 * The approach is frame differencing, the same idea Scratch uses: compare each
 * pixel to where it was, and where the picture changed, something moved.
 * Direction comes from how the changed region's centre of mass shifted.
 *
 * Deliberately not optical flow. Optical flow is more accurate and far more
 * expensive, and this runs every frame beside a 3D scene on a school laptop.
 * A child waving at the camera produces an enormous, unambiguous signal; the
 * precision that optical flow buys is precision nobody here needs.
 */

export interface MotionResult {
  /**
   * How much moved, 0-100, matching Scratch's scale so the numbers a child
   * types into `when video motion > 10` mean roughly the same thing.
   */
  amount: number;
  /**
   * Direction of movement in degrees, using the same convention as the rest of
   * the block language: 0 = right, 90 = up, 180 = left, 270 = down.
   * Meaningless when `amount` is near zero, and reported as 0 in that case.
   */
  direction: number;
}

/** Below this per-pixel difference, a change is sensor noise rather than motion. */
const NOISE_FLOOR = 24;

/**
 * Scales raw changed-pixel fraction to Scratch's 0-100 feel.
 *
 * A person waving typically changes a few percent of the frame, not most of
 * it, so a linear mapping would leave every real gesture down near 2 or 3 and
 * make the threshold unusable. Calibrating this against real hands in real
 * rooms is the part that needs a person and a camera.
 */
const SENSITIVITY = 12;

/** Luminance. Colour is irrelevant to whether something moved. */
function luma(data: Uint8ClampedArray, i: number): number {
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}

/**
 * Compare two RGBA frames of the same size.
 *
 * `step` samples every Nth pixel in each axis. At 1 it looks at everything; the
 * default of 2 quarters the work for no practical loss, because a hand is
 * thousands of pixels across and does not hide between them.
 */
export function detectMotion(
  previous: Uint8ClampedArray,
  current: Uint8ClampedArray,
  width: number,
  height: number,
  step = 2
): MotionResult {
  if (width <= 0 || height <= 0) return { amount: 0, direction: 0 };
  if (previous.length !== current.length) return { amount: 0, direction: 0 };
  if (previous.length < width * height * 4) return { amount: 0, direction: 0 };

  let changed = 0;
  let sampled = 0;
  // Centre of mass of the changed pixels, weighted by how much they changed,
  // in the previous frame and the current one.
  let prevX = 0, prevY = 0, currX = 0, currY = 0, prevWeight = 0, currWeight = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      sampled++;
      const before = luma(previous, i);
      const after = luma(current, i);
      const delta = Math.abs(after - before);
      if (delta < NOISE_FLOOR) continue;

      changed++;
      // A pixel that got brighter is where the subject moved TO; one that got
      // darker is where it moved FROM. The shift between those two centres is
      // the direction of travel.
      if (after > before) {
        currX += x * delta; currY += y * delta; currWeight += delta;
      } else {
        prevX += x * delta; prevY += y * delta; prevWeight += delta;
      }
    }
  }

  if (sampled === 0) return { amount: 0, direction: 0 };

  const fraction = changed / sampled;
  const amount = Math.min(100, Math.round(fraction * SENSITIVITY * 100));

  if (amount === 0 || prevWeight === 0 || currWeight === 0) {
    return { amount, direction: 0 };
  }

  const dx = currX / currWeight - prevX / prevWeight;
  // Screen y grows downward; the block language treats up as positive.
  const dy = -(currY / currWeight - prevY / prevWeight);
  if (dx === 0 && dy === 0) return { amount, direction: 0 };

  let direction = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (direction < 0) direction += 360;
  return { amount, direction: Math.round(direction) };
}

/**
 * Motion within a rectangle of the frame, for "video motion on this sprite".
 * Coordinates are clamped, so a region partly off-frame measures the part that
 * is on it rather than failing.
 */
export function detectMotionInRegion(
  previous: Uint8ClampedArray,
  current: Uint8ClampedArray,
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number },
  step = 2
): MotionResult {
  const x0 = Math.max(0, Math.min(width, Math.floor(region.x)));
  const y0 = Math.max(0, Math.min(height, Math.floor(region.y)));
  const x1 = Math.max(x0, Math.min(width, Math.floor(region.x + region.width)));
  const y1 = Math.max(y0, Math.min(height, Math.floor(region.y + region.height)));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return { amount: 0, direction: 0 };

  // Copy the region out so the same tested routine does the work.
  const size = w * h * 4;
  const a = new Uint8ClampedArray(size);
  const b = new Uint8ClampedArray(size);
  for (let y = 0; y < h; y++) {
    const src = ((y + y0) * width + x0) * 4;
    a.set(previous.subarray(src, src + w * 4), y * w * 4);
    b.set(current.subarray(src, src + w * 4), y * w * 4);
  }
  return detectMotion(a, b, w, h, step);
}
