/**
 * Reed–Solomon coding over GF(256) as used by QR codes (ISO/IEC 18004 §7.5.2).
 *
 * A block of k data codewords m_0 … m_(k−1) is read as the polynomial
 *   m(x) = m_0 x^(k−1) + … + m_(k−1)
 * and the d = n − k error-correction codewords are the remainder of m(x)·x^d divided by the
 * generator g(x) = ∏_{i=0}^{d−1} (x − α^i). The transmitted block c(x) = m(x)·x^d + rem is
 * therefore a multiple of g(x) and evaluates to zero at α^0 … α^(d−1).
 *
 * Decoding (errors and erasures):
 *   1. syndromes        S_j = r(α^j), j = 0 … d−1; all zero ⇒ no detectable error;
 *   2. erasures         Γ(x) = ∏ (1 + Y_i x) from known-bad positions, Forney syndromes
 *                       T(x) = S(x)·Γ(x) mod x^d;
 *   3. Berlekamp–Massey finds the shortest LFSR σ(x) generating T_f … T_(d−1) (the errors);
 *   4. errata locator   Λ(x) = σ(x)·Γ(x), evaluator Ω(x) = S(x)·Λ(x) mod x^d;
 *   5. Chien search     tries every position: Λ(X^−1) = 0 marks position with locator X;
 *   6. Forney           magnitude e = X·Ω(X^−1) / Λ'(X^−1) (first consecutive root b = 0).
 * A block is correctable when 2e + f ≤ d (e errors, f erasures), i.e. t = ⌊d/2⌋ errors alone.
 */

import {
  alphaPow,
  degreeLowFirst,
  generatorPolynomial,
  gfDiv,
  gfInv,
  gfMul,
  LOG,
  polyDerivativeLowFirst,
  polyEvalHighFirst,
  polyEvalLowFirst,
  polyMul,
} from './gf256';

/** Error-correction codewords for one block (the remainder of m(x)·x^d mod g(x)). */
export function rsEncode(data: ArrayLike<number>, ecCount: number): Uint8Array {
  const g = generatorPolynomial(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) rem[j] ^= gfMul(g[j + 1], factor);
    }
  }
  return rem;
}

export interface DivisionStep {
  /** Step number, from 1. */
  step: number;
  /** Lead coefficient of the current remainder (the term the generator is scaled by). */
  lead: number;
  /** Exponent of α for the lead coefficient, or null when the lead is 0 (step is a pure shift). */
  leadExponent: number | null;
  /** Generator polynomial multiplied by the lead term (d + 1 coefficients, high-first). */
  scaledGenerator: number[];
  /** Remainder after the XOR and after dropping the zero lead term (d + remaining-data terms). */
  remainder: number[];
}

/**
 * The polynomial long division of m(x)·x^d by g(x), step by step, exactly as written out in
 * Thonky's tutorial: multiply g by the lead term, XOR, drop the zero lead term, repeat k times.
 */
export function rsDivisionTrace(data: ArrayLike<number>, ecCount: number): DivisionStep[] {
  const g = generatorPolynomial(ecCount);
  let current = [...Array.from(data), ...new Array<number>(ecCount).fill(0)];
  const steps: DivisionStep[] = [];
  for (let s = 0; s < data.length; s++) {
    const lead = current[0];
    const scaled = Array.from(g, (c) => gfMul(c, lead));
    const next = current.map((c, i) => (i < scaled.length ? c ^ scaled[i] : c));
    next.shift();
    steps.push({
      step: s + 1,
      lead,
      leadExponent: lead === 0 ? null : LOG[lead],
      scaledGenerator: scaled,
      remainder: next,
    });
    current = next;
  }
  return steps;
}

export interface BmStep {
  /** Index into the (Forney) syndrome sequence being matched, from 0. */
  r: number;
  /** Discrepancy Δ between the next syndrome and the LFSR's prediction. */
  discrepancy: number;
  /** LFSR length L after this step. */
  length: number;
  /** Connection polynomial σ(x) after this step, low-first. */
  locator: number[];
}

export type RsFailure =
  | 'too-many-erasures'
  | 'too-many-errors'
  | 'root-count'
  | 'degenerate-derivative'
  | 'residual-syndrome';

