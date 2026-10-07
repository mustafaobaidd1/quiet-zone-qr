<script lang="ts">
  import type { QrSymbol } from '../../lib/qr/encoder';
  import {
    EC_LEVEL_BITS,
    FORMAT_GENERATOR,
    FORMAT_MASK,
    VERSION_GENERATOR,
    formatDataBits,
  } from '../../lib/qr/bch';
  import { formatPositions, versionPositions } from '../../lib/qr/matrix';
  import { cellPath, darkPath } from '../../lib/qr/render';
  import { bin } from '../../lib/format';

  let { symbol }: { symbol: QrSymbol } = $props();

  const size = $derived(symbol.size);

  function bitLength(x: number) {
    return x === 0 ? 0 : 32 - Math.clz32(x);
  }

  /** Steps of the binary long division value mod generator, for display. */
  function division(value: number, generator: number, width: number) {
    const genLen = bitLength(generator);
    const rows: { before: string; gen: string; shift: number }[] = [];
    let r = value;
    while (bitLength(r) >= genLen) {
      const shift = bitLength(r) - genLen;
      rows.push({ before: bin(r, width), gen: bin(generator << shift, width), shift });
      r ^= generator << shift;
    }
    return { rows, remainder: r };
  }

  const data5 = $derived(formatDataBits(symbol.level, symbol.mask));
  const fmtDiv = $derived(division(data5 << 10, FORMAT_GENERATOR, 15));
  const unmaskedFormat = $derived((data5 << 10) | fmtDiv.remainder);

  const verDiv = $derived(
    symbol.version >= 7 ? division(symbol.version << 12, VERSION_GENERATOR, 18) : null,
  );

  const positions = $derived(formatPositions(size));
  const copy1 = $derived(
    new Set(positions.filter((p) => p[3] === 1).map((p) => p[0] * size + p[1])),
  );
  const copy2 = $derived(
    new Set(positions.filter((p) => p[3] === 2).map((p) => p[0] * size + p[1])),
  );
  const verCells = $derived(
    symbol.version >= 7
      ? new Set(versionPositions(size).map((p) => p[0] * size + p[1]))
      : new Set<number>(),
  );

  let hoverBit = $state<number | null>(null);
  const hoverCells = $derived(
    hoverBit === null
      ? new Set<number>()
      : new Set(positions.filter((p) => p[2] === hoverBit).map((p) => p[0] * size + p[1])),
  );

  const symbolDark = $derived(darkPath(symbol.modules, size));
  const fmt1 = $derived(cellPath(size, (i) => copy1.has(i)));
  const fmt2 = $derived(cellPath(size, (i) => copy2.has(i)));
  const ver = $derived(cellPath(size, (i) => verCells.has(i)));
  const hov = $derived(cellPath(size, (i) => hoverCells.has(i)));
  const darkModule = $derived((size - 8) * size + 8);

  const finalBits = $derived(bin(symbol.formatBits, 15).split(''));

  /** Leading zeros as spaces, so each row of the long division lines up under the last. */
  const lead = (bits: string) => bits.replace(/^0+/, (z) => ' '.repeat(z.length));
</script>

