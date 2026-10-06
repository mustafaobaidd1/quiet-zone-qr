/**
 * QR code decoder working from a module grid (ISO/IEC 18004 §12, steps after sampling):
 * format information (BCH) → version information (BCH, v ≥ 7) → unmask → zig-zag read →
 * de-interleave → Reed–Solomon per block → parse segments → text.
 *
 * It reads modules directly, so it does not locate finder patterns in a camera image; damage to
 * finder or timing patterns does not stop it the way it could stop a phone camera.
 */

import { decodeFormatBits, decodeVersionBits, type BchDecode, type FormatInfo } from './bch';
import { formatPositions, getLayout, maskBit, readCodewords, versionPositions } from './matrix';
import { rsDecode, type RsDecodeResult } from './reedSolomon';
import {
  ALPHANUMERIC_CHARSET,
  blockLayout,
  charCountBits,
  totalCodewords,
  versionFromSize,
  type BlockLayout,
  type EcLevel,
} from './tables';

export interface FormatReading {
  copies: [BchDecode<FormatInfo>, BchDecode<FormatInfo>];
  /** Which copy was used (0 or 1), or −1 when neither decoded. */
  used: number;
  info: FormatInfo | null;
}

export interface VersionReading {
  copies: [BchDecode<number>, BchDecode<number>];
  used: number;
  version: number | null;
  /** True when the decoded version disagrees with the symbol size. */
  mismatch: boolean;
}

export interface BlockReport {
  index: number;
  dataCount: number;
  ecCount: number;
  /** t = ⌊d/2⌋: errors this block can correct when there are no erasures. */
  capacity: number;
  received: Uint8Array;
  /** Codewords (indices into the final sequence) of this block, in block order. */
  sequenceIndices: number[];
  erasures: number[];
  rs: RsDecodeResult;
}

export interface DecodedSegment {
  mode: 'numeric' | 'alphanumeric' | 'byte' | 'kanji' | 'eci' | 'fnc1' | 'structured-append';
  text: string;
  /** Bit offset of the mode indicator in the data stream. */
  bitOffset: number;
  count: number;
}

export type DecodeFailure =
  | { stage: 'size'; reason: string }
  | { stage: 'format'; reason: string }
  | { stage: 'reed-solomon'; reason: string; blocks: number[] }
  | { stage: 'segments'; reason: string };

export interface DecodeReport {
  ok: boolean;
  size: number;
  version: number | null;
  format: FormatReading | null;
  versionInfo: VersionReading | null;
  level: EcLevel | null;
  mask: number | null;
  layout: BlockLayout | null;
  /** Codewords read from the grid in placement order (before correction). */
  rawCodewords: Uint8Array | null;
  /** For each codeword of the sequence: [block, index in block]. */
  sequenceMap: [number, number][];
  blocks: BlockReport[];
  /** Corrected data codewords, concatenated in block order. */
  data: Uint8Array | null;
  segments: DecodedSegment[];
  text: string | null;
  /** Byte-mode payload bytes (for exact comparisons with non-UTF-8 data). */
  bytes: Uint8Array | null;
  failure?: DecodeFailure;
  warnings: string[];
}

export interface DecodeOptions {
  /** Modules known to be unreadable (e.g. under a sticker): their codewords become erasures. */
  erasureModules?: Uint8Array;
}

function readBits(
  grid: Uint8Array,
  size: number,
  positions: [number, number, number, number][],
  copy: number,
): number {
  let v = 0;
  for (const [r, c, bit, cp] of positions) if (cp === copy && grid[r * size + c]) v |= 1 << bit;
  return v;
}

export function readFormat(grid: Uint8Array, size: number): FormatReading {
  const pos = formatPositions(size);
  const copies: [BchDecode<FormatInfo>, BchDecode<FormatInfo>] = [
    decodeFormatBits(readBits(grid, size, pos, 1)),
    decodeFormatBits(readBits(grid, size, pos, 2)),
  ];
  let used = -1;
  if (copies[0].ok && (!copies[1].ok || copies[0].distance <= copies[1].distance)) used = 0;
  else if (copies[1].ok) used = 1;
  return { copies, used, info: used >= 0 ? copies[used].value : null };
}