export interface RsDecodeResult {
  ok: boolean;
  /** Codeword after correction (equal to the input when ok is false). */
  corrected: Uint8Array;
  /** S_0 … S_(d−1). */
  syndromes: number[];
  /** Erasure-adjusted syndromes T_f … T_(d−1) fed to Berlekamp–Massey. */
  forneySyndromes: number[];
  bmSteps: BmStep[];
  /** Erasure locator Γ(x), low-first. */
  erasureLocator: number[];
  /** Error-only locator σ(x) from Berlekamp–Massey, low-first. */
  errorLocator: number[];
  /** Errata locator Λ(x) = σ(x)Γ(x), low-first. */
  errataLocator: number[];
  /** Errata evaluator Ω(x) = S(x)Λ(x) mod x^d, low-first. */
  evaluator: number[];
  /** Positions (array indices, 0 = first codeword) where Λ has a root, sorted. */
  positions: number[];
  /** Error magnitude at each entry of `positions` (0 is possible for an erased-but-correct symbol). */
  magnitudes: number[];
  /** Positions that were errors (not supplied as erasures) and actually changed. */
  errorPositions: number[];
  /** Erasure positions as supplied (deduplicated, sorted). */
  erasurePositions: number[];
  errorsFound: number;
  erasureCount: number;
  /** Number of EC codewords d = n − k. */
  ecCount: number;
  failure?: RsFailure;
  /** Human-readable reason for a failure. */
  reason?: string;
}

/** Syndromes S_j = r(α^j) for j = 0 … d−1 of a received block (high-first). */
export function rsSyndromes(received: ArrayLike<number>, ecCount: number): number[] {
  const s: number[] = [];
  for (let j = 0; j < ecCount; j++) s.push(polyEvalHighFirst(received, alphaPow(j)));
  return s;
}

/** Berlekamp–Massey: shortest LFSR (connection polynomial, low-first) that generates seq. */
export function berlekampMassey(seq: ArrayLike<number>): {
  locator: number[];
  length: number;
  steps: BmStep[];
} {
  const C: number[] = [1];
  let B: number[] = [1];
  let L = 0;
  let m = 1;
  let b = 1;
  const steps: BmStep[] = [];
  for (let r = 0; r < seq.length; r++) {
    let delta = seq[r];
    for (let i = 1; i <= L; i++) delta ^= gfMul(C[i] ?? 0, seq[r - i]);
    if (delta === 0) {
      m++;
    } else {
      const coef = gfDiv(delta, b);
      const T = C.slice();
      const needed = B.length + m;
      while (C.length < needed) C.push(0);
      for (let i = 0; i < B.length; i++) C[i + m] ^= gfMul(coef, B[i]);
      if (2 * L <= r) {
        L = r + 1 - L;
        B = T;
        b = delta;
        m = 1;
      } else {
        m++;
      }
    }
    steps.push({ r, discrepancy: delta, length: L, locator: trimLowFirst(C) });
  }
  return { locator: trimLowFirst(C), length: L, steps };
}

function trimLowFirst(p: number[]): number[] {
  const d = degreeLowFirst(p);
  return d < 0 ? [0] : p.slice(0, d + 1);
}

/**
 * Decode one Reed–Solomon block in place of the standard's decoder.
 * @param received codewords of the block, data first then EC (high-first polynomial).
 * @param ecCount number of EC codewords d.
 * @param erasures array indices known to be unreliable (e.g. hidden under a sticker).
 */
