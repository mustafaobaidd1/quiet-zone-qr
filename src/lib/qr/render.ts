/** Rendering helpers shared by the interface, the exporters and the interoperability tests. */

/** The quiet zone required around every QR code symbol: four modules (ISO/IEC 18004 §6.3.8). */
export const QUIET_ZONE = 4;

/**
 * SVG path data for the dark modules: one subpath per horizontal run, in module units, offset
 * by `offset` modules (e.g. the quiet zone).
 */
export function darkPath(
  modules: ArrayLike<number>,
  size: number,
  offset = 0,
  include?: (index: number) => boolean,
): string {
  let d = '';
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      const i = r * size + c;
      if (modules[i] && (!include || include(i))) {
        let end = c + 1;
        while (end < size && modules[r * size + end] && (!include || include(r * size + end)))
          end++;
        d += `M${c + offset} ${r + offset}h${end - c}v1h${c - end}z`;
        c = end;
      } else {
        c++;
      }
    }
  }
  return d;
}

/** Path data covering every module for which `include` is true (both colours). */
export function cellPath(size: number, include: (index: number) => boolean, offset = 0): string {
  let d = '';
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (include(r * size + c)) {
        let end = c + 1;
        while (end < size && include(r * size + end)) end++;
        d += `M${c + offset} ${r + offset}h${end - c}v1h${c - end}z`;
        c = end;
      } else {
        c++;
      }
    }
  }
  return d;
}

/** A standalone, printable SVG of the symbol with its quiet zone. */
export function symbolSvg(modules: ArrayLike<number>, size: number, title: string): string {
  const total = size + 2 * QUIET_ZONE;
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total * 8}" height="${total * 8}" shape-rendering="crispEdges">`,
    `<title>${escaped}</title>`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path fill="#000000" d="${darkPath(modules, size, QUIET_ZONE)}"/>`,
    `</svg>`,
  ].join('');
}

/** RGBA pixels (white background, black modules) with a quiet zone, `scale` pixels per module. */
export function symbolRgba(
  modules: ArrayLike<number>,
  size: number,
  scale: number,
  quiet = QUIET_ZONE,
): { data: Uint8ClampedArray; width: number; height: number } {
  const total = (size + 2 * quiet) * scale;
  const data = new Uint8ClampedArray(total * total * 4).fill(255);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!modules[r * size + c]) continue;
      const y0 = (r + quiet) * scale;
      const x0 = (c + quiet) * scale;
      for (let y = y0; y < y0 + scale; y++) {
        let p = (y * total + x0) * 4;
        for (let x = 0; x < scale; x++, p += 4) {
          data[p] = 0;
          data[p + 1] = 0;
          data[p + 2] = 0;
        }
      }
    }
  }
  return { data, width: total, height: total };
}

/** Pixels per module for a PNG of at least `minPixels` across (integer, so edges stay sharp). */
export function pngScale(size: number, minPixels = 1024): number {
  return Math.max(1, Math.ceil(minPixels / (size + 2 * QUIET_ZONE)));
}
