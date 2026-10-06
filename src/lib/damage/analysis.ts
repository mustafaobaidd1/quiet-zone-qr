/**
 * Compare a decode of the damaged grid with the undamaged symbol. The decoder alone cannot know
 * how many codewords were damaged when a block fails (Reed–Solomon only says "too many"), but this
 * page also has the original, so it can report the true count and catch miscorrections.
 */

import { decodeGrid, type DecodeReport } from '../qr/decoder';
import type { QrSymbol } from '../qr/encoder';
import { formatPositions } from '../qr/matrix';
import type { DamageState } from './damage';

export type Verdict = 'pristine' | 'readable' | 'misread' | 'unreadable';

export interface BlockAnalysis {
  index: number;
  /** EC codewords d, and t = ⌊d/2⌋. */
  ecCount: number;
  capacity: number;
  /** Codewords that differ from the original (ground truth). */
  damaged: number;
  /** Damaged codewords that were also flagged as erasures. */
  damagedErasures: number;
  /** Errors the decoder located and corrected (not counting erasures). */
  corrected: number;
  erasures: number;
  ok: boolean;
  /** Decoder claimed success but produced a different codeword. */
  miscorrected: boolean;
  /** Error budget used, 2e + f, against d (ground truth e). */
  budget: number;
}

export interface Analysis {
  verdict: Verdict;
  report: DecodeReport;
  blocks: BlockAnalysis[];
  /** Modules whose wrong bit the decoder put right (they flash cobalt). */
  correctedModules: number[];
  /** Modules of blocks that failed (the readout points at them). */
  failedBlockModules: number[];
  /** Index of the block the status sentence is about, or −1. */
  focusBlock: number;
  totalCorrected: number;
  totalErasures: number;
  /** Headline and one detail sentence for the status readout. */
  headline: string;
  detail: string;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function analyse(symbol: QrSymbol, damage: DamageState, erasureMode: boolean): Analysis {
  const report = decodeGrid(
    damage.modules,
    symbol.size,
    erasureMode ? { erasureModules: damage.sticker } : {},
  );
  const { path } = symbol.geometry;

  // Original codewords of each block, in block order (data then EC).
  const originals = symbol.blocks.map((b) => Uint8Array.from([...b.data, ...b.ec]));

  const blocks: BlockAnalysis[] = report.blocks.map((b) => {
    const orig = originals[b.index] ?? new Uint8Array(0);
    const erasureSet = new Set(b.erasures);
    let damaged = 0;
    let damagedErasures = 0;
    for (let i = 0; i < b.received.length; i++) {
      if (b.received[i] !== orig[i]) {
        damaged++;
        if (erasureSet.has(i)) damagedErasures++;
      }
    }
    const miscorrected = b.rs.ok && b.rs.corrected.some((v, i) => v !== orig[i]);
    return {
      index: b.index,
      ecCount: b.ecCount,
      capacity: b.capacity,
      damaged,
      damagedErasures,
      corrected: b.rs.errorsFound,
      erasures: b.erasures.length,
      ok: b.rs.ok,
      miscorrected,
      budget: 2 * (damaged - damagedErasures) + b.erasures.length,
    };
  });

  // Modules the decoder repaired: the set bits of each error magnitude.
  const correctedModules: number[] = [];
  report.blocks.forEach((b) => {
    if (!b.rs.ok) return;
    b.rs.positions.forEach((pos, k) => {
      const mag = b.rs.magnitudes[k];
      if (!mag) return;
      const seq = b.sequenceIndices[pos];
      for (let bit = 0; bit < 8; bit++) {
        if ((mag >> (7 - bit)) & 1) correctedModules.push(path[seq * 8 + bit]);
      }
    });
  });
  // Format bits the BCH decoder repaired in the copy it used.
  if (report.format && report.format.used >= 0) {
    const used = report.format.used + 1;
    const fixed = new Set(report.format.copies[report.format.used].correctedBits);
    for (const [r, c, bit, copy] of formatPositions(symbol.size)) {
      if (copy === used && fixed.has(bit)) correctedModules.push(r * symbol.size + c);
    }
  }

  const totalCorrected = blocks.reduce((n, b) => n + b.corrected, 0);
  const totalErasures = blocks.reduce((n, b) => n + b.erasures, 0);
  const miscorrected = blocks.some((b) => b.miscorrected);
  const formatInfo = report.format?.info ?? null;
  const formatWrong =
    formatInfo !== null && (formatInfo.level !== symbol.level || formatInfo.mask !== symbol.mask);

  let verdict: Verdict;
  let headline: string;
  let detail: string;
  let focusBlock = -1;

  if (report.ok && !miscorrected && !formatWrong && report.text === symbol.text) {
    const untouched =
      damage.changedCount === 0 && damage.stickers.length === 0 && damage.tears.length === 0;
    if (untouched) {
      verdict = 'pristine';
      headline = 'Readable';
      detail = 'No damage yet. Every block decodes with zero errors.';
    } else {
      verdict = 'readable';
      headline = 'Still readable';
      const withFixes = blocks.filter((b) => b.corrected > 0 || b.erasures > 0);
      const describe = (b: BlockAnalysis, first: boolean) => {
        const f = b.erasures ? ` + ${plural(b.erasures, 'erasure')}` : '';
        const e = first || b.erasures ? plural(b.corrected, 'error') : String(b.corrected);
        return first
          ? `${e}${f} corrected in block ${b.index + 1}`
          : `${e}${f} in block ${b.index + 1}`;
      };
      if (withFixes.length === 0) {
        detail = 'The damage only touched modules the decoder does not need to read the data.';
      } else if (blocks.length === 1) {
        const b = blocks[0];
        detail = `${plural(b.corrected, 'error')}${b.erasures ? ` + ${plural(b.erasures, 'erasure')}` : ''} corrected in its only block.`;
        focusBlock = 0;
      } else if (withFixes.length <= 3) {
        const sorted = withFixes.slice().sort((a, b) => a.index - b.index);
        detail = `${sorted.map((b, i) => describe(b, i === 0)).join(', ')}.`;
        detail = detail[0].toUpperCase() + detail.slice(1);
        focusBlock = withFixes.reduce((a, b) => (b.budget > a.budget ? b : a)).index;
      } else {
        detail = `${plural(totalCorrected, 'error')}${totalErasures ? ` + ${plural(totalErasures, 'erasure')}` : ''} corrected across ${withFixes.length} of ${blocks.length} blocks.`;
        focusBlock = withFixes.reduce((a, b) => (b.budget > a.budget ? b : a)).index;
      }
      const used = report.format?.used ?? -1;
      const fmtBits = used >= 0 ? report.format!.copies[used].distance : 0;
      if (fmtBits > 0) detail += ` Format information: ${plural(fmtBits, 'bit')} repaired by BCH.`;
    }
  } else if (formatWrong && formatInfo) {
    verdict = 'unreadable';
    headline = 'Unreadable';
    detail = `The format information now reads level ${formatInfo.level}, mask ${formatInfo.mask} (it is level ${symbol.level}, mask ${symbol.mask}): the damage moved it within 3 bits of another valid format code, so the data is unmasked wrongly.`;
  } else if (report.ok || (report.failure?.stage === 'segments' && miscorrected)) {
    verdict = 'misread';
    headline = 'Misread';
    const bad = blocks.filter((b) => b.miscorrected).map((b) => b.index + 1);
    focusBlock = bad.length ? bad[0] - 1 : -1;
    detail = bad.length
      ? `Block ${joinList(bad.map(String))} had more errors than it can fix and was “corrected” to a different valid codeword, so the text is wrong.`
      : 'The decoder produced different text from the original.';
    if (report.failure?.stage === 'segments') detail += ` (${report.failure.reason}.)`;
  } else {
    verdict = 'unreadable';
    headline = 'Unreadable';
    const f = report.failure;
    if (f?.stage === 'format') {
      detail = `${f.reason}.`;
    } else if (f?.stage === 'reed-solomon') {
      // Talk about the failing block that is furthest over its budget.
      const failing = blocks
        .filter((b) => !b.ok)
        .sort((a, b) => b.budget - b.ecCount - (a.budget - a.ecCount) || a.index - b.index);
      const worst = failing[0];
      focusBlock = worst ? worst.index : -1;
      if (worst && worst.erasures === 0) {
        detail = `Block ${worst.index + 1} has ${plural(worst.damaged, 'error')}, it can fix at most ${worst.capacity}.`;
      } else if (worst) {
        const e = worst.damaged - worst.damagedErasures;
        detail = `Block ${worst.index + 1} needs 2 × ${e} errors + ${worst.erasures} erasures = ${worst.budget}, more than its ${worst.ecCount} EC codewords.`;
      } else {
        detail = `${f.reason}.`;
      }
      if (failing.length > 1) {
        detail += ` ${failing.length - 1} more block${failing.length > 2 ? 's' : ''} failed too.`;
      }
    } else if (f?.stage === 'segments') {
      detail = `The corrected data does not parse: ${f.reason}.`;
    } else {
      detail = f?.reason ?? 'Decoding failed.';
    }
  }

  // The readout points at one block: the one its sentence is about.
  const failedBlockModules: number[] = [];
  if ((verdict === 'unreadable' || verdict === 'misread') && focusBlock >= 0) {
    const b = report.blocks[focusBlock];
    for (const seq of b.sequenceIndices) {
      for (let bit = 0; bit < 8; bit++) failedBlockModules.push(path[seq * 8 + bit]);
    }
  }

  return {
    verdict,
    report,
    blocks,
    correctedModules,
    failedBlockModules,
    focusBlock,
    totalCorrected,
    totalErasures,
    headline,
    detail,
  };
}

/** Modules (indices) of one block's codewords. */
export function blockModules(symbol: QrSymbol, block: number): number[] {
  const out: number[] = [];
  const { path } = symbol.geometry;
  symbol.codewordInfo.forEach((info, seq) => {
    if (info.block === block) for (let bit = 0; bit < 8; bit++) out.push(path[seq * 8 + bit]);
  });
  return out;
}