export function rsDecode(
  received: ArrayLike<number>,
  ecCount: number,
  erasures: readonly number[] = [],
): RsDecodeResult {
  const n = received.length;
  if (n > 255) throw new RangeError('A GF(256) Reed–Solomon block holds at most 255 codewords');
  if (ecCount < 1 || ecCount >= n) throw new RangeError('ecCount must be in 1..n−1');
  const input = Uint8Array.from(received);
  const erasurePositions = [...new Set(erasures)]
    .filter((p) => p >= 0 && p < n)
    .sort((a, b) => a - b);
  const f = erasurePositions.length;
  const syndromes = rsSyndromes(input, ecCount);

  const base: RsDecodeResult = {
    ok: false,
    corrected: input,
    syndromes,
    forneySyndromes: [],
    bmSteps: [],
    erasureLocator: [1],
    errorLocator: [1],
    errataLocator: [1],
    evaluator: [0],
    positions: [],
    magnitudes: [],
    errorPositions: [],
    erasurePositions,
    errorsFound: 0,
    erasureCount: f,
    ecCount,
  };

  if (f > ecCount) {
    return {
      ...base,
      failure: 'too-many-erasures',
      reason: `${f} erasures but only ${ecCount} error-correction codewords`,
    };
  }

  const locatorOf = (pos: number) => alphaPow(n - 1 - pos);

  // Erasure locator Γ(x) = ∏ (1 + Y_i x).
  let gamma: number[] = [1];
  for (const p of erasurePositions) gamma = polyMul(gamma, [1, locatorOf(p)]);

  if (syndromes.every((s) => s === 0)) {
    // A valid codeword. Erased positions (if any) were simply right.
    return {
      ...base,
      ok: true,
      corrected: input,
      erasureLocator: gamma,
      errataLocator: gamma,
      positions: erasurePositions.slice(),
      magnitudes: erasurePositions.map(() => 0),
    };
  }

  // Forney syndromes: T(x) = S(x)Γ(x) mod x^d; the coefficients f … d−1 depend on the errors only.
  const sx = polyMul(syndromes, gamma).slice(0, ecCount);
  const forneySyndromes = sx.slice(f);
  const bm = berlekampMassey(forneySyndromes);
  const sigma = bm.locator;
  const e = bm.length;

  const withLocators = {
    ...base,
    forneySyndromes,
    bmSteps: bm.steps,
    erasureLocator: gamma,
    errorLocator: sigma,
  };

  if (2 * e + f > ecCount) {
    return {
      ...withLocators,
      failure: 'too-many-errors',
      reason: `Berlekamp–Massey needs an error locator of degree ${e}; with ${f} erasure${f === 1 ? '' : 's'} that exceeds 2e + f ≤ ${ecCount}`,
    };
  }

  const lambda = trimLowFirst(polyMul(sigma, gamma));
  const omega = trimLowFirst(polyMul(syndromes, lambda).slice(0, ecCount));
  const degLambda = degreeLowFirst(lambda);

  // Chien search over the n positions actually present in this (shortened) block.
  const positions: number[] = [];
  for (let pos = 0; pos < n; pos++) {
    const xInv = gfInv(locatorOf(pos));
    if (polyEvalLowFirst(lambda, xInv) === 0) positions.push(pos);
  }

  const withAll = { ...withLocators, errataLocator: lambda, evaluator: omega };

  if (positions.length !== degLambda) {
    return {
      ...withAll,
      positions,
      failure: 'root-count',
      reason: `Λ(x) has degree ${degLambda} but only ${positions.length} of its roots fall inside the ${n} codeword positions — more errors than the block can correct`,
    };
  }

  // Forney: e = X · Ω(X^−1) / Λ'(X^−1).
  const dLambda = polyDerivativeLowFirst(lambda);
  const corrected = Uint8Array.from(input);
  const magnitudes: number[] = [];
  for (const pos of positions) {
    const X = locatorOf(pos);
    const xInv = gfInv(X);
    const denom = polyEvalLowFirst(dLambda, xInv);
    if (denom === 0) {
      return {
        ...withAll,
        positions,
        failure: 'degenerate-derivative',
        reason: `Λ'(X⁻¹) is zero at position ${pos}; the locator has a repeated root`,
      };
    }
    const mag = gfMul(X, gfDiv(polyEvalLowFirst(omega, xInv), denom));
    magnitudes.push(mag);
    corrected[pos] ^= mag;
  }

  const residual = rsSyndromes(corrected, ecCount);
  if (residual.some((s) => s !== 0)) {
    return {
      ...withAll,
      positions,
      magnitudes,
      failure: 'residual-syndrome',
      reason: 'The corrected block still has non-zero syndromes',
    };
  }

  const erasureSet = new Set(erasurePositions);
  const errorPositions = positions.filter((p, i) => !erasureSet.has(p) && magnitudes[i] !== 0);
  return {
    ...withAll,
    ok: true,
    corrected,
    positions,
    magnitudes,
    errorPositions,
    errorsFound: errorPositions.length,
  };
}
