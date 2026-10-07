/**
 * Module placement: function patterns, the zig-zag codeword path, data masks and the four
 * mask penalty rules (ISO/IEC 18004 §6.3, §7.7, §7.8). Coordinates are (row, col) from the
 * top-left module; arrays are row-major, index = row·size + col.
 */

import { formatBits, versionBits } from './bch';
import { alignmentPositions, symbolSize, totalCodewords, type EcLevel } from './tables';

export const Role = {
  Finder: 1,
  Separator: 2,
  Timing: 3,
  Alignment: 4,
  Format: 5,
  Version: 6,
  DarkModule: 7,
  Data: 8,
  Ec: 9,
  Remainder: 10,
} as const;
export type RoleId = (typeof Role)[keyof typeof Role];

export interface Layout {
  version: number;
  size: number;
  /** Role of every module. Data/EC/remainder are filled in by placement. */
  roles: Uint8Array;
  /** 1 where a module belongs to a function pattern or the format/version areas. */
  isFunction: Uint8Array;
  /** Fixed light/dark values of function patterns (format/version are written later). */
  functionValues: Uint8Array;
  /** For format modules: bit index 0–14 (0 = least significant); for version: 0–17; else −1. */
  infoBit: Int8Array;
  /** For format/version modules: copy 1 or 2; else 0. */
  infoCopy: Uint8Array;
  /** Module index of every placed bit, in placement order (data codewords then remainder). */
  path: Int32Array;
}

const layoutCache = new Map<number, Layout>();

/** Function patterns and the zig-zag path for a version (independent of data and level). */
export function getLayout(version: number): Layout {
  const cached = layoutCache.get(version);
  if (cached) return cached;
  const size = symbolSize(version);
  const n = size * size;
  const roles = new Uint8Array(n);
  const isFunction = new Uint8Array(n);
  const functionValues = new Uint8Array(n);
  const infoBit = new Int8Array(n).fill(-1);
  const infoCopy = new Uint8Array(n);

  const set = (r: number, c: number, role: RoleId, dark: boolean) => {
    const i = r * size + c;
    roles[i] = role;
    isFunction[i] = 1;
    functionValues[i] = dark ? 1 : 0;
  };

  // Timing patterns (row 6 and column 6), drawn first so finders and alignment overwrite.
  for (let i = 0; i < size; i++) {
    set(6, i, Role.Timing, i % 2 === 0);
    set(i, 6, Role.Timing, i % 2 === 0);
  }

  // Finder patterns with their one-module separators.
  const finderCentres: [number, number][] = [
    [3, 3],
    [3, size - 4],
    [size - 4, 3],
  ];
  for (const [cr, cc] of finderCentres) {
    for (let dr = -4; dr <= 4; dr++) {
      for (let dc = -4; dc <= 4; dc++) {
        const r = cr + dr;
        const c = cc + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const dist = Math.max(Math.abs(dr), Math.abs(dc));
        if (dist === 4) set(r, c, Role.Separator, false);
        else set(r, c, Role.Finder, dist !== 2);
      }
    }
  }

  // Alignment patterns, except where they would collide with a finder.
  const align = alignmentPositions(version);
  const last = align.length - 1;
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          set(
            align[i] + dr,
            align[j] + dc,
            Role.Alignment,
            Math.max(Math.abs(dr), Math.abs(dc)) !== 1,
          );
        }
      }
    }
  }

  // Format information areas (values written per mask), two copies.
  for (const [r, c, bit, copy] of formatPositions(size)) {
    const i = r * size + c;
    roles[i] = Role.Format;
    isFunction[i] = 1;
    infoBit[i] = bit;
    infoCopy[i] = copy;
  }

  // The dark module beside the bottom-left finder.
  set(size - 8, 8, Role.DarkModule, true);

  // Version information areas (versions 7+), two copies.
  if (version >= 7) {
    const bits = versionBits(version);
    for (const [r, c, bit, copy] of versionPositions(size)) {
      set(r, c, Role.Version, ((bits >>> bit) & 1) === 1);
      infoBit[r * size + c] = bit;
      infoCopy[r * size + c] = copy;
    }
  }

  // Zig-zag path: column pairs from the right, alternately upward and downward, skipping
  // column 6 (the vertical timing pattern).
  const path: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const i = r * size + c;
        if (!isFunction[i]) path.push(i);
      }
    }
  }

  const layout: Layout = {
    version,
    size,
    roles,
    isFunction,
    functionValues,
    infoBit,
    infoCopy,
    path: Int32Array.from(path),
  };
  layoutCache.set(version, layout);
  return layout;
}

