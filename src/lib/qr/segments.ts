/**
 * Data segments: numeric, alphanumeric and byte (UTF-8) mode (ISO/IEC 18004 §7.4).
 *
 * "Auto" picks, for each version range, the split of the text into segments that minimises the
 * total bit length (a shortest-path dynamic programme over the three modes), because a mode
 * switch costs a 4-bit mode indicator plus a character count.
 */

import { ALPHANUMERIC_CHARSET, charCountBits, MODE_INDICATOR, type Mode } from './tables';

export type EncodableMode = 'numeric' | 'alphanumeric' | 'byte';
export const ENCODABLE_MODES: readonly EncodableMode[] = ['numeric', 'alphanumeric', 'byte'];

export interface Segment {
  mode: EncodableMode;
  /** The characters of this segment (a substring of the input, whole code points). */
  text: string;
}

/** One group of bits inside a segment, kept for the story mode's bit listing. */
export interface BitChunk {
  kind: 'mode' | 'count' | 'data';
  /** Bit string, most significant first. */
  bits: string;
  /** The characters this chunk encodes (data chunks only). */
  chars?: string;
  /** Value written (count or data value). */
  value: number;
  /** For data chunks: how the value was formed, e.g. "17×45 + 14". */
  formula?: string;
}

export interface EncodedSegment extends Segment {
  /** Characters counted by the character count indicator (bytes for byte mode). */
  count: number;
  chunks: BitChunk[];
  bitLength: number;
}

const encoder = new TextEncoder();

export function isNumericChar(ch: string): boolean {
  return ch.length === 1 && ch >= '0' && ch <= '9';
}

export function isAlphanumericChar(ch: string): boolean {
  return ch.length === 1 && ALPHANUMERIC_CHARSET.includes(ch);
}

export function utf8Bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

/** Does the whole text fit the given mode? */
export function fitsMode(text: string, mode: EncodableMode): boolean {
  if (mode === 'byte') return true;
  const test = mode === 'numeric' ? isNumericChar : isAlphanumericChar;
  for (const ch of text) if (!test(ch)) return false;
  return true;
}

/** First character (and its index in code points) that the mode cannot encode, if any. */
export function firstInvalidChar(
  text: string,
  mode: EncodableMode,
): { char: string; index: number } | null {
  if (mode === 'byte') return null;
  const test = mode === 'numeric' ? isNumericChar : isAlphanumericChar;
  let index = 0;
  for (const ch of text) {
    if (!test(ch)) return { char: ch, index };
    index++;
  }
  return null;
}

/** Data bits (excluding mode indicator and count) for a segment of `count` characters/bytes. */
export function dataBitLength(mode: EncodableMode, count: number): number {
  switch (mode) {
    case 'numeric':
      return Math.floor(count / 3) * 10 + [0, 4, 7][count % 3];
    case 'alphanumeric':
      return Math.floor(count / 2) * 11 + (count % 2) * 6;
    case 'byte':
      return count * 8;
  }
}

function segmentCount(seg: Segment): number {
  return seg.mode === 'byte' ? utf8Bytes(seg.text).length : [...seg.text].length;
}

/** Total bits of a segment list for a given version (header + data). */
export function segmentsBitLength(segments: readonly Segment[], version: number): number | null {
  let total = 0;
  for (const seg of segments) {
    const count = segmentCount(seg);
    const ccBits = charCountBits(seg.mode, version);
    if (count >= 1 << ccBits) return null; // count does not fit its indicator
    total += 4 + ccBits + dataBitLength(seg.mode, count);
  }
  return total;
}

const toBits = (value: number, width: number) => value.toString(2).padStart(width, '0');

