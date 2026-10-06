/**
 * Large-sample validation. Prints a summary; the numbers are recorded in the README.
 * Run with `npm run validate`.
 */
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { analyse } from '../src/lib/damage/analysis';
import { applyDamage } from '../src/lib/damage/damage';
import { mulberry32 } from '../src/lib/damage/rng';
import { decodeFormatBits, formatBits, popcount } from '../src/lib/qr/bch';
import { decodeGrid } from '../src/lib/qr/decoder';
import { encode } from '../src/lib/qr/encoder';
import { rsDecode, rsEncode, rsSyndromes } from '../src/lib/qr/reedSolomon';
import { symbolRgba } from '../src/lib/qr/render';
import { EC_LEVELS, type EcLevel } from '../src/lib/qr/tables';

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const UNICODE = ['é', 'ß', 'ж', 'λ', '中', '文', 'م', '✓', '€', '🙂', '🌙', 'ü', 'ñ'];

function randomText(rand: () => number, length: number): string {
  const kind = Math.floor(rand() * 5);
  let s = '';
  for (let i = 0; i < length; i++) {
    const r = rand();
    if (kind === 0) s += String(Math.floor(r * 10));
    else if (kind === 1) s += ALNUM[Math.floor(r * ALNUM.length)];
    else if (kind === 2) s += ASCII[Math.floor(r * ASCII.length)];
    else if (kind === 3)
      s +=
        r < 0.2
          ? UNICODE[Math.floor(rand() * UNICODE.length)]
          : ASCII[Math.floor(rand() * ASCII.length)];
    else
      s +=
        r < 0.4
          ? String(Math.floor(rand() * 10)).repeat(1 + Math.floor(rand() * 8))
          : r < 0.7
            ? ALNUM[Math.floor(rand() * 36)]
            : ASCII[Math.floor(rand() * ASCII.length)];
  }
  return s;
}

function randomLength(rand: () => number): number {
  const bucket = rand();
  if (bucket < 0.4) return 1 + Math.floor(rand() * 40);
  if (bucket < 0.75) return 40 + Math.floor(rand() * 260);
  if (bucket < 0.93) return 300 + Math.floor(rand() * 700);
  return 1000 + Math.floor(rand() * 1900);
}

const summary: string[] = [];
const record = (line: string) => {
  summary.push(line);
  console.log(line);
};