export function readVersion(grid: Uint8Array, size: number, expected: number): VersionReading {
  const pos = versionPositions(size);
  const copies: [BchDecode<number>, BchDecode<number>] = [
    decodeVersionBits(readBits(grid, size, pos, 1)),
    decodeVersionBits(readBits(grid, size, pos, 2)),
  ];
  let used = -1;
  if (copies[0].ok && (!copies[1].ok || copies[0].distance <= copies[1].distance)) used = 0;
  else if (copies[1].ok) used = 1;
  const version = used >= 0 ? copies[used].value : null;
  return { copies, used, version, mismatch: version !== null && version !== expected };
}

class BitReader {
  private pos = 0;
  constructor(private readonly bytes: Uint8Array) {}
  get offset() {
    return this.pos;
  }
  get remaining() {
    return this.bytes.length * 8 - this.pos;
  }
  read(n: number): number {
    if (n > this.remaining) throw new RangeError('read past end');
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.bytes[(this.pos + i) >> 3];
      v = (v << 1) | ((byte >> (7 - ((this.pos + i) & 7))) & 1);
    }
    this.pos += n;
    return v >>> 0;
  }
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const latin1 = new TextDecoder('iso-8859-1');

function decodeBytes(bytes: Uint8Array, eci: number | null): string {
  if (eci === 26 || eci === null) {
    try {
      return utf8.decode(bytes);
    } catch {
      return latin1.decode(bytes);
    }
  }
  if (eci === 3 || eci === 1) return latin1.decode(bytes);
  if (eci === 20) {
    try {
      return new TextDecoder('shift_jis').decode(bytes);
    } catch {
      return latin1.decode(bytes);
    }
  }
  try {
    return utf8.decode(bytes);
  } catch {
    return latin1.decode(bytes);
  }
}

export interface ParsedData {
  segments: DecodedSegment[];
  text: string;
  bytes: Uint8Array;
}

