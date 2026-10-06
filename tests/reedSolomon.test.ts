import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/lib/damage/rng';
import { rsDecode, rsDivisionTrace, rsEncode, rsSyndromes } from '../src/lib/qr/reedSolomon';

const hex = (s: string) => s.split(/\s+/).map((h) => Number.parseInt(h, 16));

describe('Reed–Solomon encoder — published examples', () => {
  it('HELLO WORLD 1-Q: 13 EC codewords (Thonky / CVUT course notes)', () => {
    // Data codewords: https://www.thonky.com/qr-code-tutorial/data-encoding
    // EC codewords: CVUT "QR code tutorial" supplement (see research notes in the brief).
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
    expect(Array.from(rsEncode(data, 13))).toEqual([
      168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16,
    ]);
  });

  it('HELLO WORLD 1-M: 10 EC codewords (Thonky error-correction page)', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(Array.from(rsEncode(data, 10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('HELLO WORLD 1-M: the long-division steps match Thonky’s steps 1–3 and 16', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    const steps = rsDivisionTrace(data, 10);
    expect(steps).toHaveLength(16);
    expect(steps[0].leadExponent).toBe(5);
    expect(steps[0].scaledGenerator).toEqual([32, 2, 101, 10, 97, 197, 15, 47, 134, 74, 5]);
    // Thonky writes the remainder down to x^10; the ten lower terms are still zero at this point.
    expect(steps[0].remainder.slice(0, 15)).toEqual([
      89, 110, 114, 176, 183, 211, 98, 197, 10, 233, 17, 236, 17, 236, 17,
    ]);
    expect(steps[0].remainder.slice(15).every((c) => c === 0)).toBe(true);
    expect(steps[1].leadExponent).toBe(210);
    expect(steps[1].scaledGenerator).toEqual([89, 83, 234, 2, 76, 202, 3, 90, 140, 176, 1]);
    expect(steps[1].remainder.slice(0, 14)).toEqual([
      61, 152, 178, 251, 25, 97, 159, 134, 89, 16, 236, 17, 236, 17,
    ]);
    expect(steps[2].leadExponent).toBe(228);
    expect(steps[2].scaledGenerator).toEqual([61, 18, 106, 90, 78, 163, 119, 74, 194, 32, 45]);
    expect(steps[15].remainder).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('5-Q, four blocks: every block’s 18 EC codewords (Thonky structure-final-message page)', () => {
    // https://www.thonky.com/qr-code-tutorial/structure-final-message (retrieved 2026-10-06)
    const blocks = [
      {
        data: [67, 85, 70, 134, 87, 38, 85, 194, 119, 50, 6, 18, 6, 103, 38],
        ec: [213, 199, 11, 45, 115, 247, 241, 223, 229, 248, 154, 117, 154, 111, 86, 161, 111, 39],
      },
      {
        data: [246, 246, 66, 7, 118, 134, 242, 7, 38, 86, 22, 198, 199, 146, 6],
        ec: [87, 204, 96, 60, 202, 182, 124, 157, 200, 134, 27, 129, 209, 17, 163, 163, 120, 133],
      },
      {
        data: [182, 230, 247, 119, 50, 7, 118, 134, 87, 38, 82, 6, 134, 151, 50, 7],
        ec: [148, 116, 177, 212, 76, 133, 75, 242, 238, 76, 195, 230, 189, 10, 108, 240, 192, 141],
      },
      {
        data: [70, 247, 118, 86, 194, 6, 151, 50, 224, 236, 17, 236, 17, 236, 17, 236],
        ec: [140, 100, 250, 247, 108, 131, 37, 104, 253, 113, 111, 235, 197, 83, 6, 205, 89, 74],
      },
    ];
    for (const b of blocks) expect(Array.from(rsEncode(b.data, 18))).toEqual(b.ec);
  });

  it('“’Twas brillig” 1-M byte mode (Wikiversity, Reed–Solomon codes for coders)', () => {
    const data = hex('40 d2 75 47 76 17 32 06 27 26 96 c6 c6 96 70 ec');
    expect(Array.from(rsEncode(data, 10))).toEqual(hex('bc 2a 90 13 6b af ef fd 4b e0'));
  });
});

/** Random valid codeword of length n with d EC codewords. */
function randomCodeword(rand: () => number, n: number, d: number): Uint8Array {
  const data = Array.from({ length: n - d }, () => Math.floor(rand() * 256));
  return Uint8Array.from([...data, ...rsEncode(data, d)]);
}

function pickPositions(rand: () => number, n: number, count: number): number[] {
  const all = Array.from({ length: n }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count);
}

const SHAPES: [number, number][] = [
  [26, 7], // 1-L style, t = 3
  [26, 13],
  [44, 26],
  [100, 18],
  [134, 30],
  [255, 30], // full-length block
  [46, 28],
];

describe('Reed–Solomon decoder', () => {
  it('returns zero syndromes and no corrections for a valid codeword', () => {
    const rand = mulberry32(1);
    const cw = randomCodeword(rand, 44, 26);
    expect(rsSyndromes(cw, 26).every((s) => s === 0)).toBe(true);
    const r = rsDecode(cw, 26);
    expect(r.ok).toBe(true);
    expect(r.errorsFound).toBe(0);
  });

  it('corrects every random pattern of up to t = ⌊d/2⌋ errors', () => {
    const rand = mulberry32(2026);
    let trials = 0;
    for (const [n, d] of SHAPES) {
      const t = Math.floor(d / 2);
      for (let rep = 0; rep < 60; rep++) {
        const cw = randomCodeword(rand, n, d);
        const e = 1 + Math.floor(rand() * t);
        const received = cw.slice();
        const positions = pickPositions(rand, n, e);
        for (const p of positions) received[p] ^= 1 + Math.floor(rand() * 255);
        const r = rsDecode(received, d);
        expect(r.ok).toBe(true);
        expect(Array.from(r.corrected)).toEqual(Array.from(cw));
        expect(r.errorsFound).toBe(e);
        expect(r.errorPositions.slice().sort((a, b) => a - b)).toEqual(
          positions.slice().sort((a, b) => a - b),
        );
        trials++;
      }
    }
    expect(trials).toBe(SHAPES.length * 60);
  });

  it('corrects up to d erasures (2t when d is even) at known positions', () => {
    const rand = mulberry32(7);
    for (const [n, d] of SHAPES) {
      for (let rep = 0; rep < 40; rep++) {
        const cw = randomCodeword(rand, n, d);
        const f = 1 + Math.floor(rand() * d);
        const received = cw.slice();
        const positions = pickPositions(rand, n, f);
        for (const p of positions) received[p] = Math.floor(rand() * 256); // may equal the original
        const r = rsDecode(received, d, positions);
        expect(r.ok).toBe(true);
        expect(Array.from(r.corrected)).toEqual(Array.from(cw));
      }
    }
  });

  it('corrects mixed errors and erasures whenever 2e + f ≤ d', () => {
    const rand = mulberry32(99);
    for (const [n, d] of SHAPES) {
      for (let rep = 0; rep < 40; rep++) {
        const cw = randomCodeword(rand, n, d);
        const f = Math.floor(rand() * (d + 1));
        const e = Math.floor((d - f) / 2);
        const received = cw.slice();
        const positions = pickPositions(rand, n, e + f);
        const erasures = positions.slice(0, f);
        for (const p of erasures) received[p] = Math.floor(rand() * 256);
        for (const p of positions.slice(f)) received[p] ^= 1 + Math.floor(rand() * 255);
        const r = rsDecode(received, d, erasures);
        expect(r.ok, `n=${n} d=${d} e=${e} f=${f}`).toBe(true);
        expect(Array.from(r.corrected)).toEqual(Array.from(cw));
      }
    }
  });

  it('reports failure (or at worst lands on a different valid codeword) beyond capacity', () => {
    const rand = mulberry32(31337);
    let detected = 0;
    let miscorrected = 0;
    let total = 0;
    for (const [n, d] of SHAPES) {
      const t = Math.floor(d / 2);
      for (let rep = 0; rep < 100; rep++) {
        const cw = randomCodeword(rand, n, d);
        const e = t + 1 + Math.floor(rand() * 4);
        const received = cw.slice();
        for (const p of pickPositions(rand, n, e)) received[p] ^= 1 + Math.floor(rand() * 255);
        const r = rsDecode(received, d);
        total++;
        if (!r.ok) {
          detected++;
          expect(r.reason).toBeTruthy();
          expect(Array.from(r.corrected)).toEqual(Array.from(received));
        } else {
          // A miscorrection must still be a genuine codeword within t of what was received.
          miscorrected++;
          expect(rsSyndromes(r.corrected, d).every((s) => s === 0)).toBe(true);
          expect(Array.from(r.corrected)).not.toEqual(Array.from(cw));
          let dist = 0;
          for (let i = 0; i < n; i++) if (r.corrected[i] !== received[i]) dist++;
          expect(dist).toBeLessThanOrEqual(t);
        }
      }
    }
    expect(detected + miscorrected).toBe(total);
    // Miscorrection needs the received word to fall within distance t of another codeword;
    // for these block shapes that is rare.
    expect(detected / total).toBeGreaterThan(0.95);
  });

  it('rejects more erasures than EC codewords with a precise reason', () => {
    const rand = mulberry32(5);
    const cw = randomCodeword(rand, 26, 7);
    const r = rsDecode(cw, 7, [0, 1, 2, 3, 4, 5, 6, 7]);
    expect(r.ok).toBe(false);
    expect(r.failure).toBe('too-many-erasures');
    expect(r.reason).toContain('8 erasures');
  });
});
