/** Small formatting helpers for bits, bytes and polynomials. */

import { LOG } from './qr/gf256';

export const hex = (v: number, width = 2) => v.toString(16).toUpperCase().padStart(width, '0');
export const bin = (v: number, width: number) => (v >>> 0).toString(2).padStart(width, '0');
export const fmt = (n: number) => n.toLocaleString('en-US');

/** "α^e" label for a non-zero field element, "0" for zero. */
export function alpha(v: number): string {
  return v === 0 ? '0' : `α${superscript(LOG[v])}`;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export function superscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => (d === '-' ? '⁻' : SUP[Number(d)]))
    .join('');
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export function subscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUB[Number(d)])
    .join('');
}

/** Visible form of a character (spaces and control characters made readable). */
export function showChar(ch: string): string {
  if (ch === ' ') return '␣';
  if (ch === '\n') return '↵';
  if (ch === '\t') return '⇥';
  return ch;
}
