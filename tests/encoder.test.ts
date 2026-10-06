import { describe, expect, it } from 'vitest';
import { toBinary } from '../src/lib/qr/bch';
import { encode, type QrSymbol } from '../src/lib/qr/encoder';
import { optimalSegments, segmentsBitLength } from '../src/lib/qr/segments';
import type { EcLevel } from '../src/lib/qr/tables';

function ok(
  text: string,
  level: EcLevel,
  extra: Parameters<typeof encode>[1] extends infer O ? Partial<O> : never = {},
): QrSymbol {
  const r = encode(text, { level, ...extra });
  if (!r.ok) throw new Error(`encode failed: ${JSON.stringify(r.error)}`);
  return r.symbol;
}

const hex = (s: string) => s.split(/\s+/).map((h) => Number.parseInt(h, 16));

describe('encoder — published examples', () => {
  it('HELLO WORLD at Q: version 1, alphanumeric, Thonky’s 13 data codewords and 13 EC codewords', () => {
    const s = ok('HELLO WORLD', 'Q');
    expect(s.version).toBe(1);
    expect(s.segments.map((g) => g.mode)).toEqual(['alphanumeric']);
    // Bit stream from https://www.thonky.com/qr-code-tutorial/data-encoding
    expect(Array.from(s.dataCodewords)).toEqual([
      32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236,
    ]);
    expect(Array.from(s.blocks[0].ec)).toEqual([
      168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16,
    ]);
  });

  it('HELLO WORLD 1-Q chooses mask 6 (penalty 314, next best mask 0 at 347) and format 010111011011010', () => {
    const s = ok('HELLO WORLD', 'Q');
    const totals = s.penalties.map((p) => p.total);
    expect(s.mask).toBe(6);
    expect(totals[6]).toBe(314);
    expect(totals[0]).toBe(347);
    expect(Math.min(...totals.filter((_, i) => i !== 6))).toBe(347);
    expect(toBinary(s.formatBits, 15)).toBe('010111011011010');
  });

  it('HELLO WORLD at M: version 1, 16 data codewords and 10 EC codewords (Thonky)', () => {
    const s = ok('HELLO WORLD', 'M');
    expect(s.version).toBe(1);
    expect(Array.from(s.dataCodewords)).toEqual([
      32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17,
    ]);
    expect(Array.from(s.blocks[0].ec)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('“’Twas brillig” in byte mode at M reproduces Wikiversity’s 1-M symbol data', () => {
    const s = ok("'Twas brillig", 'M', { mode: 'byte' });
    expect(s.version).toBe(1);
    expect(Array.from(s.dataCodewords)).toEqual(
      hex('40 d2 75 47 76 17 32 06 27 26 96 c6 c6 96 70 ec'),
    );
    expect(Array.from(s.blocks[0].ec)).toEqual(hex('bc 2a 90 13 6b af ef fd 4b e0'));
  });

  it('version 5-Q interleaves four blocks exactly like Thonky’s worked example', () => {
    // Reconstruct the 62 data codewords from Thonky's four blocks and check the final message.
    const blocks = [
      [67, 85, 70, 134, 87, 38, 85, 194, 119, 50, 6, 18, 6, 103, 38],
      [246, 246, 66, 7, 118, 134, 242, 7, 38, 86, 22, 198, 199, 146, 6],
      [182, 230, 247, 119, 50, 7, 118, 134, 87, 38, 82, 6, 134, 151, 50, 7],
      [70, 247, 118, 86, 194, 6, 151, 50, 224, 236, 17, 236, 17, 236, 17, 236],
    ];
    const bytes = blocks.flat();
    // The data stream is a byte-mode segment; decode its text and re-encode it through our encoder.
    const count = ((bytes[0] & 0x0f) << 4) | (bytes[1] >> 4);
    const payload: number[] = [];
    for (let i = 0; i < count; i++)
      payload.push(((bytes[1 + i] & 0x0f) << 4) | (bytes[2 + i] >> 4));
    const text = new TextDecoder().decode(Uint8Array.from(payload));
    const s = ok(text, 'Q', { mode: 'byte', version: 5 });
    expect(Array.from(s.dataCodewords)).toEqual(bytes);
    const finalData = [
      67, 246, 182, 70, 85, 246, 230, 247, 70, 66, 247, 118, 134, 7, 119, 86, 87, 118, 50, 194, 38,
      134, 7, 6, 85, 242, 118, 151, 194, 7, 134, 50, 119, 38, 87, 224, 50, 86, 38, 236, 6, 22, 82,
      17, 18, 198, 6, 236, 6, 199, 134, 17, 103, 146, 151, 236, 38, 6, 50, 17, 7, 236,
    ];
    const finalEc = [
      213, 87, 148, 140, 199, 204, 116, 100, 11, 96, 177, 250, 45, 60, 212, 247, 115, 202, 76, 108,
      247, 182, 133, 131, 241, 124, 75, 37, 223, 157, 242, 104, 229, 200, 238, 253, 248, 134, 76,
      113, 154, 27, 195, 111, 117, 129, 230, 235, 154, 209, 189, 197, 111, 17, 10, 83, 86, 163, 108,
      6, 161, 163, 240, 205, 111, 120, 192, 89, 39, 133, 141, 74,
    ];
    expect(Array.from(s.codewords)).toEqual([...finalData, ...finalEc]);
  });
});

describe('encoder — modes and versions', () => {
  it('picks numeric for digits, alphanumeric for upper-case text, byte for the rest', () => {
    expect(ok('0123456789', 'M').segments.map((g) => g.mode)).toEqual(['numeric']);
    expect(ok('HTTPS://EXAMPLE.COM/A-B', 'M').segments.map((g) => g.mode)).toEqual([
      'alphanumeric',
    ]);
    expect(ok('hello', 'M').segments.map((g) => g.mode)).toEqual(['byte']);
  });

  it('splits into cheaper segments when a long run of digits follows text', () => {
    const s = ok('Order 31415926535897932384', 'M');
    expect(s.segments.map((g) => g.mode)).toEqual(['byte', 'numeric']);
    expect(s.segments.map((g) => g.text)).toEqual(['Order ', '31415926535897932384']);
  });

  it('optimal segmentation is never longer than any single-mode encoding', () => {
    const samples = [
      'ABC123def456',
      'a1234567890123b',
      'HELLO world 2026',
      'ÄÖÜ 12345678 XYZ',
      '000111ABC',
    ];
    for (const t of samples) {
      for (const v of [1, 10, 27]) {
        const opt = segmentsBitLength(optimalSegments(t, v), v)!;
        const byte = segmentsBitLength([{ mode: 'byte', text: t }], v)!;
        expect(opt).toBeLessThanOrEqual(byte);
      }
    }
  });

  it('chooses the smallest version that fits and respects a forced version', () => {
    expect(ok('https://mustafaobaidd1.github.io/quiet-zone-qr/', 'M').version).toBe(4);
    expect(ok('https://mustafaobaidd1.github.io/quiet-zone-qr/', 'M', { version: 9 }).version).toBe(
      9,
    );
    expect(ok('A', 'H').version).toBe(1);
  });

  it('counts UTF-8 bytes, not characters, in byte mode', () => {
    const s = ok('héllo ✓ 🙂', 'L', { mode: 'byte' });
    expect(s.segments[0].count).toBe(new TextEncoder().encode('héllo ✓ 🙂').length);
  });

  it('fills capacity exactly at version 40-L and rejects one more character', () => {
    expect(ok('a'.repeat(2953), 'L').version).toBe(40);
    const r = encode('a'.repeat(2954), { level: 'L' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('too-long');
    expect(ok('7'.repeat(7089), 'L').version).toBe(40);
    expect(encode('7'.repeat(7090), { level: 'L' }).ok).toBe(false);
  });

  it('suggests a lower level when the text only fits there', () => {
    const r = encode('a'.repeat(2000), { level: 'H' });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'too-long') expect(r.error.fitsAtLevel).toBe('L');
  });
});

describe('encoder — errors', () => {
  it('empty input', () => {
    const r = encode('', { level: 'M' });
    expect(r).toEqual({ ok: false, error: { kind: 'empty' } });
  });

  it('invalid character for a forced mode, with its position', () => {
    const r = encode('12a4', { level: 'M', mode: 'numeric' });
    expect(r).toEqual({
      ok: false,
      error: { kind: 'invalid-char', mode: 'numeric', char: 'a', index: 2 },
    });
    const r2 = encode('HELLO world', { level: 'M', mode: 'alphanumeric' });
    expect(r2.ok).toBe(false);
    if (!r2.ok && r2.error.kind === 'invalid-char') expect(r2.error.char).toBe('w');
  });

  it('forced version too small reports the minimum version', () => {
    const r = encode('https://mustafaobaidd1.github.io/quiet-zone-qr/', { level: 'M', version: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'version-too-small') expect(r.error.minVersion).toBe(4);
  });
});

describe('encoder — structure', () => {
  it('has a dark module and correct timing patterns', () => {
    const s = ok('HELLO WORLD', 'Q');
    const at = (r: number, c: number) => s.modules[r * s.size + c];
    expect(at(s.size - 8, 8)).toBe(1);
    for (let i = 8; i < s.size - 8; i++) {
      expect(at(6, i)).toBe(i % 2 === 0 ? 1 : 0);
      expect(at(i, 6)).toBe(i % 2 === 0 ? 1 : 0);
    }
  });

  it('places version information for versions 7 and up', () => {
    const s = ok('x'.repeat(150), 'M');
    expect(s.version).toBeGreaterThanOrEqual(7);
    expect(s.versionBits).not.toBeNull();
  });

  it('evaluates all eight masks and picks the lowest total when automatic', () => {
    const s = ok('Quiet zone', 'M');
    expect(s.penalties).toHaveLength(8);
    const min = Math.min(...s.penalties.map((p) => p.total));
    expect(s.penalties[s.mask].total).toBe(min);
    for (const p of s.penalties) expect(p.total).toBe(p.n1 + p.n2 + p.n3 + p.n4);
  });
});

describe('encoder — unpaired surrogates', () => {
  it('replaces a lone surrogate with U+FFFD so the decoded text matches the symbol text', async () => {
    const { decodeGrid } = await import('../src/lib/qr/decoder');
    const r = encode('moon \uD83C', { level: 'M' });
    if (!r.ok) throw new Error('encode');
    expect(r.symbol.text).toBe('moon \uFFFD');
    expect(decodeGrid(r.symbol.modules, r.symbol.size).text).toBe(r.symbol.text);
  });
});