<div class="step-text">
  <p>
    A reader must learn the error-correction level and the mask before it can read anything else.
    These
    <strong>5 bits</strong> — level {symbol.level} =
    <span class="mono">{bin(EC_LEVEL_BITS[symbol.level], 2)}</span>, mask {symbol.mask} =
    <span class="mono">{bin(symbol.mask, 3)}</span>
    — get 10 check bits from a (15, 5) <strong>BCH code</strong>: the remainder of dividing by
    <span class="mono"
      >x<sup>10</sup> + x<sup>8</sup> + x<sup>5</sup> + x<sup>4</sup> + x<sup>2</sup> + x + 1</span
    >.
  </p>
  <p>
    The 15 bits are XORed with <span class="mono">101010000010010</span> so they are never all zero,
    then written <strong>twice</strong>: around the top-left finder, and split between the other
    two. Any 3 wrong bits in a copy can be corrected.
  </p>
  {#if symbol.version >= 7}
    <p>
      From version 7 the version number is stored too: 6 bits plus 12 check bits of an (18, 6) BCH
      code, in two 6 × 3 blocks.
    </p>
  {/if}
</div>

<div class="step-viz">
  <div class="cols">
    <div class="calc mono" aria-label="BCH computation of the format information">
      <div class="line">
        <span class="tag">data</span><span class="bits"
          ><b>{bin(data5, 5)}</b><span class="dim">0000000000</span></span
        >
      </div>
      {#each fmtDiv.rows as r, i (i)}
        <div class="line gen">
          <span class="tag">⊕ g·x<sup>{r.shift}</sup></span><span class="bits">{lead(r.gen)}</span>
        </div>
        {#if i < fmtDiv.rows.length - 1}
          <div class="line step">
            <span class="tag"></span><span class="bits">{lead(fmtDiv.rows[i + 1].before)}</span>
          </div>
        {/if}
      {/each}
      <div class="line rule">
        <span class="tag">check</span><span class="bits"
          ><span class="dim">{' '.repeat(5)}</span><b>{bin(fmtDiv.remainder, 10)}</b></span
        >
      </div>
      <div class="line">
        <span class="tag">15 bits</span><span class="bits">{bin(unmaskedFormat, 15)}</span>
      </div>
      <div class="line gen">
        <span class="tag">⊕ mask</span><span class="bits">{bin(FORMAT_MASK, 15)}</span>
      </div>
      <div class="line rule final">
        <span class="tag">format</span><span class="bits">{bin(symbol.formatBits, 15)}</span>
      </div>
    </div>

    <div class="where">
      <svg
        viewBox="-1 -1 {size + 2} {size + 2}"
        role="img"
        aria-label="Where the two copies of the format information sit"
      >
        <rect x="0" y="0" width={size} height={size} fill="#fff" />
        <path d={symbolDark} fill="#111" opacity="0.18" />
        <path d={fmt1} class="c1" />
        <path d={fmt2} class="c2" />
        {#if symbol.version >= 7}<path d={ver} class="ver" />{/if}
        <rect
          x={darkModule % size}
          y={Math.floor(darkModule / size)}
          width="1"
          height="1"
          fill="#111"
        />
        {#if hov}<path d={hov} class="hov" />{/if}
      </svg>
      <ul class="legend">
        <li><span class="sw c1" aria-hidden="true"></span>copy 1</li>
        <li><span class="sw c2" aria-hidden="true"></span>copy 2</li>
        {#if symbol.version >= 7}<li>
            <span class="sw ver" aria-hidden="true"></span>version info
          </li>{/if}
      </ul>
    </div>
  </div>

  <p class="label bits-label">
    Format bits, most significant first — point at one to find both places it is stored
  </p>
  <ol class="bitrow mono">
    {#each finalBits as b, i (i)}
      {@const bit = 14 - i}
      <li>
        <button
          type="button"
          class="bit"
          class:one={b === '1'}
          class:field-level={bit >= 13}
          class:field-mask={bit >= 10 && bit < 13}
          onpointerenter={() => (hoverBit = bit)}
          onpointerleave={() => (hoverBit = null)}
          onfocus={() => (hoverBit = bit)}
          onblur={() => (hoverBit = null)}
          aria-label="Format bit {bit}: {b}"
        >
          <span class="v">{b}</span>
          <span class="idx">{bit}</span>
        </button>
      </li>
    {/each}
  </ol>
  <p class="fields">
    <span class="k level"></span>level <span class="k mask"></span>mask
    <span class="k check"></span>BCH check bits
  </p>

  {#if verDiv && symbol.versionBits !== null}
    <div class="version mono">
      <p class="label">Version information, version {symbol.version}</p>
      <div class="line">
        <span class="tag">version</span><span class="bits"
          ><b>{bin(symbol.version, 6)}</b><span class="dim">000000000000</span></span
        >
      </div>
      <div class="line rule">
        <span class="tag">check</span><span class="bits"
          ><span class="dim">{' '.repeat(6)}</span><b>{bin(verDiv.remainder, 12)}</b></span
        >
      </div>
      <div class="line final">
        <span class="tag">18 bits</span><span class="bits">{bin(symbol.versionBits, 18)}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 260px);
    gap: 28px;
    align-items: start;
  }

  .calc,
  .version {
    display: grid;
    gap: 2px;
    font-size: 15px;
  }

  .line {
    display: grid;
    grid-template-columns: 96px auto;
    align-items: baseline;
  }

  .tag {
    font-size: 11px;
    color: var(--ink-3);
  }

  .bits {
    white-space: pre;
    letter-spacing: 0.12em;
  }

  .dim {
    color: var(--ink-3);
    font-weight: 300;
  }

  .gen .bits {
    color: var(--ink-3);
  }

  .rule .bits,
  .step .bits {
    padding-top: 2px;
    border-top: 1px solid var(--ink);
  }

  .final .bits {
    color: var(--cobalt);
    font-weight: 600;
  }

  sup {
    font-size: 0.75em;
    line-height: 0;
  }

  .where svg {
    width: 100%;
    height: auto;
    shape-rendering: crispEdges;
  }

  .c1 {
    fill: var(--cobalt);
  }

  .c2 {
    fill: #8ea2ff;
  }

  .ver {
    fill: #d3d3ca;
  }

  .hov {
    fill: var(--vermilion);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: var(--ink-2);
  }

  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .sw {
    width: 12px;
    height: 12px;
  }

  .sw.c1 {
    background: var(--cobalt);
  }

  .sw.c2 {
    background: #8ea2ff;
  }

  .sw.ver {
    background: #d3d3ca;
  }

  .bits-label {
    margin-top: 28px;
  }

  .bitrow {
    display: grid;
    grid-template-columns: repeat(15, minmax(0, 1fr));
    gap: 3px;
    max-width: 640px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }

  .bit {
    display: grid;
    width: 100%;
    min-height: 52px;
    padding: 6px 0 4px;
    border: 1px solid var(--rule);
    border-top-width: 4px;
    background: var(--card);
    text-align: center;
  }

  .bit.field-level {
    border-top-color: var(--ink);
  }

  .bit.field-mask {
    border-top-color: var(--ink-3);
  }

  .bit:not(.field-level):not(.field-mask) {
    border-top-color: #cfcfc6;
  }

  .bit.one {
    background: var(--ink);
    color: var(--card);
  }

  .bit:hover,
  .bit:focus-visible {
    outline: 2px solid var(--vermilion);
    outline-offset: 1px;
  }

  .v {
    font-size: 15px;
  }

  .idx {
    font-size: 10px;
    opacity: 0.6;
  }

  .fields {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    font-size: 12px;
    color: var(--ink-3);
  }

  .k {
    display: inline-block;
    width: 14px;
    height: 4px;
    margin-left: 8px;
  }

  .k.level {
    background: var(--ink);
  }

  .k.mask {
    background: var(--ink-3);
  }

  .k.check {
    background: #cfcfc6;
  }

  .version {
    margin-top: 28px;
  }

  @media (max-width: 760px) {
    .cols {
      grid-template-columns: 1fr;
    }

    .where {
      max-width: 260px;
    }

    .calc,
    .version {
      font-size: 13px;
    }

    .line {
      grid-template-columns: 76px auto;
    }
  }
</style>
