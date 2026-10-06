/**
 * Damage model. Every change to the printed code is stored as an operation in normalised symbol
 * coordinates — (0, 0) is the top-left corner of module (0, 0) and (1, 1) the bottom-right
 * corner of the last module; the quiet zone lies outside [0, 1]. Replaying the operation list
 * on a fresh symbol gives the damaged grid, so damage survives re-encoding (a scratch keeps its
 * physical place when the text, and therefore the version, changes) and undo is just "drop the
 * last operation".
 */

import { hash3, mulberry32 } from './rng';

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export type DamageOp =
  /** Flip every module the stroke touches (once per stroke). points = [x0, y0, x1, y1, …]. */
  | { kind: 'scratch'; points: number[]; radius: number }
  /** Make every module the stroke touches light. */
  | { kind: 'erase'; points: number[]; radius: number }
  /** A white logo sticker: modules whose centre lies inside become light (and known-bad). */
  | { kind: 'sticker'; x: number; y: number; w: number; h: number }
  /** Flip each module independently with probability p. */
  | { kind: 'noise'; p: number; seed: number }
  /** Tear off a corner: the paper beyond a jagged line is gone, so those modules read light. */
  | { kind: 'tear'; corner: Corner; depth: number; seed: number };

export interface TearShape {
  corner: Corner;
  /** Jagged tear line, normalised coordinates, from one paper edge to the other. */
  edge: [number, number][];
  /** Polygon of the missing paper (edge plus the paper corner), normalised coordinates. */
  polygon: [number, number][];
}

export interface DamageState {
  modules: Uint8Array;
  /** 1 where the paper (and module) is torn away. */
  torn: Uint8Array;
  /** 1 where a module is hidden under a sticker. */
  sticker: Uint8Array;
  /** 1 where the module differs from the undamaged symbol. */
  changed: Uint8Array;
  changedCount: number;
  tears: TearShape[];
  stickers: { x: number; y: number; w: number; h: number }[];
}

/** Distance from point (px, py) to segment (ax, ay)–(bx, by). */
function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx - px;
  const qy = ay + t * dy - py;
  return Math.sqrt(qx * qx + qy * qy);
}

/** Modules whose centre lies within `radius` of the polyline (normalised units). */
export function strokeCells(points: readonly number[], radius: number, size: number): number[] {
  const cells = new Set<number>();
  const n = points.length / 2;
  if (n === 0) return [];
  const rr = radius * size; // radius in modules
  for (let k = 0; k < n; k++) {
    const ax = points[2 * Math.max(0, k - 1)] * size;
    const ay = points[2 * Math.max(0, k - 1) + 1] * size;
    const bx = points[2 * k] * size;
    const by = points[2 * k + 1] * size;
    const c0 = Math.max(0, Math.floor(Math.min(ax, bx) - rr - 1));
    const c1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + rr + 1));
    const r0 = Math.max(0, Math.floor(Math.min(ay, by) - rr - 1));
    const r1 = Math.min(size - 1, Math.ceil(Math.max(ay, by) + rr + 1));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (segmentDistance(c + 0.5, r + 0.5, ax, ay, bx, by) <= rr) cells.add(r * size + c);
      }
    }
  }
  return [...cells];
}

/** Map corner-local coordinates (u inward horizontally, v inward vertically) to normalised. */
function fromCorner(corner: Corner, u: number, v: number): [number, number] {
  const x = corner === 'tl' || corner === 'bl' ? u : 1 - u;
  const y = corner === 'tl' || corner === 'tr' ? v : 1 - v;
  return [x, y];
}

function toCorner(corner: Corner, x: number, y: number): [number, number] {
  const u = corner === 'tl' || corner === 'bl' ? x : 1 - x;
  const v = corner === 'tl' || corner === 'tr' ? y : 1 - y;
  return [u, v];
}

const SQRT1_2 = Math.SQRT1_2;

/**
 * The jagged tear profile: offset (normalised units, along the inward diagonal) as a function of
 * position t ∈ [0, 1] along the tear. A sum of a few seeded sine octaves plus a small random walk
 * gives the fibrous, slightly wavy look of torn paper.
 */
function tearProfile(seed: number, depth: number): (t: number) => number {
  const rand = mulberry32(seed);
  const octaves = [
    { f: 1.3 + rand(), a: 0.07, p: rand() * Math.PI * 2 },
    { f: 4 + rand() * 2, a: 0.03, p: rand() * Math.PI * 2 },
    { f: 11 + rand() * 4, a: 0.012, p: rand() * Math.PI * 2 },
  ];
  const steps = 96;
  const walk: number[] = [0];
  for (let i = 1; i <= steps; i++) walk.push(walk[i - 1] * 0.82 + (rand() - 0.5) * 0.018);
  const scale = Math.max(0.35, Math.min(1, depth * 2.2));
  return (t: number) => {
    let o = 0;
    for (const { f, a, p } of octaves) o += a * Math.sin(t * f * Math.PI * 2 + p);
    const w = walk[Math.max(0, Math.min(steps, Math.round(t * steps)))];
    return (o + w) * scale;
  };
}

