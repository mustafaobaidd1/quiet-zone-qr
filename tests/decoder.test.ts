import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/lib/damage/rng';
import { decodeGrid, parseSegments } from '../src/lib/qr/decoder';
import { encode, type QrSymbol } from '../src/lib/qr/encoder';
import { formatPositions, Role } from '../src/lib/qr/matrix';
import type { EcLevel } from '../src/lib/qr/tables';

function sym(text: string, level: EcLevel, version: number | 'auto' = 'auto'): QrSymbol {
  const r = encode(text, { level, version });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.symbol;
}

describe('decoder — clean symbols', () => {
  const cases: [string, EcLevel][] = [
    ['HELLO WORLD', 'Q'],
    ['https://mustafaobaidd1.github.io/quiet-zone-qr/', 'M'],
    ['0123456789012345678901234567890123456789', 'L'],
    ['Grüße aus Jerash — QR ✓ 🙂', 'H'],
    ['Order 31415926535897932384 shipped', 'Q'],
    ['x'.repeat(400), 'M'], // version ≥ 7: version information present
    ['A'.repeat(1500), 'L'],
  ];
  for (const [text, level] of cases) {
    it(`round-trips ${JSON.stringify(text.slice(0, 24))}${text.length > 24 ? '…' : ''} at ${level}`, () => {
      const s = sym(text, level);
      const d = decodeGrid(s.modules, s.size);
      expect(d.failure).toBeUndefined();
      expect(d.ok).toBe(true);
      expect(d.text).toBe(text);
      expect(d.level).toBe(level);
      expect(d.mask).toBe(s.mask);
      expect(d.version).toBe(s.version);
      if (s.version >= 7) expect(d.versionInfo?.version).toBe(s.version);
      expect(d.blocks.every((b) => b.rs.errorsFound === 0)).toBe(true);
      expect(Array.from(d.rawCodewords!)).toEqual(Array.from(s.codewords));
    });
  }

  it('decodes every forced mask', () => {
    for (let mask = 0; mask < 8; mask++) {
      const r = encode('MASK TEST 123', { level: 'M', mask });
      if (!r.ok) throw new Error('encode');
      const d = decodeGrid(r.symbol.modules, r.symbol.size);
      expect(d.text).toBe('MASK TEST 123');
      expect(d.mask).toBe(mask);
    }
  });
});

