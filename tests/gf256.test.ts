import { describe, expect, it } from 'vitest';
import {
  alphaPow,
  EXP,
  generatorExponents,
  generatorPolynomial,
  gfDiv,
  gfInv,
  gfLog,
  gfMul,
  gfPow,
  LOG,
  polyEvalHighFirst,
} from '../src/lib/qr/gf256';

/** Carry-less multiplication followed by reduction modulo 0x11D — independent of the tables. */
function slowMul(a: number, b: number): number {
  let product = 0;
  for (let i = 0; i < 8; i++) if ((b >> i) & 1) product ^= a << i;
  for (let bit = 14; bit >= 8; bit--) if ((product >> bit) & 1) product ^= 0x11d << (bit - 8);
  return product;
}

describe('GF(256) log/antilog tables', () => {
  it('α = 2 generates all 255 non-zero elements exactly once (p(x) = 0x11D is primitive)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 255; i++) seen.add(EXP[i]);
    expect(seen.size).toBe(255);
    expect(seen.has(0)).toBe(false);
    expect(alphaPow(255)).toBe(1);
    expect(alphaPow(8)).toBe(0x1d); // x^8 = x^4 + x^3 + x^2 + 1
  });

  it('LOG inverts EXP for every non-zero element', () => {
    for (let a = 1; a < 256; a++) expect(EXP[LOG[a]]).toBe(a);
  });

  it('matches the worked log values in Thonky’s division steps (32 = α^5, 89 = α^210, 61 = α^228)', () => {
    // https://www.thonky.com/qr-code-tutorial/error-correction-coding
    expect(gfLog(32)).toBe(5);
    expect(gfLog(89)).toBe(210);
    expect(gfLog(61)).toBe(228);
  });

  it('table multiplication equals carry-less multiplication mod 0x11D for all 65 536 pairs', () => {
    for (let a = 0; a < 256; a++)
      for (let b = 0; b < 256; b++) expect(gfMul(a, b)).toBe(slowMul(a, b));
  });
});

describe('GF(256) field axioms (exhaustive)', () => {
  // Full multiplication table, used to keep the triple loops fast.
  const M = new Uint8Array(65536);
  for (let a = 0; a < 256; a++) for (let b = 0; b < 256; b++) M[(a << 8) | b] = gfMul(a, b);

  it('addition (XOR) is an abelian group with identity 0, every element its own inverse', () => {
    for (let a = 0; a < 256; a++) {
      expect(a ^ 0).toBe(a);
      expect(a ^ a).toBe(0);
      for (let b = 0; b < 256; b++) expect(a ^ b).toBe(b ^ a);
    }
  });

  it('multiplication is commutative, has identity 1 and annihilator 0', () => {
    for (let a = 0; a < 256; a++) {
      expect(M[(a << 8) | 1]).toBe(a);
      expect(M[a << 8]).toBe(0);
      for (let b = 0; b < 256; b++) expect(M[(a << 8) | b]).toBe(M[(b << 8) | a]);
    }
  });

  it('multiplication is associative and distributes over addition for all 16 777 216 triples', () => {
    let assocFailures = 0;
    let distFailures = 0;
    for (let a = 0; a < 256; a++) {
      for (let b = 0; b < 256; b++) {
        const ab = M[(a << 8) | b];
        for (let c = 0; c < 256; c++) {
          if (M[(ab << 8) | c] !== M[(a << 8) | M[(b << 8) | c]]) assocFailures++;
          if (M[(a << 8) | (b ^ c)] !== (ab ^ M[(a << 8) | c])) distFailures++;
        }
      }
    }
    expect(assocFailures).toBe(0);
    expect(distFailures).toBe(0);
  });

  it('every non-zero element has a unique inverse, and division undoes multiplication', () => {
    for (let a = 1; a < 256; a++) {
      const inv = gfInv(a);
      expect(gfMul(a, inv)).toBe(1);
      let count = 0;
      for (let b = 1; b < 256; b++) if (M[(a << 8) | b] === 1) count++;
      expect(count).toBe(1);
      for (let b = 0; b < 256; b++) expect(gfDiv(gfMul(b, a), a)).toBe(b);
    }
    expect(() => gfInv(0)).toThrow();
    expect(() => gfDiv(5, 0)).toThrow();
  });

  it('powers follow exponent arithmetic modulo 255', () => {
    for (let a = 1; a < 256; a++) {
      expect(gfPow(a, 0)).toBe(1);
      expect(gfPow(a, 255)).toBe(1);
      expect(gfPow(a, -1)).toBe(gfInv(a));
      expect(gfPow(a, 3)).toBe(gfMul(a, gfMul(a, a)));
    }
  });
});

describe('Reed–Solomon generator polynomials', () => {
  // Exponents of α for g(x) = ∏_{i<d} (x − α^i), from Thonky's generator polynomial tool
  // (https://www.thonky.com/qr-code-tutorial/generator-polynomial-tool, retrieved 2026-10-06),
  // which reproduces ISO/IEC 18004 Annex A.
  const reference: Record<number, number[]> = {
    7: [0, 87, 229, 146, 149, 238, 102, 21],
    10: [0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45],
    13: [0, 74, 152, 176, 100, 86, 100, 106, 104, 130, 218, 206, 140, 78],
    15: [0, 8, 183, 61, 91, 202, 37, 51, 58, 58, 237, 140, 124, 5, 99, 105],
    16: [0, 120, 104, 107, 109, 102, 161, 76, 3, 91, 191, 147, 169, 182, 194, 225, 120],
    17: [0, 43, 139, 206, 78, 43, 239, 123, 206, 214, 147, 24, 99, 150, 39, 243, 163, 136],
    18: [0, 215, 234, 158, 94, 184, 97, 118, 170, 79, 187, 152, 148, 252, 179, 5, 98, 96, 153],
    22: [
      0, 210, 171, 247, 242, 93, 230, 14, 109, 221, 53, 200, 74, 8, 172, 98, 80, 219, 134, 160, 105,
      165, 231,
    ],
    26: [
      0, 173, 125, 158, 2, 103, 182, 118, 17, 145, 201, 111, 28, 165, 53, 161, 21, 245, 142, 13,
      102, 48, 227, 153, 145, 218, 70,
    ],
    28: [
      0, 168, 223, 200, 104, 224, 234, 108, 180, 110, 190, 195, 147, 205, 27, 232, 201, 21, 43, 245,
      87, 42, 195, 212, 119, 242, 37, 9, 123,
    ],
    30: [
      0, 41, 173, 145, 152, 216, 31, 179, 182, 50, 48, 110, 86, 239, 96, 222, 125, 42, 173, 226,
      193, 224, 130, 156, 37, 251, 216, 238, 40, 192, 180,
    ],
  };

  for (const [degree, exps] of Object.entries(reference)) {
    it(`degree ${degree} matches the published coefficients`, () => {
      expect(generatorExponents(Number(degree))).toEqual(exps);
    });
  }

  it('has exactly the roots α^0 … α^(d−1) for every degree used by QR codes', () => {
    for (const d of [7, 10, 13, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30]) {
      const g = generatorPolynomial(d);
      expect(g[0]).toBe(1);
      for (let i = 0; i < d; i++) expect(polyEvalHighFirst(g, alphaPow(i))).toBe(0);
      expect(polyEvalHighFirst(g, alphaPow(d))).not.toBe(0);
    }
  });
});