/** Parse the data codeword stream into segments (§7.4). Throws with a precise reason. */
export function parseSegments(data: Uint8Array, version: number): ParsedData {
  const reader = new BitReader(data);
  const segments: DecodedSegment[] = [];
  const allBytes: number[] = [];
  let text = '';
  let eci: number | null = null;
  while (reader.remaining >= 4) {
    const offset = reader.offset;
    const mode = reader.read(4);
    if (mode === 0) break; // terminator
    switch (mode) {
      case 0b0001: {
        const count = reader.read(charCountBits('numeric', version));
        let s = '';
        let left = count;
        while (left > 0) {
          const take = Math.min(3, left);
          const width = [0, 4, 7, 10][take];
          if (reader.remaining < width)
            throw new Error(`Numeric segment at bit ${offset} runs past the end of the data`);
          const v = reader.read(width);
          if (v >= 10 ** take)
            throw new Error(
              `Numeric group value ${v} at bit ${reader.offset - width} is not a ${take}-digit number`,
            );
          s += String(v).padStart(take, '0');
          left -= take;
        }
        segments.push({ mode: 'numeric', text: s, bitOffset: offset, count });
        text += s;
        for (const ch of s) allBytes.push(ch.charCodeAt(0));
        break;
      }
      case 0b0010: {
        const count = reader.read(charCountBits('alphanumeric', version));
        let s = '';
        let left = count;
        while (left > 0) {
          const width = left >= 2 ? 11 : 6;
          if (reader.remaining < width)
            throw new Error(`Alphanumeric segment at bit ${offset} runs past the end of the data`);
          const v = reader.read(width);
          if (left >= 2) {
            const a = Math.floor(v / 45);
            const b = v % 45;
            if (a >= 45)
              throw new Error(
                `Alphanumeric pair value ${v} at bit ${reader.offset - width} is out of range`,
              );
            s += ALPHANUMERIC_CHARSET[a] + ALPHANUMERIC_CHARSET[b];
            left -= 2;
          } else {
            if (v >= 45)
              throw new Error(
                `Alphanumeric value ${v} at bit ${reader.offset - width} is out of range`,
              );
            s += ALPHANUMERIC_CHARSET[v];
            left -= 1;
          }
        }
        segments.push({ mode: 'alphanumeric', text: s, bitOffset: offset, count });
        text += s;
        for (const ch of s) allBytes.push(ch.charCodeAt(0));
        break;
      }
      case 0b0100: {
        const count = reader.read(charCountBits('byte', version));
        if (reader.remaining < count * 8)
          throw new Error(
            `Byte segment at bit ${offset} declares ${count} bytes but only ${Math.floor(reader.remaining / 8)} remain`,
          );
        const bytes = new Uint8Array(count);
        for (let i = 0; i < count; i++) bytes[i] = reader.read(8);
        const s = decodeBytes(bytes, eci);
        segments.push({ mode: 'byte', text: s, bitOffset: offset, count });
        text += s;
        allBytes.push(...bytes);
        break;
      }
      case 0b1000: {
        const count = reader.read(charCountBits('kanji', version));
        const bytes: number[] = [];
        for (let i = 0; i < count; i++) {
          if (reader.remaining < 13)
            throw new Error(`Kanji segment at bit ${offset} runs past the end of the data`);
          const v = reader.read(13);
          let w = Math.floor(v / 0xc0) * 0x100 + (v % 0xc0);
          w += w < 0x1f00 ? 0x8140 : 0xc140;
          bytes.push(w >> 8, w & 0xff);
        }
        let s: string;
        try {
          s = new TextDecoder('shift_jis').decode(Uint8Array.from(bytes));
        } catch {
          s = '�'.repeat(count);
        }
        segments.push({ mode: 'kanji', text: s, bitOffset: offset, count });
        text += s;
        allBytes.push(...bytes);
        break;
      }
      case 0b0111: {
        // ECI designator: 1, 2 or 3 bytes depending on the leading bits.
        const first = reader.read(8);
        let value: number;
        if ((first & 0x80) === 0) value = first & 0x7f;
        else if ((first & 0xc0) === 0x80) value = ((first & 0x3f) << 8) | reader.read(8);
        else if ((first & 0xe0) === 0xc0) value = ((first & 0x1f) << 16) | reader.read(16);
        else throw new Error(`Invalid ECI designator at bit ${offset}`);
        eci = value;
        segments.push({ mode: 'eci', text: '', bitOffset: offset, count: value });
        break;
      }
      case 0b0011: {
        // Structured append header: symbol position, total and parity (16 bits).
        reader.read(16);
        segments.push({ mode: 'structured-append', text: '', bitOffset: offset, count: 0 });
        break;
      }
      case 0b0101:
        segments.push({ mode: 'fnc1', text: '', bitOffset: offset, count: 0 });
        break;
      case 0b1001:
        reader.read(8);
        segments.push({ mode: 'fnc1', text: '', bitOffset: offset, count: 0 });
        break;
      default:
        throw new Error(
          `Unknown mode indicator ${mode.toString(2).padStart(4, '0')} at bit ${offset}`,
        );
    }
  }
  return { segments, text, bytes: Uint8Array.from(allBytes) };
}

/** For each codeword in the final sequence: [block, index within block]. */
export function sequenceMap(layout: BlockLayout): [number, number][] {
  const map: [number, number][] = [];
  const maxData = Math.max(...layout.dataPerBlock);
  for (let i = 0; i < maxData; i++) {
    for (let b = 0; b < layout.numBlocks; b++) if (i < layout.dataPerBlock[b]) map.push([b, i]);
  }
  for (let i = 0; i < layout.ecCodewordsPerBlock; i++) {
    for (let b = 0; b < layout.numBlocks; b++) map.push([b, layout.dataPerBlock[b] + i]);
  }
  return map;
}

