/**
 * Symbol geometry and error-correction structure for QR code versions 1–40
 * (ISO/IEC 18004 Tables 1, 7 and 9 and Annex E). Unit tests compare every value derived here
 * with the published tables (tests/fixtures).
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H';
export const EC_LEVELS: readonly EcLevel[] = ['L', 'M', 'Q', 'H'];

/** Approximate share of codewords each level can restore (ISO/IEC 18004 Table 9 headings). */
export const EC_RECOVERY: Record<EcLevel, string> = { L: '7%', M: '15%', Q: '25%', H: '30%' };

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

// Index 0 is unused so that the version number indexes directly.
// Error-correction codewords per block, by level then version.
const EC_PER_BLOCK: Record<EcLevel, readonly number[]> = {
  // prettier-ignore
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // prettier-ignore
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  // prettier-ignore
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // prettier-ignore
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

// Number of Reed–Solomon blocks, by level then version.
const BLOCK_COUNT: Record<EcLevel, readonly number[]> = {
  // prettier-ignore
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  // prettier-ignore
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  // prettier-ignore
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  // prettier-ignore
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

export function assertVersion(version: number): void {
  if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_VERSION) {
    throw new RangeError(`QR versions run from 1 to 40, got ${version}`);
  }
}

/** Modules per side: 21 for version 1, +4 per version, 177 for version 40. */
export function symbolSize(version: number): number {
  assertVersion(version);
  return 17 + 4 * version;
}

export function versionFromSize(size: number): number | null {
  const v = (size - 17) / 4;
  return Number.isInteger(v) && v >= MIN_VERSION && v <= MAX_VERSION ? v : null;
}

/**
 * Centre coordinates of alignment patterns (used as both row and column), Annex E.
 * Evenly spaced from the last coordinate (size − 7) down towards 6, with an even step.
 */
export function alignmentPositions(version: number): number[] {
  assertVersion(version);
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = symbolSize(version);
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

/**
 * Modules left for data and EC codewords after all function patterns, format and version
 * information are drawn (includes the 0–7 remainder bits).
 */
export function rawDataModules(version: number): number {
  assertVersion(version);
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

export function totalCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8);
}

export function remainderBits(version: number): number {
  return rawDataModules(version) % 8;
}

export interface BlockLayout {
  version: number;
  level: EcLevel;
  totalCodewords: number;
  ecCodewordsPerBlock: number;
  numBlocks: number;
  /** Blocks with the shorter data length come first (group 1 in the standard). */
  group1: { blocks: number; dataCodewords: number };
  group2: { blocks: number; dataCodewords: number };
  dataCodewords: number;
  /** Data codewords per block, in block order. */
  dataPerBlock: number[];
}

export function blockLayout(version: number, level: EcLevel): BlockLayout {
  assertVersion(version);
  const ec = EC_PER_BLOCK[level][version];
  const numBlocks = BLOCK_COUNT[level][version];
  const total = totalCodewords(version);
  const shortLen = Math.floor(total / numBlocks);
  const numLong = total % numBlocks;
  const numShort = numBlocks - numLong;
  const shortData = shortLen - ec;
  const dataPerBlock: number[] = [];
  for (let i = 0; i < numBlocks; i++) dataPerBlock.push(i < numShort ? shortData : shortData + 1);
  return {
    version,
    level,
    totalCodewords: total,
    ecCodewordsPerBlock: ec,
    numBlocks,
    group1: { blocks: numShort, dataCodewords: shortData },
    group2: { blocks: numLong, dataCodewords: numLong ? shortData + 1 : 0 },
    dataCodewords: total - ec * numBlocks,
    dataPerBlock,
  };
}

export function dataCodewords(version: number, level: EcLevel): number {
  return totalCodewords(version) - EC_PER_BLOCK[level][version] * BLOCK_COUNT[level][version];
}

export function dataCapacityBits(version: number, level: EcLevel): number {
  return dataCodewords(version, level) * 8;
}

export type Mode = 'numeric' | 'alphanumeric' | 'byte' | 'kanji' | 'eci';

/** Four-bit mode indicators (ISO/IEC 18004 Table 2). */
export const MODE_INDICATOR: Record<Mode, number> = {
  numeric: 0b0001,
  alphanumeric: 0b0010,
  byte: 0b0100,
  kanji: 0b1000,
  eci: 0b0111,
};

/** Character count indicator lengths (Table 3) for versions 1–9, 10–26 and 27–40. */
const CHAR_COUNT_BITS: Record<Exclude<Mode, 'eci'>, readonly [number, number, number]> = {
  numeric: [10, 12, 14],
  alphanumeric: [9, 11, 13],
  byte: [8, 16, 16],
  kanji: [8, 10, 12],
};

export function versionGroup(version: number): 0 | 1 | 2 {
  return version <= 9 ? 0 : version <= 26 ? 1 : 2;
}

export function charCountBits(mode: Exclude<Mode, 'eci'>, version: number): number {
  return CHAR_COUNT_BITS[mode][versionGroup(version)];
}

/** The 45-character alphanumeric set (Table 5), index = value. */
export const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
