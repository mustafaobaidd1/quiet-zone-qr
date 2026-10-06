import { describe, expect, it } from 'vitest';
import alignmentRef from './fixtures/thonky-alignment.json';
import capacityRef from './fixtures/thonky-capacities.json';
import ecRef from './fixtures/thonky-ec-blocks.json';
import { getLayout, Role } from '../src/lib/qr/matrix';
import { dataBitLength } from '../src/lib/qr/segments';
import {
  alignmentPositions,
  blockLayout,
  charCountBits,
  dataCapacityBits,
  rawDataModules,
  remainderBits,
  symbolSize,
  type EcLevel,
} from '../src/lib/qr/tables';

describe('error correction block structure (ISO/IEC 18004 Table 9)', () => {
  it('reference table has all 160 version/level rows', () => {
    expect(ecRef.rows).toHaveLength(160);
  });

  for (const row of ecRef.rows) {
    it(`${row.version}-${row.level}`, () => {
      const b = blockLayout(row.version, row.level as EcLevel);
      expect(b.dataCodewords).toBe(row.totalDataCodewords);
      expect(b.ecCodewordsPerBlock).toBe(row.ecCodewordsPerBlock);
      expect(b.group1).toEqual({
        blocks: row.group1Blocks,
        dataCodewords: row.group1DataCodewords,
      });
      expect(b.group2).toEqual({
        blocks: row.group2Blocks,
        dataCodewords: row.group2DataCodewords,
      });
    });
  }
});

/** Largest character count of a mode that fits the data capacity (header included). */
function maxChars(
  mode: 'numeric' | 'alphanumeric' | 'byte' | 'kanji',
  version: number,
  level: EcLevel,
) {
  const cap = dataCapacityBits(version, level);
  const cc = charCountBits(mode, version);
  let n = 0;
  const bits = (k: number) => 4 + cc + (mode === 'kanji' ? 13 * k : dataBitLength(mode, k));
  while (bits(n + 1) <= cap && n + 1 < 1 << cc) n++;
  return n;
}

describe('character capacities (ISO/IEC 18004 Table 7)', () => {
  it('reference table has all 160 rows', () => {
    expect(capacityRef.rows).toHaveLength(160);
  });

  it('every capacity for numeric, alphanumeric, byte and kanji modes matches', () => {
    const mismatches: string[] = [];
    for (const r of capacityRef.rows) {
      const level = r.level as EcLevel;
      const got = {
        numeric: maxChars('numeric', r.version, level),
        alphanumeric: maxChars('alphanumeric', r.version, level),
        byte: maxChars('byte', r.version, level),
        kanji: maxChars('kanji', r.version, level),
      };
      for (const k of ['numeric', 'alphanumeric', 'byte', 'kanji'] as const) {
        if (got[k] !== r[k]) mismatches.push(`${r.version}-${r.level} ${k}: ${got[k]} ≠ ${r[k]}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('version 40-L holds 7089 digits, 4296 alphanumeric characters and 2953 bytes', () => {
    expect(maxChars('numeric', 40, 'L')).toBe(7089);
    expect(maxChars('alphanumeric', 40, 'L')).toBe(4296);
    expect(maxChars('byte', 40, 'L')).toBe(2953);
  });
});

describe('symbol geometry', () => {
  it('alignment pattern centres match Annex E for versions 2–40', () => {
    expect(Object.keys(alignmentRef.positions)).toHaveLength(39);
    for (const [v, pos] of Object.entries(alignmentRef.positions)) {
      expect(alignmentPositions(Number(v))).toEqual(pos);
    }
    expect(alignmentPositions(1)).toEqual([]);
  });

  it('sizes run 21 … 177', () => {
    expect(symbolSize(1)).toBe(21);
    expect(symbolSize(40)).toBe(177);
  });

  it('the zig-zag path visits exactly the raw data modules, and roles cover every module', () => {
    for (let v = 1; v <= 40; v++) {
      const layout = getLayout(v);
      expect(layout.path.length).toBe(rawDataModules(v));
      // Every non-path module has a function role.
      const onPath = new Set(layout.path);
      for (let i = 0; i < layout.size * layout.size; i++) {
        if (onPath.has(i)) expect(layout.isFunction[i]).toBe(0);
        else expect(layout.roles[i]).toBeGreaterThan(0);
      }
      const formatCount = layout.roles.filter((r) => r === Role.Format).length;
      expect(formatCount).toBe(30);
      expect(layout.roles.filter((r) => r === Role.Version).length).toBe(v >= 7 ? 36 : 0);
    }
  });

  it('remainder bits are 0, 7, 0, 3 or 4 depending on the version (Table 1)', () => {
    const expected: Record<number, number> = {
      1: 0,
      2: 7,
      6: 7,
      7: 0,
      14: 3,
      20: 3,
      21: 4,
      27: 4,
      28: 3,
      34: 3,
      35: 0,
      40: 0,
    };
    for (const [v, r] of Object.entries(expected)) expect(remainderBits(Number(v))).toBe(r);
  });
});