/** Decode a square module grid (1 = dark, row-major, no quiet zone). */
export function decodeGrid(
  grid: Uint8Array,
  size: number,
  options: DecodeOptions = {},
): DecodeReport {
  const report: DecodeReport = {
    ok: false,
    size,
    version: null,
    format: null,
    versionInfo: null,
    level: null,
    mask: null,
    layout: null,
    rawCodewords: null,
    sequenceMap: [],
    blocks: [],
    data: null,
    segments: [],
    text: null,
    bytes: null,
    warnings: [],
  };
  const version = versionFromSize(size);
  if (version === null || grid.length !== size * size) {
    report.failure = {
      stage: 'size',
      reason: `${size}×${size} is not a QR code size (21, 25, …, 177)`,
    };
    return report;
  }
  report.version = version;

  const format = readFormat(grid, size);
  report.format = format;
  if (!format.info) {
    const d = format.copies.map((c) => c.distance);
    report.failure = {
      stage: 'format',
      reason: `Both copies of the format information are damaged beyond repair (${d[0]} and ${d[1]} bit errors; at most 3 can be corrected)`,
    };
    return report;
  }
  const { level, mask } = format.info;
  report.level = level;
  report.mask = mask;

  if (version >= 7) {
    const vr = readVersion(grid, size, version);
    report.versionInfo = vr;
    if (vr.version === null) {
      report.warnings.push(
        'Version information unreadable; using the version implied by the symbol size',
      );
    } else if (vr.mismatch) {
      report.warnings.push(
        `Version information says ${vr.version}, but the symbol size implies ${version}`,
      );
    }
  }

  const geometry = getLayout(version);
  const unmasked = Uint8Array.from(grid);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      if (!geometry.isFunction[i] && maskBit(mask, r, c)) unmasked[i] ^= 1;
    }
  }
  const raw = readCodewords(geometry, unmasked);
  report.rawCodewords = raw;

  const layout = blockLayout(version, level);
  report.layout = layout;
  const map = sequenceMap(layout);
  report.sequenceMap = map;

  // Which codewords are erasures (any of their 8 modules flagged)?
  const erasedSeq = new Set<number>();
  if (options.erasureModules) {
    const { path } = geometry;
    const total = totalCodewords(version);
    for (let k = 0; k < total * 8; k++) if (options.erasureModules[path[k]]) erasedSeq.add(k >> 3);
  }

  const perBlock: { received: number[]; seq: number[] }[] = layout.dataPerBlock.map(() => ({
    received: [],
    seq: [],
  }));
  map.forEach(([b, idx], seqIndex) => {
    perBlock[b].received[idx] = raw[seqIndex];
    perBlock[b].seq[idx] = seqIndex;
  });

  const failed: number[] = [];
  const data: number[] = [];
  perBlock.forEach((pb, b) => {
    const received = Uint8Array.from(pb.received);
    const erasures = pb.seq.flatMap((s, idx) => (erasedSeq.has(s) ? [idx] : []));
    const rs = rsDecode(received, layout.ecCodewordsPerBlock, erasures);
    report.blocks.push({
      index: b,
      dataCount: layout.dataPerBlock[b],
      ecCount: layout.ecCodewordsPerBlock,
      capacity: Math.floor(layout.ecCodewordsPerBlock / 2),
      received,
      sequenceIndices: pb.seq,
      erasures,
      rs,
    });
    if (!rs.ok) failed.push(b);
    data.push(...rs.corrected.slice(0, layout.dataPerBlock[b]));
  });

  if (failed.length) {
    const first = report.blocks[failed[0]];
    report.failure = {
      stage: 'reed-solomon',
      blocks: failed,
      reason: `Block ${failed[0] + 1}: ${first.rs.reason ?? 'uncorrectable'}`,
    };
    return report;
  }

  report.data = Uint8Array.from(data);
  try {
    const parsed = parseSegments(report.data, version);
    report.segments = parsed.segments;
    report.text = parsed.text;
    report.bytes = parsed.bytes;
    report.ok = true;
  } catch (err) {
    report.failure = { stage: 'segments', reason: (err as Error).message };
  }
  return report;
}
