/**
 * QR code encoder (ISO/IEC 18004 §7): segments → bit stream → codewords → Reed–Solomon blocks →
 * interleaving → module placement → masking with penalty evaluation → format/version info.
 * Every intermediate result is kept so the interface can explain each step.
 */

import {
  encodeSegment,
  firstInvalidChar,
  optimalSegments,
  segmentsBitLength,
  singleSegment,
  utf8Bytes,
  type EncodableMode,
  type EncodedSegment,
  type Segment,
} from './segments';
import { rsEncode } from './reedSolomon';
import { formatBits, versionBits } from './bch';
import {
  applyMask,
  getLayout,
  penalty,
  placeCodewords,
  Role,
  writeFormat,
  type Layout,
  type Penalty,
} from './matrix';
import {
  blockLayout,
  dataCapacityBits,
  MAX_VERSION,
  MIN_VERSION,
  type BlockLayout,
  type EcLevel,
} from './tables';

export type ModeChoice = 'auto' | EncodableMode;

export interface EncodeOptions {
  level: EcLevel;
  mode?: ModeChoice;
  /** Fixed version, or 'auto' for the smallest that fits. */
  version?: number | 'auto';
  /** Fixed mask 0–7, or 'auto' for the lowest penalty. */
  mask?: number | 'auto';
}

export interface Block {
  index: number;
  data: Uint8Array;
  ec: Uint8Array;
}

export interface CodewordInfo {
  block: number;
  /** Index inside the block's codeword list (data first, then EC). */
  indexInBlock: number;
  isEc: boolean;
}

export interface QrSymbol {
  text: string;
  version: number;
  size: number;
  level: EcLevel;
  mask: number;
  maskChoice: 'auto' | 'fixed';
  segments: EncodedSegment[];
  /** Bits used by segments before terminator and padding. */
  segmentBits: number;
  capacityBits: number;
  /** Terminator zeros added (0–4) and zeros added to reach a byte boundary. */
  terminatorBits: number;
  byteAlignBits: number;
  /** Data codewords in order (after padding), before splitting into blocks. */
  dataCodewords: Uint8Array;
  /** How many of the data codewords are pad bytes (0xEC / 0x11). */
  padCodewords: number;
  layout: BlockLayout;
  blocks: Block[];
  /** Final interleaved codeword sequence placed in the symbol. */
  codewords: Uint8Array;
  /** Which block/position each codeword of the final sequence belongs to. */
  codewordInfo: CodewordInfo[];
  /** Final modules (1 = dark), row-major. */
  modules: Uint8Array;
  /** Modules after placement but before masking and format information. */
  unmasked: Uint8Array;
  roles: Uint8Array;
  /** Per module: index into `codewords`, or −1. */
  codewordAt: Int32Array;
  /** Per module: bit 7…0 within its codeword, or −1. */
  bitAt: Int8Array;
  penalties: Penalty[];
  formatBits: number;
  versionBits: number | null;
  geometry: Layout;
}

export type EncodeError =
  | { kind: 'empty' }
  | { kind: 'invalid-char'; mode: EncodableMode; char: string; index: number }
  | {
      kind: 'too-long';
      level: EcLevel;
      bits: number;
      capacityBits: number;
      fitsAtLevel: EcLevel | null;
    }
  | {
      kind: 'version-too-small';
      version: number;
      level: EcLevel;
      bits: number;
      capacityBits: number;
      minVersion: number | null;
    };

export type EncodeResult = { ok: true; symbol: QrSymbol } | { ok: false; error: EncodeError };

const PAD_BYTES = [0xec, 0x11];

function segmentsFor(text: string, mode: ModeChoice, version: number): Segment[] {
  return mode === 'auto' ? optimalSegments(text, version) : singleSegment(text, mode);
}

/** Smallest version (≥ from) that fits the text at the level, with its segments and bit count. */
function findVersion(
  text: string,
  mode: ModeChoice,
  level: EcLevel,
  from = MIN_VERSION,
): { version: number; segments: Segment[]; bits: number } | null {
  for (let v = from; v <= MAX_VERSION; v++) {
    const segs = segmentsFor(text, mode, v);
    const bits = segmentsBitLength(segs, v);
    if (bits !== null && bits <= dataCapacityBits(v, level))
      return { version: v, segments: segs, bits };
  }
  return null;
}

/** Replace unpaired UTF-16 surrogates (which have no UTF-8 encoding) with U+FFFD. */
export function wellFormed(text: string): string {
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    String.fromCharCode(0xfffd),
  );
}

