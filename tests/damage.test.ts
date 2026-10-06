import { describe, expect, it } from 'vitest';
import { analyse, blockModules } from '../src/lib/damage/analysis';
import { applyDamage, strokeCells, tearFromPoint, type DamageOp } from '../src/lib/damage/damage';
import { generatorPolynomial } from '../src/lib/qr/gf256';
import { encode, type QrSymbol } from '../src/lib/qr/encoder';
import type { EcLevel } from '../src/lib/qr/tables';

const URL = 'https://mustafaobaidd1.github.io/quiet-zone-qr/';

function sym(text: string, level: EcLevel, version: number | 'auto' = 'auto'): QrSymbol {
  const r = encode(text, { level, version });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.symbol;
}

/** XOR a value into one codeword of a block, by flipping the matching modules of the grid. */
function xorCodeword(
  s: QrSymbol,
  grid: Uint8Array,
  block: number,
  indexInBlock: number,
  value: number,
) {
  const seq = s.codewordInfo.findIndex((c) => c.block === block && c.indexInBlock === indexInBlock);
  for (let bit = 0; bit < 8; bit++) {
    if ((value >> (7 - bit)) & 1) grid[s.geometry.path[seq * 8 + bit]] ^= 1;
  }
}

describe('damage operations', () => {
  const s = sym(URL, 'M');

  it('a scratch flips each module it touches exactly once; the same stroke twice cancels', () => {
    const stroke: DamageOp = { kind: 'scratch', points: [0.2, 0.5, 0.8, 0.5], radius: 0.02 };
    const once = applyDamage(s.modules, s.size, [stroke]);
    const cells = strokeCells(stroke.points, stroke.radius, s.size);
    expect(once.changedCount).toBe(cells.length);
    expect(cells.length).toBeGreaterThan(10);
    const twice = applyDamage(s.modules, s.size, [stroke, stroke]);
    expect(twice.changedCount).toBe(0);
  });

  it('the eraser only turns modules light', () => {
    const d = applyDamage(s.modules, s.size, [
      { kind: 'erase', points: [0.1, 0.1, 0.9, 0.9], radius: 0.05 },
    ]);
    for (let i = 0; i < d.modules.length; i++) if (d.changed[i]) expect(s.modules[i]).toBe(1);
    expect(d.changedCount).toBeGreaterThan(0);
  });

  it('a sticker hides the modules under it and records them for erasure decoding', () => {
    const d = applyDamage(s.modules, s.size, [
      { kind: 'sticker', x: 0.35, y: 0.35, w: 0.3, h: 0.3 },
    ]);
    const hidden = d.sticker.reduce((n, v) => n + v, 0);
    expect(hidden).toBeGreaterThan(80);
    for (let i = 0; i < d.modules.length; i++) if (d.sticker[i]) expect(d.modules[i]).toBe(0);
  });

  it('noise with p = 0 changes nothing and p = 1 flips every module', () => {
    expect(applyDamage(s.modules, s.size, [{ kind: 'noise', p: 0, seed: 1 }]).changedCount).toBe(0);
    expect(applyDamage(s.modules, s.size, [{ kind: 'noise', p: 1, seed: 1 }]).changedCount).toBe(
      s.size * s.size,
    );
    const some = applyDamage(s.modules, s.size, [{ kind: 'noise', p: 0.05, seed: 9 }]).changedCount;
    expect(some / (s.size * s.size)).toBeGreaterThan(0.02);
    expect(some / (s.size * s.size)).toBeLessThan(0.09);
  });

  it('a tear removes a corner and nothing near the opposite corner', () => {
    const d = applyDamage(s.modules, s.size, [{ kind: 'tear', corner: 'br', depth: 0.3, seed: 1 }]);
    const n = s.size;
    expect(d.torn[(n - 1) * n + (n - 1)]).toBe(1);
    expect(d.torn[0]).toBe(0);
    expect(d.torn[n - 1]).toBe(0);
    expect(d.torn[(n - 1) * n]).toBe(0);
    const area = d.torn.reduce((a, v) => a + v, 0) / (n * n);
    expect(area).toBeGreaterThan(0.02);
    expect(area).toBeLessThan(0.09);
    expect(d.tears[0].polygon.length).toBeGreaterThan(50);
  });

  it('damage is stored in normalised coordinates, so it lands in the same place on any version', () => {
    const centre: DamageOp = { kind: 'erase', points: [0.5, 0.5], radius: 0.001 };
    for (const v of [1, 10, 25]) {
      const t = sym('A', 'L', v);
      const cells = strokeCells((centre as { points: number[] }).points, 0.5 / t.size, t.size);
      const mid = (t.size - 1) / 2;
      expect(cells).toContain(mid * t.size + mid);
    }
  });

  it('tearFromPoint picks the nearest corner and the depth that reaches the point', () => {
    expect(tearFromPoint(0.9, 0.95)).toEqual({ corner: 'br', depth: expect.closeTo(0.15, 6) });
    expect(tearFromPoint(0.1, 0.2).corner).toBe('tl');
  });
});