/** [row, col, bit, copy] for the 30 format modules. Bit 0 is the least significant. */
export function formatPositions(size: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  // Copy 1 around the top-left finder.
  for (let i = 0; i <= 5; i++) out.push([i, 8, i, 1]);
  out.push([7, 8, 6, 1]);
  out.push([8, 8, 7, 1]);
  out.push([8, 7, 8, 1]);
  for (let i = 9; i < 15; i++) out.push([8, 14 - i, i, 1]);
  // Copy 2 split between the top-right and bottom-left finders.
  for (let i = 0; i < 8; i++) out.push([8, size - 1 - i, i, 2]);
  for (let i = 8; i < 15; i++) out.push([size - 15 + i, 8, i, 2]);
  return out;
}

/** [row, col, bit, copy] for the 36 version modules (versions 7+). */
export function versionPositions(size: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < 18; i++) {
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    out.push([b, a, i, 1]); // top-right block: 6 rows × 3 columns
    out.push([a, b, i, 2]); // bottom-left block: 3 rows × 6 columns
  }
  return out;
}

/** The eight data mask conditions of ISO/IEC 18004 Table 10 (i = row, j = column). */
export const MASK_FORMULAS = [
  '(i + j) mod 2 = 0',
  'i mod 2 = 0',
  'j mod 3 = 0',
  '(i + j) mod 3 = 0',
  '(⌊i/2⌋ + ⌊j/3⌋) mod 2 = 0',
  '(i·j) mod 2 + (i·j) mod 3 = 0',
  '((i·j) mod 2 + (i·j) mod 3) mod 2 = 0',
  '((i + j) mod 2 + (i·j) mod 3) mod 2 = 0',
] as const;

export function maskBit(mask: number, i: number, j: number): boolean {
  switch (mask) {
    case 0:
      return (i + j) % 2 === 0;
    case 1:
      return i % 2 === 0;
    case 2:
      return j % 3 === 0;
    case 3:
      return (i + j) % 3 === 0;
    case 4:
      return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5:
      return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6:
      return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    case 7:
      return (((i + j) % 2) + ((i * j) % 3)) % 2 === 0;
    default:
      throw new RangeError(`mask must be 0..7, got ${mask}`);
  }
}

/** Write the 15 format bits for (level, mask) into a module array. */
export function writeFormat(modules: Uint8Array, size: number, level: EcLevel, mask: number): void {
  const bits = formatBits(level, mask);
  for (const [r, c, bit] of formatPositions(size)) modules[r * size + c] = (bits >>> bit) & 1;
}

/** XOR the mask pattern into every non-function module (in place). */
export function applyMask(modules: Uint8Array, layout: Layout, mask: number): void {
  const { size, isFunction } = layout;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      if (!isFunction[i] && maskBit(mask, r, c)) modules[i] ^= 1;
    }
  }
}

export interface Penalty {
  mask: number;
  /** Rule 1: runs of five or more same-coloured modules in a row or column (3 + extra length). */
  n1: number;
  /** Rule 2: 2×2 blocks of one colour, 3 points each (overlaps counted). */
  n2: number;
  /** Rule 3: 1:1:3:1:1 finder-like patterns with four light modules on one side, 40 each. */
  n3: number;
  /** Rule 4: 10 points per 5% that the dark share deviates from 50%. */
  n4: number;
  total: number;
  /** Share of dark modules, 0–1. */
  darkRatio: number;
}

/** 1:1:3:1:1 finder-like runs with four light modules after (A) or before (B), as 11 bits. */
const FINDER_LIKE_A = 0b10111010000;
const FINDER_LIKE_B = 0b00001011101;