describe('large-sample validation', () => {
  it('our encoder → jsQR, 2000 random strings', () => {
    const rand = mulberry32(777);
    let ok = 0;
    let reencoded = 0;
    const versions = new Set<number>();
    const failures: string[] = [];
    const N = 2000;
    for (let n = 0; n < N; n++) {
      const level = EC_LEVELS[n % 4];
      let text = randomText(rand, randomLength(rand));
      let r = encode(text, { level });
      while (!r.ok) {
        text = [...text].slice(0, Math.floor([...text].length * 0.7)).join('');
        r = encode(text, { level });
      }
      if (r.symbol.version === 23 && level === 'L') {
        // jsQR 1.4.0 has a wrong alignment table for version 23 (see tests/interop.test.ts).
        reencoded++;
        r = encode(text, { level, version: 24 });
        if (!r.ok) throw new Error('re-encode');
      }
      const s = r.symbol;
      versions.add(s.version);
      const img = symbolRgba(s.modules, s.size, s.size > 100 ? 2 : 3);
      const out = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (out && out.data === text) ok++;
      else failures.push(`v${s.version}-${level}`);
    }
    record(
      `ours → jsQR: ${ok}/${N} decoded identically, ${versions.size} distinct versions (${reencoded} symbols at 23-L re-encoded at 24 for jsQR)`,
    );
    expect(failures).toEqual([]);
  });

  it('qrcode (npm) → our decoder, 2000 random strings', () => {
    const rand = mulberry32(4242);
    let ok = 0;
    const versions = new Set<number>();
    const failures: string[] = [];
    const N = 2000;
    for (let n = 0; n < N; n++) {
      const level = EC_LEVELS[n % 4] as EcLevel;
      let text = randomText(rand, randomLength(rand));
      let q: ReturnType<typeof QRCode.create> | null = null;
      while (!q) {
        try {
          q = QRCode.create(text, { errorCorrectionLevel: level });
        } catch {
          text = [...text].slice(0, Math.floor([...text].length * 0.7)).join('');
        }
      }
      versions.add(q.version);
      const grid = Uint8Array.from(q.modules.data, (b) => (b ? 1 : 0));
      const d = decodeGrid(grid, q.modules.size);
      if (d.ok && d.text === text) ok++;
      else failures.push(`v${q.version}-${level}`);
    }
    record(`qrcode → ours: ${ok}/${N} decoded identically, ${versions.size} distinct versions`);
    expect(failures).toEqual([]);
  });

  it('Reed–Solomon: correctable patterns and detection beyond capacity', () => {
    const rand = mulberry32(99);
    const shapes: [number, number][] = [
      [26, 7],
      [26, 10],
      [26, 13],
      [26, 17],
      [44, 26],
      [70, 18],
      [100, 26],
      [134, 30],
      [151, 30],
      [255, 30],
    ];
    let corrected = 0;
    let total = 0;
    const beyond = { trials: 0, detected: 0, miscorrected: 0 };
    const perShape: string[] = [];
    for (const [n, d] of shapes) {
      const t = Math.floor(d / 2);
      let sd = 0;
      let sm = 0;
      const per = 1000;
      for (let rep = 0; rep < per; rep++) {
        const data = Array.from({ length: n - d }, () => Math.floor(rand() * 256));
        const cw = Uint8Array.from([...data, ...rsEncode(data, d)]);
        // Correctable: e errors and f erasures with 2e + f <= d.
        const f = Math.floor(rand() * (d + 1));
        const e = Math.floor(rand() * (Math.floor((d - f) / 2) + 1));
        const idx = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [idx[i], idx[j]] = [idx[j], idx[i]];
        }
        const rx = cw.slice();
        for (const p of idx.slice(0, f)) rx[p] = Math.floor(rand() * 256);
        for (const p of idx.slice(f, f + e)) rx[p] ^= 1 + Math.floor(rand() * 255);
        const res = rsDecode(rx, d, idx.slice(0, f));
        total++;
        if (res.ok && res.corrected.every((v, i) => v === cw[i])) corrected++;
        // Beyond capacity: t+1 … t+5 errors, no erasures.
        const eb = t + 1 + Math.floor(rand() * 5);
        const rb = cw.slice();
        for (const p of idx.slice(0, eb)) rb[p] ^= 1 + Math.floor(rand() * 255);
        const rr = rsDecode(rb, d);
        beyond.trials++;
        if (!rr.ok) {
          beyond.detected++;
          sd++;
        } else {
          beyond.miscorrected++;
          sm++;
          expect(rsSyndromes(rr.corrected, d).every((s) => s === 0)).toBe(true);
        }
      }
      perShape.push(
        `(n=${n}, k=${n - d}) t=${t}: ${((100 * sd) / per).toFixed(1)}% detected, ${sm} miscorrections`,
      );
    }
    record(`RS correctable (2e + f ≤ d): ${corrected}/${total} corrected exactly`);
    record(
      `RS beyond capacity (t+1 … t+5 errors): ${beyond.detected}/${beyond.trials} flagged uncorrectable (${((100 * beyond.detected) / beyond.trials).toFixed(2)}%), ${beyond.miscorrected} miscorrections to another valid codeword`,
    );
    for (const l of perShape) record(`  ${l}`);
    expect(corrected).toBe(total);
  });

  it('format information: every 15-bit word', () => {
    let within3 = 0;
    let decodedRight = 0;
    let beyond = 0;
    const valid = (['L', 'M', 'Q', 'H'] as EcLevel[]).flatMap((l) =>
      Array.from({ length: 8 }, (_, m) => formatBits(l, m)),
    );
    for (let w = 0; w < 1 << 15; w++) {
      const dist = Math.min(...valid.map((v) => popcount(v ^ w)));
      const d = decodeFormatBits(w);
      if (dist <= 3) {
        within3++;
        if (d.ok && d.distance === dist) decodedRight++;
      } else {
        beyond++;
        expect(d.ok).toBe(false);
      }
    }
    record(
      `format BCH: all 32768 words — ${decodedRight}/${within3} within distance 3 decoded to their nearest code, ${beyond} farther words rejected`,
    );
    expect(decodedRight).toBe(within3);
  });

  it('random module noise: share of symbols still readable (page URL, 200 trials per cell)', () => {
    const text = 'https://mustafaobaidd1.github.io/quiet-zone-qr/';
    const ps = [0.01, 0.02, 0.03, 0.05, 0.08, 0.12];
    const rows: string[] = [
      'level | version | ' + ps.map((p) => `p=${(p * 100).toFixed(0)}%`).join(' | '),
    ];
    for (const level of EC_LEVELS) {
      const r = encode(text, { level });
      if (!r.ok) throw new Error('encode');
      const s = r.symbol;
      const cells: string[] = [];
      for (const p of ps) {
        let readable = 0;
        let misread = 0;
        for (let seed = 1; seed <= 200; seed++) {
          const a = analyse(
            s,
            applyDamage(s.modules, s.size, [{ kind: 'noise', p, seed: seed * 7919 }]),
            false,
          );
          if (a.verdict === 'readable' || a.verdict === 'pristine') readable++;
          if (a.verdict === 'misread') misread++;
        }
        cells.push(
          `${((readable / 200) * 100).toFixed(0)}%${misread ? ` (${misread} misread)` : ''}`,
        );
      }
      rows.push(`${level} | ${s.version} | ${cells.join(' | ')}`);
    }
    record('noise robustness (share readable):');
    for (const row of rows) record(`  ${row}`);
  });

  it('prints the summary', () => {
    console.log('\n==== SUMMARY ====\n' + summary.join('\n'));
  });
});
