/** Small deterministic pseudo-random generators (no Math.random so damage replays exactly). */

/** mulberry32: 32-bit state, period 2^32, good enough for visual noise and tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash of (seed, a, b) to [0, 1): the same module always gets the same draw. */
export function hash3(seed: number, a: number, b: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.imul(a + 0x632be5ab, 0xc2b2ae35), 0x27d4eb2f);
  h = Math.imul(h ^ Math.imul(b + 0x165667b1, 0x85ebca6b), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