/**
 * The four penalty rules as worded in ISO/IEC 18004 §7.8.3 and Thonky's tutorial, evaluated
 * over the whole symbol (function patterns included, quiet zone excluded).
 */
export function penalty(modules: Uint8Array, size: number, mask = -1): Penalty {
  let n1 = 0;
  let n2 = 0;
  let n3 = 0;

  // Rules 1 and 3 scan every row and every column as a line of modules. Rule 3 keeps the last
  // 11 modules as an 11-bit window and compares it with the two finder-like patterns.
  for (let pass = 0; pass < 2; pass++) {
    const along = pass === 0 ? 1 : size; // step between neighbours in the line
    const across = pass === 0 ? size : 1; // step between lines
    for (let line = 0; line < size; line++) {
      const base = line * across;
      let run = 1;
      let prev = modules[base];
      let window = prev;
      for (let k = 1; k < size; k++) {
        const v = modules[base + k * along];
        if (v === prev) {
          run++;
        } else {
          if (run >= 5) n1 += 3 + (run - 5);
          run = 1;
          prev = v;
        }
        window = ((window << 1) | v) & 0x7ff;
        if (k >= 10 && (window === FINDER_LIKE_A || window === FINDER_LIKE_B)) n3 += 40;
      }
      if (run >= 5) n1 += 3 + (run - 5);
    }
  }

  // Rule 2.
  for (let r = 0; r + 1 < size; r++) {
    const row = r * size;
    for (let c = 0; c + 1 < size; c++) {
      const v = modules[row + c];
      if (
        v === modules[row + c + 1] &&
        v === modules[row + size + c] &&
        v === modules[row + size + c + 1]
      )
        n2 += 3;
    }
  }

  // Rule 4.
  let dark = 0;
  for (let i = 0; i < modules.length; i++) dark += modules[i];
  const percent = (dark * 100) / modules.length;
  const prevFive = Math.floor(percent / 5) * 5;
  const nextFive = prevFive + 5;
  const n4 = Math.min(Math.abs(prevFive - 50) / 5, Math.abs(nextFive - 50) / 5) * 10;

  return { mask, n1, n2, n3, n4, total: n1 + n2 + n3 + n4, darkRatio: dark / modules.length };
}

export interface Placement {
  /** Module values before masking, with function patterns but no format bits. */
  unmasked: Uint8Array;
  /** For each module on the path: index into the codeword sequence (−1 for remainder bits). */
  codewordAt: Int32Array;
  /** For each module on the path: bit within the codeword, 7 = most significant. */
  bitAt: Int8Array;
}

/** Place the final codeword sequence along the zig-zag path. */
export function placeCodewords(layout: Layout, codewords: Uint8Array): Placement {
  const { size, path, functionValues } = layout;
  const total = totalCodewords(layout.version);
  if (codewords.length !== total) {
    throw new RangeError(
      `Version ${layout.version} needs ${total} codewords, got ${codewords.length}`,
    );
  }
  const unmasked = Uint8Array.from(functionValues);
  const codewordAt = new Int32Array(size * size).fill(-1);
  const bitAt = new Int8Array(size * size).fill(-1);
  for (let k = 0; k < path.length; k++) {
    const i = path[k];
    if (k < total * 8) {
      const cw = k >> 3;
      const bit = 7 - (k & 7);
      unmasked[i] = (codewords[cw] >>> bit) & 1;
      codewordAt[i] = cw;
      bitAt[i] = bit;
    } else {
      unmasked[i] = 0; // remainder bit
    }
  }
  return { unmasked, codewordAt, bitAt };
}

/** Read codewords back along the zig-zag path (inverse of placeCodewords). */
export function readCodewords(layout: Layout, unmaskedModules: Uint8Array): Uint8Array {
  const total = totalCodewords(layout.version);
  const out = new Uint8Array(total);
  const { path } = layout;
  for (let k = 0; k < total * 8; k++) {
    out[k >> 3] = (out[k >> 3] << 1) | unmaskedModules[path[k]];
  }
  return out;
}