/** Geometry of a tear (normalised), given the quiet-zone width in normalised units. */
export function tearShape(op: Extract<DamageOp, { kind: 'tear' }>, quiet: number): TearShape {
  const { corner, depth, seed } = op;
  const profile = tearProfile(seed, depth);
  // The straight tear line u + v = depth, extended to the paper edges u = −quiet and v = −quiet.
  const a: [number, number] = [-quiet, depth + quiet];
  const b: [number, number] = [depth + quiet, -quiet];
  const edge: [number, number][] = [];
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = a[0] + (b[0] - a[0]) * t;
    const v = a[1] + (b[1] - a[1]) * t;
    const off = profile(t);
    edge.push(fromCorner(corner, u + off * SQRT1_2, v + off * SQRT1_2));
  }
  const paperCorner = fromCorner(corner, -quiet, -quiet);
  return { corner, edge, polygon: [...edge, paperCorner] };
}

/** Is a normalised point on the torn-away side of the tear? */
function isTorn(
  op: Extract<DamageOp, { kind: 'tear' }>,
  profile: (t: number) => number,
  quiet: number,
  x: number,
  y: number,
): boolean {
  const [u, v] = toCorner(op.corner, x, y);
  // Position along the tear (0 at the u = −quiet end) and signed distance along the inward normal.
  const len = Math.SQRT2 * (op.depth + 2 * quiet);
  const along = ((u - v) * SQRT1_2 + (op.depth + 2 * quiet) * SQRT1_2) / len;
  const normal = (u + v - op.depth) * SQRT1_2;
  return normal < profile(Math.max(0, Math.min(1, along)));
}

/** Replay damage operations on an undamaged symbol. */
export function applyDamage(
  original: Uint8Array,
  size: number,
  ops: readonly DamageOp[],
  quietModules = 4,
): DamageState {
  const modules = Uint8Array.from(original);
  const torn = new Uint8Array(original.length);
  const sticker = new Uint8Array(original.length);
  const tears: TearShape[] = [];
  const stickers: DamageState['stickers'] = [];
  const quiet = quietModules / size;

  for (const op of ops) {
    switch (op.kind) {
      case 'scratch':
        for (const i of strokeCells(op.points, op.radius, size)) if (!torn[i]) modules[i] ^= 1;
        break;
      case 'erase':
        for (const i of strokeCells(op.points, op.radius, size)) modules[i] = 0;
        break;
      case 'sticker': {
        const x0 = Math.min(op.x, op.x + op.w);
        const y0 = Math.min(op.y, op.y + op.h);
        const w = Math.abs(op.w);
        const h = Math.abs(op.h);
        stickers.push({ x: x0, y: y0, w, h });
        for (let r = 0; r < size; r++) {
          const cy = (r + 0.5) / size;
          if (cy < y0 || cy > y0 + h) continue;
          for (let c = 0; c < size; c++) {
            const cx = (c + 0.5) / size;
            if (cx >= x0 && cx <= x0 + w) {
              modules[r * size + c] = 0;
              sticker[r * size + c] = 1;
            }
          }
        }
        break;
      }
      case 'noise':
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            const i = r * size + c;
            if (!torn[i] && hash3(op.seed, r, c) < op.p) modules[i] ^= 1;
          }
        }
        break;
      case 'tear': {
        const profile = tearProfile(op.seed, op.depth);
        tears.push(tearShape(op, quiet));
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            if (isTorn(op, profile, quiet, (c + 0.5) / size, (r + 0.5) / size)) {
              const i = r * size + c;
              torn[i] = 1;
              modules[i] = 0;
              sticker[i] = 0;
            }
          }
        }
        break;
      }
    }
  }

  const changed = new Uint8Array(original.length);
  let changedCount = 0;
  for (let i = 0; i < original.length; i++) {
    if (modules[i] !== original[i]) {
      changed[i] = 1;
      changedCount++;
    }
  }
  return { modules, torn, sticker, changed, changedCount, tears, stickers };
}

/** The corner nearest to a normalised point, and the tear depth that reaches it. */
export function tearFromPoint(x: number, y: number): { corner: Corner; depth: number } {
  const corner: Corner = ((y < 0.5 ? 't' : 'b') + (x < 0.5 ? 'l' : 'r')) as Corner;
  const [u, v] = toCorner(corner, x, y);
  const depth = Math.max(0.08, Math.min(0.9, u + v));
  return { corner, depth };
}
