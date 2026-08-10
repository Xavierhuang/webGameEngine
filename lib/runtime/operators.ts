/**
 * Scratch-3-style pure operators for the block interpreter.
 * No React, no THREE — safe to run anywhere.
 */

import type { ExprValue } from '../../types/game';

export type Value = ExprValue;

/** Scratch numeric coercion: booleans -> 1/0, non-numeric strings -> 0. */
export function toNumber(v: Value): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

/** Scratch boolean coercion. */
export function toBool(v: Value): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = v.trim().toLowerCase();
  if (s === '' || s === 'false' || s === '0') return false;
  const n = parseFloat(s);
  if (!Number.isNaN(n)) return n !== 0;
  return true;
}

/** Scratch `=`: numeric compare when both sides are numeric, else case-insensitive string compare. */
export function scratchEquals(a: Value, b: Value): boolean {
  const na = typeof a === 'string' && a.trim() !== '' ? parseFloat(a) : toNumber(a);
  const nb = typeof b === 'string' && b.trim() !== '' ? parseFloat(b) : toNumber(b);
  const aNumeric = typeof a !== 'string' || (a.trim() !== '' && !Number.isNaN(parseFloat(a)));
  const bNumeric = typeof b !== 'string' || (b.trim() !== '' && !Number.isNaN(parseFloat(b)));
  if (aNumeric && bNumeric) return na === nb;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/** Floored modulo (result sign follows divisor), matching Scratch. mod(a, 0) = 0. */
export function scratchMod(a: number, b: number): number {
  if (b === 0) return 0;
  return ((a % b) + b) % b;
}

/** Round half toward +infinity, matching Scratch (round(1.5)=2, round(-1.5)=-1). */
export function scratchRound(n: number): number {
  return Math.floor(n + 0.5);
}

/** Scratch random: integer (inclusive both ends) when both bounds are integers, else uniform float. */
export function scratchRandom(from: number, to: number, rand: () => number = Math.random): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  if (Number.isInteger(lo) && Number.isInteger(hi)) {
    return lo + Math.floor(rand() * (hi - lo + 1));
  }
  return lo + rand() * (hi - lo);
}

const DEG = Math.PI / 180;

/** Pure operator implementations keyed by Expr op. All args are already-evaluated Values. */
export const operators: Record<string, (...args: Value[]) => Value> = {
  // Arithmetic
  add: (a, b) => toNumber(a) + toNumber(b),
  sub: (a, b) => toNumber(a) - toNumber(b),
  mul: (a, b) => toNumber(a) * toNumber(b),
  div: (a, b) => toNumber(a) / toNumber(b),
  mod: (a, b) => scratchMod(toNumber(a), toNumber(b)),
  random: (a, b) => scratchRandom(toNumber(a), toNumber(b)),
  round: (a) => scratchRound(toNumber(a)),
  abs: (a) => Math.abs(toNumber(a)),
  floor: (a) => Math.floor(toNumber(a)),
  ceiling: (a) => Math.ceil(toNumber(a)),
  sqrt: (a) => Math.sqrt(toNumber(a)),
  // Trig in degrees (Scratch convention)
  sin: (a) => Math.sin(toNumber(a) * DEG),
  cos: (a) => Math.cos(toNumber(a) * DEG),
  tan: (a) => Math.tan(toNumber(a) * DEG),
  asin: (a) => Math.asin(toNumber(a)) / DEG,
  acos: (a) => Math.acos(toNumber(a)) / DEG,
  atan: (a) => Math.atan(toNumber(a)) / DEG,
  ln: (a) => Math.log(toNumber(a)),
  log: (a) => Math.log10(toNumber(a)),
  exp: (a) => Math.exp(toNumber(a)),
  exp10: (a) => Math.pow(10, toNumber(a)),
  // Comparison
  lt: (a, b) => toNumber(a) < toNumber(b),
  gt: (a, b) => toNumber(a) > toNumber(b),
  eq: (a, b) => scratchEquals(a, b),
  // Logic
  and: (a, b) => toBool(a) && toBool(b),
  or: (a, b) => toBool(a) || toBool(b),
  not: (a) => !toBool(a),
  // Strings
  join: (a, b) => String(a) + String(b),
  letter_of: (index, str) => {
    const i = toNumber(index);
    const s = String(str);
    return i >= 1 && i <= s.length ? s.charAt(i - 1) : '';
  },
  length: (a) => String(a).length,
  contains: (haystack, needle) =>
    String(haystack).toLowerCase().includes(String(needle).toLowerCase()),
};
