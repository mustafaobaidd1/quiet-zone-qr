/** SVG path helpers in module units. */

/**
 * Outline of the union of a set of cells: only edges between an included and an excluded cell
 * are drawn, so a codeword spread over two columns reads as one shape.
 */
export function boundaryPath(size: number, cells: Iterable<number>, offset = 0): string {
  const set = new Set(cells);
  let d = '';
  for (const i of set) {
    const r = Math.floor(i / size);
    const c = i % size;
    const x = c + offset;
    const y = r + offset;
    if (r === 0 || !set.has(i - size)) d += `M${x} ${y}h1`;
    if (r === size - 1 || !set.has(i + size)) d += `M${x} ${y + 1}h1`;
    if (c === 0 || !set.has(i - 1)) d += `M${x} ${y}v1`;
    if (c === size - 1 || !set.has(i + 1)) d += `M${x + 1} ${y}v1`;
  }
  return d;
}

/** Small squares inset by `inset` (module units) for each listed cell. */
export function insetSquares(
  size: number,
  cells: Iterable<number>,
  inset: number,
  offset = 0,
): string {
  let d = '';
  const s = 1 - 2 * inset;
  for (const i of cells) {
    const r = Math.floor(i / size);
    const c = i % size;
    d += `M${c + offset + inset} ${r + offset + inset}h${s}v${s}h${-s}z`;
  }
  return d;
}

/** Polygon points attribute from normalised coordinates. */
export function polygonPoints(points: [number, number][], size: number, offset: number): string {
  return points
    .map(([x, y]) => `${(x * size + offset).toFixed(3)},${(y * size + offset).toFixed(3)}`)
    .join(' ');
}
