import { describe, expect, it } from 'vitest';
import ref from './fixtures/thonky-format-version.json';
import { mulberry32 } from '../src/lib/damage/rng';
import {
  decodeFormatBits,
  decodeVersionBits,
  formatBits,
  popcount,
  toBinary,
  versionBits,
} from '../src/lib/qr/bch';
import type { EcLevel } from '../src/lib/qr/tables';

describe('format information (BCH 15,5)', () => {
  it('all 32 format strings match the specification table', () => {
    expect(ref.format).toHaveLength(32);
    for (const row of ref.format) {
      expect(
        toBinary(formatBits(row.level as EcLevel, row.mask), 15),
        `${row.level}${row.mask}`,
      ).toBe(row.bits);
    }
  });

  it('the code has minimum distance 7', () => {
    const all = ref.format.map((r) => Number.parseInt(r.bits, 2));
    let min = 99;
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) min = Math.min(min, popcount(all[i] ^ all[j]));
    expect(min).toBe(7);
  });

  it('corrects every pattern of up to 3 bit errors', () => {
    for (const row of ref.format) {
      const good = Number.parseInt(row.bits, 2);
      for (let a = 0; a < 15; a++) {
        for (let b = a; b < 15; b++) {
          for (let c = b; c < 15; c++) {
            const read = good ^ (1 << a) ^ (a === b ? 0 : 1 << b) ^ (b === c ? 0 : 1 << c);
            const d = decodeFormatBits(read);
            expect(d.ok).toBe(true);
            expect(d.value).toEqual({ level: row.level, mask: row.mask });
            expect(d.distance).toBe(popcount(read ^ good));
          }
        }
      }
    }
  });

  it('flags reads that are 4 or more bits from every codeword', () => {
    const rand = mulberry32(12);
    let failures = 0;
    for (let i = 0; i < 2000; i++) {
      const read = Math.floor(rand() * 32768);
      const d = decodeFormatBits(read);
      if (!d.ok) {
        failures++;
        expect(d.distance).toBeGreaterThanOrEqual(4);
      }
    }
    expect(failures).toBeGreaterThan(0);
  });
});

describe('version information (BCH 18,6)', () => {
  it('versions 7–40 match the specification table', () => {
    expect(Object.keys(ref.version)).toHaveLength(34);
    for (const [v, bits] of Object.entries(ref.version))
      expect(toBinary(versionBits(Number(v)), 18)).toBe(bits);
  });

  it('corrects up to 3 bit errors for every version', () => {
    const rand = mulberry32(3);
    for (let v = 7; v <= 40; v++) {
      for (let rep = 0; rep < 50; rep++) {
        let read = versionBits(v);
        const flips = 1 + Math.floor(rand() * 3);
        const used = new Set<number>();
        while (used.size < flips) used.add(Math.floor(rand() * 18));
        for (const b of used) read ^= 1 << b;
        const d = decodeVersionBits(read);
        expect(d.ok).toBe(true);
        expect(d.value).toBe(v);
      }
    }
  });

  it('rejects versions outside 7–40', () => {
    expect(() => versionBits(6)).toThrow();
    expect(() => versionBits(41)).toThrow();
  });
});