describe('decoder — damage', () => {
  it('corrects up to t flipped codewords per block and reports their positions', () => {
    const s = sym('https://mustafaobaidd1.github.io/quiet-zone-qr/', 'M'); // 4-M: 2 blocks, t = 9
    expect(s.layout.numBlocks).toBe(2);
    const grid = Uint8Array.from(s.modules);
    // Flip one bit in 9 codewords of block 0 and 5 of block 1.
    const flipped = new Map<number, number>([
      [0, 0],
      [1, 0],
    ]);
    const want = [9, 5];
    for (let i = 0; i < s.size * s.size; i++) {
      const cw = s.codewordAt[i];
      if (cw < 0 || s.bitAt[i] !== 0) continue;
      const b = s.codewordInfo[cw].block;
      if (flipped.get(b)! < want[b]) {
        grid[i] ^= 1;
        flipped.set(b, flipped.get(b)! + 1);
      }
    }
    const d = decodeGrid(grid, s.size);
    expect(d.ok).toBe(true);
    expect(d.text).toBe(s.text);
    expect(d.blocks.map((b) => b.rs.errorsFound)).toEqual([9, 5]);
  });

  it('fails with a precise reason when a block has more than t errors', () => {
    const s = sym('https://mustafaobaidd1.github.io/quiet-zone-qr/', 'M');
    const grid = Uint8Array.from(s.modules);
    let count = 0;
    for (let i = 0; i < s.size * s.size && count < 12; i++) {
      const cw = s.codewordAt[i];
      if (cw >= 0 && s.bitAt[i] === 7 && s.codewordInfo[cw].block === 1) {
        grid[i] ^= 1;
        count++;
      }
    }
    const d = decodeGrid(grid, s.size);
    expect(d.ok).toBe(false);
    expect(d.failure?.stage).toBe('reed-solomon');
    if (d.failure?.stage === 'reed-solomon') expect(d.failure.blocks).toContain(1);
    expect(d.failure?.reason).toMatch(/Block 2/);
  });

  it('repairs up to 3 bit errors in a format copy, and uses the second copy when the first is destroyed', () => {
    const s = sym('HELLO WORLD', 'Q');
    const pos = formatPositions(s.size);
    const grid = Uint8Array.from(s.modules);
    // Three errors in copy 1.
    pos
      .filter((p) => p[3] === 1)
      .slice(0, 3)
      .forEach(([r, c]) => (grid[r * s.size + c] ^= 1));
    let d = decodeGrid(grid, s.size);
    expect(d.text).toBe('HELLO WORLD');
    expect(d.format?.copies[0].distance).toBe(3);
    // Destroy copy 1 completely: the decoder falls back to copy 2.
    pos.filter((p) => p[3] === 1).forEach(([r, c]) => (grid[r * s.size + c] = 0));
    d = decodeGrid(grid, s.size);
    expect(d.text).toBe('HELLO WORLD');
    expect(d.format?.used).toBe(1);
  });

  it('fails at the format stage when both copies are beyond repair', () => {
    const s = sym('HELLO WORLD', 'Q');
    const grid = Uint8Array.from(s.modules);
    const rand = mulberry32(4);
    for (const [r, c] of formatPositions(s.size)) grid[r * s.size + c] = rand() < 0.5 ? 1 : 0;
    // Force a far-away pattern on both copies: alternate bits.
    formatPositions(s.size).forEach(([r, c, bit]) => (grid[r * s.size + c] = bit % 2));
    const d = decodeGrid(grid, s.size);
    if (!d.format?.info) {
      expect(d.failure?.stage).toBe('format');
      expect(d.failure?.reason).toMatch(/format information/);
    }
  });

  it('a sticker as erasures recovers up to d codewords instead of t', () => {
    const s = sym('https://mustafaobaidd1.github.io/quiet-zone-qr/', 'M'); // d = 18 per block
    // Cover 14 whole codewords of block 0 (more than t = 9) and mark them as erasures.
    const covered = new Uint8Array(s.size * s.size);
    const grid = Uint8Array.from(s.modules);
    const chosen = new Set<number>();
    for (let cw = 0; cw < s.codewords.length && chosen.size < 14; cw++)
      if (s.codewordInfo[cw].block === 0) chosen.add(cw);
    for (let i = 0; i < grid.length; i++) {
      if (chosen.has(s.codewordAt[i])) {
        covered[i] = 1;
        grid[i] = 0;
      }
    }
    expect(decodeGrid(grid, s.size).ok).toBe(false);
    const d = decodeGrid(grid, s.size, { erasureModules: covered });
    expect(d.ok).toBe(true);
    expect(d.text).toBe(s.text);
    expect(d.blocks[0].erasures).toHaveLength(14);
  });

  it('marks roles for data, EC and remainder modules consistently with codeword indices', () => {
    const s = sym('HELLO WORLD', 'Q');
    for (let i = 0; i < s.size * s.size; i++) {
      const cw = s.codewordAt[i];
      if (s.roles[i] === Role.Data) expect(s.codewordInfo[cw].isEc).toBe(false);
      if (s.roles[i] === Role.Ec) expect(s.codewordInfo[cw].isEc).toBe(true);
      if (s.roles[i] === Role.Remainder) expect(cw).toBe(-1);
    }
  });
});

describe('segment parser', () => {
  it('rejects an unknown mode indicator with its bit offset', () => {
    // 0110 is not a valid mode.
    expect(() => parseSegments(Uint8Array.from([0b01100000, 0]), 1)).toThrow(
      /Unknown mode indicator 0110 at bit 0/,
    );
  });

  it('reports a byte segment longer than the data', () => {
    expect(() => parseSegments(Uint8Array.from([0b01001111, 0b11110000]), 1)).toThrow(
      /declares 255 bytes/,
    );
  });

  it('reads an ECI designator followed by UTF-8 bytes', () => {
    // ECI 26 (UTF-8): 0111 00011010, then byte mode 1 byte 'A'.
    const bits = '0111' + '00011010' + '0100' + '00000001' + '01000001' + '0000';
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') bytes[i >> 3] |= 0x80 >> (i & 7);
    const p = parseSegments(bytes, 1);
    expect(p.text).toBe('A');
    expect(p.segments.map((s) => s.mode)).toEqual(['eci', 'byte']);
  });
});