/** Encode a segment into its bit chunks for a given version. */
export function encodeSegment(seg: Segment, version: number): EncodedSegment {
  const ccBits = charCountBits(seg.mode, version);
  const chunks: BitChunk[] = [];
  const count = segmentCount(seg);
  chunks.push({
    kind: 'mode',
    bits: toBits(MODE_INDICATOR[seg.mode], 4),
    value: MODE_INDICATOR[seg.mode],
  });
  chunks.push({ kind: 'count', bits: toBits(count, ccBits), value: count });

  if (seg.mode === 'numeric') {
    const digits = seg.text;
    for (let i = 0; i < digits.length; i += 3) {
      const group = digits.slice(i, i + 3);
      const width = [0, 4, 7, 10][group.length];
      const value = Number.parseInt(group, 10);
      chunks.push({
        kind: 'data',
        bits: toBits(value, width),
        value,
        chars: group,
        formula: `${value}`,
      });
    }
  } else if (seg.mode === 'alphanumeric') {
    const s = seg.text;
    for (let i = 0; i < s.length; i += 2) {
      const a = ALPHANUMERIC_CHARSET.indexOf(s[i]);
      if (i + 1 < s.length) {
        const b = ALPHANUMERIC_CHARSET.indexOf(s[i + 1]);
        const value = a * 45 + b;
        chunks.push({
          kind: 'data',
          bits: toBits(value, 11),
          value,
          chars: s.slice(i, i + 2),
          formula: `${a}×45 + ${b}`,
        });
      } else {
        chunks.push({ kind: 'data', bits: toBits(a, 6), value: a, chars: s[i], formula: `${a}` });
      }
    }
  } else {
    // Byte mode: one chunk per character so multi-byte UTF-8 characters stay together.
    for (const ch of seg.text) {
      const bytes = utf8Bytes(ch);
      chunks.push({
        kind: 'data',
        bits: Array.from(bytes, (b) => toBits(b, 8)).join(''),
        value: bytes[0],
        chars: ch,
        formula: Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      });
    }
  }
  const bitLength = chunks.reduce((n, c) => n + c.bits.length, 0);
  return { ...seg, count, chunks, bitLength };
}

// Costs in sixths of a bit so numeric (10/3 bits) and alphanumeric (11/2 bits) stay integral.
const NUMERIC_COST = 20;
const ALNUM_COST = 33;
const BYTE_COST = 48;

/**
 * Optimal segmentation for the character count widths of `version`'s range.
 * Dynamic programme over (position, mode): cost[i][m] = cheapest encoding of the first i+1
 * characters whose last segment is in mode m. Switching modes after a character costs the
 * finished segment rounded up to whole bits plus the new segment's header.
 */
export function optimalSegments(text: string, version: number): Segment[] {
  const chars = [...text];
  if (chars.length === 0) return [];
  const modes = ENCODABLE_MODES;
  const head = modes.map((m) => (4 + charCountBits(m, version)) * 6);
  const INF = Number.POSITIVE_INFINITY;
  // prev[i][m] = mode of character i−1 on the optimal path ending in mode m at character i.
  const from: (number | null)[][] = [];
  let cost = head.slice();
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = [INF, INF, INF];
    const back: (number | null)[] = [null, null, null];
    const extend = [
      isNumericChar(ch) ? NUMERIC_COST : INF,
      isAlphanumericChar(ch) ? ALNUM_COST : INF,
      utf8Bytes(ch).length * BYTE_COST,
    ];
    for (let m = 0; m < 3; m++) {
      if (extend[m] === INF) continue;
      // Continue a segment of mode m, or start one here after a segment of mode k.
      for (let k = 0; k < 3; k++) {
        const base =
          i === 0 ? (k === m ? cost[m] : INF) : k === m ? cost[m] : finish(cost[k]) + head[m];
        if (base === INF) continue;
        const c = base + extend[m];
        if (c < next[m]) {
          next[m] = c;
          back[m] = i === 0 ? null : k;
        }
      }
    }
    from.push(back);
    cost = next;
  }
  // Pick the cheapest final mode, then walk back.
  let mode = 0;
  for (let m = 1; m < 3; m++) if (finish(cost[m]) < finish(cost[mode])) mode = m;
  const charModes = new Array<number>(chars.length);
  for (let i = chars.length - 1; i >= 0; i--) {
    charModes[i] = mode;
    const b = from[i][mode];
    if (b !== null) mode = b;
  }
  const segments: Segment[] = [];
  for (let i = 0; i < chars.length; i++) {
    const m = modes[charModes[i]];
    const last = segments[segments.length - 1];
    if (last && last.mode === m) last.text += chars[i];
    else segments.push({ mode: m, text: chars[i] });
  }
  return segments;
}

function finish(sixths: number): number {
  return Math.ceil(sixths / 6) * 6;
}

/** A single segment in the given mode (caller validates the characters first). */
export function singleSegment(text: string, mode: EncodableMode): Segment[] {
  return text.length ? [{ mode, text }] : [];
}

export type { Mode };
