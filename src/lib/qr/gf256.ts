/**
 * Arithmetic in GF(2^8), the finite field QR codes use for Reed–Solomon coding.
 *
 * Elements are bytes 0..255, read as polynomials over GF(2) with bit i the coefficient of x^i.
 * Addition is XOR. Multiplication is polynomial multiplication reduced modulo the primitive
 * polynomial p(x) = x^8 + x^4 + x^3 + x^2 + 1 (0x11D), as required by ISO/IEC 18004 §7.5.2.
 * Because p is primitive, α = x (the byte 2) generates every non-zero element: α^0 … α^254.
 * The log/antilog tables below turn multiplication into addition of exponents modulo 255.
 */

/** The QR code field polynomial x^8 + x^4 + x^3 + x^2 + 1. */
export const PRIMITIVE_POLYNOMIAL = 0x11d;

/** EXP[i] = α^i. Stored twice over (512 entries) so EXP[LOG[a] + LOG[b]] needs no modulo. */
export const EXP: Uint8Array = new Uint8Array(512);
/** LOG[a] = i such that α^i = a, for a ≠ 0. LOG[0] is meaningless and left at 0. */
export const LOG: Uint8Array = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= PRIMITIVE_POLYNOMIAL;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

export function gfAdd(a: number, b: number): number {
  return a ^ b;
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new RangeError('Division by zero in GF(256)');
  if (a === 0) return 0;
  return EXP[LOG[a] + 255 - LOG[b]];
}

export function gfInv(a: number): number {
  if (a === 0) throw new RangeError('0 has no multiplicative inverse in GF(256)');
  return EXP[255 - LOG[a]];
}

/** a^n for any integer n (negative n uses the inverse). 0^0 is taken as 1. */
export function gfPow(a: number, n: number): number {
  if (n === 0) return 1;
  if (a === 0) {
    if (n < 0) throw new RangeError('0 has no multiplicative inverse in GF(256)');
    return 0;
  }
  const e = (((LOG[a] * n) % 255) + 255) % 255;
  return EXP[e];
}

/** α^n for any integer n. */
export function alphaPow(n: number): number {
  return EXP[((n % 255) + 255) % 255];
}

/** Exponent of a non-zero element (its discrete logarithm base α). */
export function gfLog(a: number): number {
  if (a === 0) throw new RangeError('log(0) is undefined in GF(256)');
  return LOG[a];
}

/* ------------------------------------------------------------------------------------------ *
 * Polynomials. Two orders are used and named explicitly:
 *  - "high-first" arrays: index 0 is the highest-degree coefficient. QR codewords, the message
 *    polynomial and the generator polynomial are written this way (as in the standard).
 *  - "low-first" arrays: index i is the coefficient of x^i. Syndrome, locator and evaluator
 *    polynomials in the decoder use this order.
 * ------------------------------------------------------------------------------------------ */

/** Evaluate a high-first polynomial at x (Horner's rule). */
export function polyEvalHighFirst(p: ArrayLike<number>, x: number): number {
  let y = 0;
  for (let i = 0; i < p.length; i++) y = gfMul(y, x) ^ p[i];
  return y;
}

/** Evaluate a low-first polynomial at x. */
export function polyEvalLowFirst(p: ArrayLike<number>, x: number): number {
  let y = 0;
  for (let i = p.length - 1; i >= 0; i--) y = gfMul(y, x) ^ p[i];
  return y;
}

/** Multiply two polynomials given in the same coefficient order (works for either order). */
export function polyMul(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; j < b.length; j++) out[i + j] ^= gfMul(a[i], b[j]);
  }
  return out;
}

/** Formal derivative of a low-first polynomial. In characteristic 2 the even terms vanish. */
export function polyDerivativeLowFirst(p: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 1; i < p.length; i++) out.push(i % 2 === 1 ? p[i] : 0);
  return out.length ? out : [0];
}

/** Degree of a low-first polynomial (−1 for the zero polynomial). */
export function degreeLowFirst(p: ArrayLike<number>): number {
  for (let i = p.length - 1; i >= 0; i--) if (p[i] !== 0) return i;
  return -1;
}

const generatorCache = new Map<number, Uint8Array>();

/**
 * The Reed–Solomon generator polynomial g(x) = (x − α^0)(x − α^1)…(x − α^(d−1)), high-first,
 * monic (g[0] = 1). Its d roots are what make every codeword evaluate to zero at α^0…α^(d−1).
 */
export function generatorPolynomial(degree: number): Uint8Array {
  if (!Number.isInteger(degree) || degree < 1 || degree > 254) {
    throw new RangeError(`Generator degree must be an integer in 1..254, got ${degree}`);
  }
  const cached = generatorCache.get(degree);
  if (cached) return cached;
  let g: number[] = [1];
  for (let i = 0; i < degree; i++) g = polyMul(g, [1, alphaPow(i)]);
  const result = Uint8Array.from(g);
  generatorCache.set(degree, result);
  return result;
}

/** Exponents of α for each coefficient of g(x) (every coefficient of g is non-zero). */
export function generatorExponents(degree: number): number[] {
  return Array.from(generatorPolynomial(degree), (c) => LOG[c]);
}