describe('analysis of a damaged symbol', () => {
  const s = sym(URL, 'M'); // version 4-M: two blocks of 50 codewords, 18 EC each, t = 9

  it('reports a pristine symbol', () => {
    const a = analyse(s, applyDamage(s.modules, s.size, []), false);
    expect(a.verdict).toBe('pristine');
    expect(a.headline).toBe('Readable');
  });

  it('the opening torn corner reads as in the brief: 5 errors in block 1, 3 in block 2', () => {
    const a = analyse(
      s,
      applyDamage(s.modules, s.size, [{ kind: 'tear', corner: 'br', depth: 0.3, seed: 1 }]),
      false,
    );
    expect(a.verdict).toBe('readable');
    expect(a.headline).toBe('Still readable');
    expect(a.detail).toBe('5 errors corrected in block 1, 3 in block 2.');
    expect(a.blocks.map((b) => b.corrected)).toEqual([5, 3]);
    expect(a.correctedModules.length).toBeGreaterThan(0);
  });

  it('beyond capacity it names the block, its true error count and its limit', () => {
    const grid = Uint8Array.from(s.modules);
    for (let i = 0; i < 12; i++) xorCodeword(s, grid, 1, i, 0x5a);
    const d = { ...applyDamage(s.modules, s.size, []), modules: grid, changedCount: 1 };
    const a = analyse(s, d, false);
    expect(a.verdict).toBe('unreadable');
    expect(a.detail).toBe('Block 2 has 12 errors, it can fix at most 9.');
    expect(a.focusBlock).toBe(1);
    expect(new Set(a.failedBlockModules)).toEqual(new Set(blockModules(s, 1)));
    expect(a.failedBlockModules).toHaveLength(blockModules(s, 1).length);
  });

  it('with erasure mode a sticker can cover more than t codewords and still read', () => {
    const op: DamageOp = { kind: 'sticker', x: 0.3, y: 0.3, w: 0.42, h: 0.42 };
    const d = applyDamage(s.modules, s.size, [op]);
    const plain = analyse(s, d, false);
    const erased = analyse(s, d, true);
    expect(plain.verdict).toBe('unreadable');
    expect(erased.verdict).toBe('readable');
    expect(erased.totalErasures).toBeGreaterThan(18);
  });

  it('detects a miscorrection: more than t errors that land within t of another codeword', () => {
    // Version 1-L: one block, d = 7, t = 3. x^k·g(x) is a codeword of weight 8, so adding five of
    // its eight terms leaves the received word 5 from the truth but only 3 from a wrong codeword.
    const t1 = sym('HELLO QR', 'L', 1);
    const g = generatorPolynomial(7);
    const grid = Uint8Array.from(t1.modules);
    for (let i = 0; i < 5; i++) xorCodeword(t1, grid, 0, 4 + i, g[i]);
    const d = { ...applyDamage(t1.modules, t1.size, []), modules: grid, changedCount: 1 };
    const a = analyse(t1, d, false);
    expect(a.blocks[0].ok).toBe(true);
    expect(a.blocks[0].miscorrected).toBe(true);
    expect(a.verdict).toBe('misread');
  });
});
