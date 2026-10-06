/**
 * Format and version information (ISO/IEC 18004 §7.9 and §7.10, Annexes C and D).
 *
 * Format information: 5 data bits (2 for the error-correction level, 3 for the mask pattern)
 * protected by a (15, 5) BCH code with generator G(x) = x^10 + x^8 + x^5 + x^4 + x^2 + x + 1
 * (0x537), then XORed with 101010000010010 (0x5412) so the result is never all zero.
 * Minimum distance 7 ⇒ up to 3 bit errors per copy can be corrected.
 *
 * Version information (versions 7–40): 6 data bits protected by an (18, 6) BCH code with
 * generator x^12 + x^11 + x^10 + x^9 + x^8 + x^5 + x^2 + 1 (0x1F25). Minimum distance 8.
 */

import type { EcLevel } from './tables';

export const FORMAT_GENERATOR = 0x537;
export const FORMAT_MASK = 0x5412;
export const VERSION_GENERATOR = 0x1f25;

/** The two-bit indicators of ISO/IEC 18004 Table 12: L = 01, M = 00, Q = 11, H = 10. */
export const EC_LEVEL_BITS: Record<EcLevel, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };
const LEVEL_FROM_BITS: EcLevel[] = ['M', 'L', 'H', 'Q'];

function bitLength(x: number): number {
  return x === 0 ? 0 : 32 - Math.clz32(x);
}

/** Remainder of value (already shifted left by the check length) modulo a binary generator. */
export function bchRemainder(value: number, generator: number): number {
  const genLen = bitLength(generator);
  let r = value;
  while (bitLength(r) >= genLen) r ^= generator << (bitLength(r) - genLen);
  return r;
}

export interface FormatInfo {
  level: EcLevel;
  mask: number;
}

/** The 5 data bits of the format information (before BCH). */
export function formatDataBits(level: EcLevel, mask: number): number {
  return (EC_LEVEL_BITS[level] << 3) | mask;
}

/** 15-bit format information, masked, most significant bit = bit 14. */
export function formatBits(level: EcLevel, mask: number): number {
  if (!Number.isInteger(mask) || mask < 0 || mask > 7) throw new RangeError('mask must be 0..7');
  const data = formatDataBits(level, mask);
  return ((data << 10) | bchRemainder(data << 10, FORMAT_GENERATOR)) ^ FORMAT_MASK;
}

/** 18-bit version information for versions 7 to 40. */
export function versionBits(version: number): number {
  if (!Number.isInteger(version) || version < 7 || version > 40) {
    throw new RangeError('Version information exists only for versions 7–40');
  }
  return (version << 12) | bchRemainder(version << 12, VERSION_GENERATOR);
}

export function popcount(x: number): number {
  let c = 0;
  let v = x >>> 0;
  while (v) {
    v &= v - 1;
    c++;
  }
  return c;
}

export interface BchDecode<T> {
  ok: boolean;
  /** Decoded value (the nearest codeword's data) when ok. */
  value: T | null;
  /** The bits that were read. */
  read: number;
  /** The nearest valid codeword. */
  nearest: number;
  /** Hamming distance between what was read and the nearest codeword (= bits corrected). */
  distance: number;
  /** Bit positions (0 = least significant) that were corrected. */
  correctedBits: number[];
}

const ALL_FORMATS: { bits: number; info: FormatInfo }[] = [];
for (const level of ['L', 'M', 'Q', 'H'] as EcLevel[]) {
  for (let mask = 0; mask < 8; mask++)
    ALL_FORMATS.push({ bits: formatBits(level, mask), info: { level, mask } });
}

function bitsSet(x: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 31; i++) if ((x >>> i) & 1) out.push(i);
  return out;
}

/**
 * Decode 15 read format bits by nearest-codeword search over the 32 valid strings.
 * Succeeds when the nearest codeword is within distance 3 (the code's correction radius).
 */
export function decodeFormatBits(read: number): BchDecode<FormatInfo> {
  let best = ALL_FORMATS[0];
  let bestDist = 99;
  for (const f of ALL_FORMATS) {
    const d = popcount(f.bits ^ read);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  const ok = bestDist <= 3;
  return {
    ok,
    value: ok ? best.info : null,
    read,
    nearest: best.bits,
    distance: bestDist,
    correctedBits: bitsSet(best.bits ^ read),
  };
}

/** Decode 18 read version bits by nearest-codeword search over versions 7–40. */
export function decodeVersionBits(read: number): BchDecode<number> {
  let bestVersion = 7;
  let bestDist = 99;
  for (let v = 7; v <= 40; v++) {
    const d = popcount(versionBits(v) ^ read);
    if (d < bestDist) {
      bestDist = d;
      bestVersion = v;
    }
  }
  const ok = bestDist <= 3;
  const nearest = versionBits(bestVersion);
  return {
    ok,
    value: ok ? bestVersion : null,
    read,
    nearest,
    distance: bestDist,
    correctedBits: bitsSet(nearest ^ read),
  };
}

export function levelFromBits(bits: number): EcLevel {
  return LEVEL_FROM_BITS[bits & 3];
}

/** Bits of x as a string, most significant first, padded to width. */
export function toBinary(x: number, width: number): string {
  return (x >>> 0).toString(2).padStart(width, '0');
}
