/**
 * Interoperability property tests against two independent implementations (devDependencies
 * only — the shipped encoder/decoder never imports them):
 *  - symbols from our encoder must decode with jsQR (camera-style decoder working on pixels);
 *  - symbols from the `qrcode` npm package must decode with our grid decoder.
 */
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/lib/damage/rng';
import { decodeGrid } from '../src/lib/qr/decoder';
import { encode } from '../src/lib/qr/encoder';
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
    // Mixed runs that make the optimal segmentation switch modes.
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

/** Lengths spread from tiny symbols up to version 40. */
function randomLength(rand: () => number): number {
  const bucket = rand();
  if (bucket < 0.4) return 1 + Math.floor(rand() * 40);
  if (bucket < 0.75) return 40 + Math.floor(rand() * 260);
  if (bucket < 0.93) return 300 + Math.floor(rand() * 700);
  return 1000 + Math.floor(rand() * 1600);
}

/**
 * jsQR 1.4.0 lists the alignment pattern centres of version 23 as 6, 30, 54, 74, 102; the
 * standard (Annex E) says 6, 30, 54, 78, 102. It therefore samples some modules wrongly in every
 * version-23 symbol; at levels M, Q and H Reed–Solomon absorbs the misreads, at level L it cannot.
 * Where our encoder picks 23-L we re-encode at version 24 before handing the symbol to jsQR.
 */
const JSQR_BROKEN_VERSION = 23;

describe('our encoder → jsQR', () => {
  it('300 random strings across modes, versions and all four levels decode identically', () => {
    const rand = mulberry32(20261006);
    const versions = new Set<number>();
    let decoded = 0;
    const failures: string[] = [];
    for (let n = 0; n < 300; n++) {
      const level = EC_LEVELS[n % 4];
      let text = randomText(rand, randomLength(rand));
      let r = encode(text, { level });
      while (!r.ok) {
        text = [...text].slice(0, Math.floor([...text].length * 0.7)).join('');
        r = encode(text, { level });
      }
      if (r.symbol.version === JSQR_BROKEN_VERSION && level === 'L')
        r = encode(text, { level, version: 24 });
      if (!r.ok) throw new Error('re-encode');
      const s = r.symbol;
      versions.add(s.version);
      const scale = s.size > 100 ? 2 : 3;
      const img = symbolRgba(s.modules, s.size, scale);
      const out = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (out && out.data === text && out.version === s.version) decoded++;
      else
        failures.push(
          `v${s.version}-${level} len ${text.length}: ${out ? JSON.stringify(out.data.slice(0, 30)) : 'null'}`,
        );
    }
    expect(failures).toEqual([]);
    expect(decoded).toBe(300);
    expect(versions.size).toBeGreaterThan(25);
  }, 120_000);

  it('every version 1–40 at every level (except jsQR’s broken 23-L) decodes with jsQR', () => {
    const failures: string[] = [];
    for (let v = 1; v <= 40; v++) {
      for (const level of EC_LEVELS) {
        if (v === JSQR_BROKEN_VERSION && level === 'L') continue;
        const text = `QZ${v}${level}`;
        const r = encode(text, { level, version: v });
        if (!r.ok) throw new Error('encode');
        const s = r.symbol;
        const img = symbolRgba(s.modules, s.size, s.size > 100 ? 2 : 3);
        const out = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (!out || out.data !== text || out.version !== v) failures.push(`${v}-${level}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it('version 23-L fails in jsQR for the qrcode package too, while our decoder reads both', () => {
    const text = 'Version twenty-three '.repeat(40);
    const q = QRCode.create(text, { errorCorrectionLevel: 'L', version: 23 });
    const theirs = Uint8Array.from(q.modules.data, (b) => (b ? 1 : 0));
    const ours = encode(text, { level: 'L', version: 23 });
    if (!ours.ok) throw new Error('encode');
    for (const grid of [theirs, ours.symbol.modules]) {
      const img = symbolRgba(grid, q.modules.size, 3);
      expect(jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })).toBeNull();
      expect(decodeGrid(grid, q.modules.size).text).toBe(text);
    }
  });
});

describe('qrcode (npm) encoder → our decoder', () => {
  it('300 random strings across versions and levels decode identically', () => {
    const rand = mulberry32(42);
    const failures: string[] = [];
    const versions = new Set<number>();
    for (let n = 0; n < 300; n++) {
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
      const size = q.modules.size;
      versions.add(q.version);
      const grid = Uint8Array.from(q.modules.data, (b) => (b ? 1 : 0));
      const d = decodeGrid(grid, size);
      if (!d.ok || d.text !== text)
        failures.push(
          `v${q.version}-${level}: ${d.failure?.reason ?? JSON.stringify(d.text?.slice(0, 30))}`,
        );
    }
    expect(failures).toEqual([]);
    expect(versions.size).toBeGreaterThan(25);
  }, 120_000);

  it('qrcode symbols with forced masks and versions decode, and our decoder reads their mask', () => {
    for (let mask = 0; mask < 8; mask++) {
      const q = QRCode.create('MASK ' + mask, {
        errorCorrectionLevel: 'H',
        maskPattern: mask as 0,
        version: 3,
      });
      const grid = Uint8Array.from(q.modules.data, (b) => (b ? 1 : 0));
      const d = decodeGrid(grid, q.modules.size);
      expect(d.text).toBe('MASK ' + mask);
      expect(d.mask).toBe(mask);
    }
  });

  it('our symbols equal qrcode’s module for module when both use the same segments and mask', () => {
    // Byte-mode text (both libraries pick a single byte segment) with a fixed version and mask.
    for (const level of EC_LEVELS) {
      for (const v of [1, 5, 7, 12, 25, 40]) {
        const text = 'qz' + 'x'.repeat(v);
        const ours = encode(text, { level, version: v, mask: 3, mode: 'byte' });
        if (!ours.ok) throw new Error('encode');
        const q = QRCode.create([{ data: Buffer.from(text, 'utf8'), mode: 'byte' }], {
          errorCorrectionLevel: level,
          version: v,
          maskPattern: 3 as 0,
        });
        expect(Array.from(ours.symbol.modules)).toEqual(
          Array.from(q.modules.data, (b) => (b ? 1 : 0)),
        );
      }
    }
  });
});