export function encode(input: string, options: EncodeOptions): EncodeResult {
  const text = wellFormed(input);
  const level = options.level;
  const mode = options.mode ?? 'auto';
  if (text.length === 0) return { ok: false, error: { kind: 'empty' } };

  if (mode !== 'auto') {
    const bad = firstInvalidChar(text, mode);
    if (bad) return { ok: false, error: { kind: 'invalid-char', mode, ...bad } };
  }

  let chosen: { version: number; segments: Segment[]; bits: number } | null;
  if (options.version === undefined || options.version === 'auto') {
    chosen = findVersion(text, mode, level);
    if (!chosen) {
      const segs = segmentsFor(text, mode, MAX_VERSION);
      const bits = segmentsBitLength(segs, MAX_VERSION) ?? Number.POSITIVE_INFINITY;
      const fitsAtLevel =
        (['L', 'M', 'Q', 'H'] as EcLevel[]).find((l) => findVersion(text, mode, l) !== null) ??
        null;
      return {
        ok: false,
        error: {
          kind: 'too-long',
          level,
          bits,
          capacityBits: dataCapacityBits(MAX_VERSION, level),
          fitsAtLevel,
        },
      };
    }
  } else {
    const v = options.version;
    const segs = segmentsFor(text, mode, v);
    const bits = segmentsBitLength(segs, v);
    if (bits === null || bits > dataCapacityBits(v, level)) {
      const min = findVersion(text, mode, level);
      return {
        ok: false,
        error: {
          kind: 'version-too-small',
          version: v,
          level,
          bits: bits ?? Number.POSITIVE_INFINITY,
          capacityBits: dataCapacityBits(v, level),
          minVersion: min ? min.version : null,
        },
      };
    }
    chosen = { version: v, segments: segs, bits };
  }

  return {
    ok: true,
    symbol: build(text, chosen.version, level, chosen.segments, options.mask ?? 'auto'),
  };
}

function build(
  text: string,
  version: number,
  level: EcLevel,
  segs: Segment[],
  maskOption: number | 'auto',
): QrSymbol {
  const segments = segs.map((s) => encodeSegment(s, version));
  const capacityBits = dataCapacityBits(version, level);
  let bits = segments.flatMap((s) => s.chunks.map((c) => c.bits)).join('');
  const segmentBits = bits.length;
  const terminatorBits = Math.min(4, capacityBits - bits.length);
  bits += '0'.repeat(terminatorBits);
  const byteAlignBits = (8 - (bits.length % 8)) % 8;
  bits += '0'.repeat(byteAlignBits);

  const totalData = capacityBits / 8;
  const dataCodewords = new Uint8Array(totalData);
  const used = bits.length / 8;
  for (let i = 0; i < used; i++)
    dataCodewords[i] = Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  for (let i = used; i < totalData; i++) dataCodewords[i] = PAD_BYTES[(i - used) % 2];

  // Split into blocks and add Reed–Solomon codewords.
  const layout = blockLayout(version, level);
  const blocks: Block[] = [];
  let offset = 0;
  layout.dataPerBlock.forEach((len, index) => {
    const data = dataCodewords.slice(offset, offset + len);
    offset += len;
    blocks.push({ index, data, ec: rsEncode(data, layout.ecCodewordsPerBlock) });
  });

  // Interleave: data codewords column by column across blocks, then EC codewords likewise.
  const codewords = new Uint8Array(layout.totalCodewords);
  const codewordInfo: CodewordInfo[] = [];
  let k = 0;
  const maxData = Math.max(...layout.dataPerBlock);
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) {
      if (i < b.data.length) {
        codewords[k++] = b.data[i];
        codewordInfo.push({ block: b.index, indexInBlock: i, isEc: false });
      }
    }
  }
  for (let i = 0; i < layout.ecCodewordsPerBlock; i++) {
    for (const b of blocks) {
      codewords[k++] = b.ec[i];
      codewordInfo.push({ block: b.index, indexInBlock: b.data.length + i, isEc: true });
    }
  }

  const geometry = getLayout(version);
  const { size } = geometry;
  const placement = placeCodewords(geometry, codewords);

  const roles = Uint8Array.from(geometry.roles);
  for (const i of geometry.path) {
    const cw = placement.codewordAt[i];
    roles[i] = cw < 0 ? Role.Remainder : codewordInfo[cw].isEc ? Role.Ec : Role.Data;
  }

  // Evaluate all eight masks with their format information in place.
  const penalties: Penalty[] = [];
  const candidates: Uint8Array[] = [];
  for (let mask = 0; mask < 8; mask++) {
    const m = Uint8Array.from(placement.unmasked);
    applyMask(m, geometry, mask);
    writeFormat(m, size, level, mask);
    penalties.push(penalty(m, size, mask));
    candidates.push(m);
  }
  let mask: number;
  if (maskOption === 'auto') {
    mask = 0;
    for (let i = 1; i < 8; i++) if (penalties[i].total < penalties[mask].total) mask = i;
  } else {
    mask = maskOption;
  }

  return {
    text,
    version,
    size,
    level,
    mask,
    maskChoice: maskOption === 'auto' ? 'auto' : 'fixed',
    segments,
    segmentBits,
    capacityBits,
    terminatorBits,
    byteAlignBits,
    dataCodewords,
    padCodewords: totalData - used,
    layout,
    blocks,
    codewords,
    codewordInfo,
    modules: candidates[mask],
    unmasked: placement.unmasked,
    roles,
    codewordAt: placement.codewordAt,
    bitAt: placement.bitAt,
    penalties,
    formatBits: formatBits(level, mask),
    versionBits: version >= 7 ? versionBits(version) : null,
    geometry,
  };
}

/** Byte length of the text in UTF-8 (what byte mode counts). */
export function utf8Length(text: string): number {
  return utf8Bytes(text).length;
}
