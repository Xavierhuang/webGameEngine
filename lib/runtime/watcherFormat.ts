/**
 * How a variable reads on the stage.
 *
 * The watcher printed `String(value)` straight from the runtime, so a child
 * building anything with arithmetic saw floating-point noise:
 *
 *     Ball: speed: -0.390000000000000024
 *
 * That number is correct and unreadable, and it turns up the moment a child
 * adds 0.1 to anything — which the physics example does sixty times a second.
 * Scratch rounds its monitors for exactly this reason.
 *
 * Pure and dependency-free so a bare `tsc` test can require it.
 */

/** Decimal places kept before rounding. Scratch shows six. */
const PLACES = 6;

export function formatWatcherValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null || value === undefined) return '';
  if (typeof value !== 'number') return String(value);

  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);

  // Very large or very small magnitudes are left in whatever form JavaScript
  // gives them: rounding 1e-9 to six places would print a plain "0", which is
  // worse than an exponent because it reads as a different number.
  const magnitude = Math.abs(value);
  if (magnitude >= 1e15 || magnitude < 1e-6) return String(value);

  const rounded = Number(value.toFixed(PLACES));
  // `toFixed` pads with zeros ("0.390000"); Number() drops them again, and
  // String() of the result never reintroduces the original noise because the
  // rounding already discarded it.
  return String(rounded);
}
