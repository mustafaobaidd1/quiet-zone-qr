<script lang="ts">
  import type { QrSymbol } from '../../lib/qr/encoder';
  import { fmt, hex } from '../../lib/format';

  let { symbol }: { symbol: QrSymbol } = $props();

  const ROW = 16;
  const MAX_ROWS = 12;
  let all = $state(false);

  const headerBits = $derived(
    symbol.segments.reduce(
      (n, s) =>
        n + s.chunks.filter((c) => c.kind !== 'data').reduce((m, c) => m + c.bits.length, 0),
      0,
    ),
  );
  const dataBits = $derived(symbol.segmentBits - headerBits);
  const padBits = $derived(symbol.padCodewords * 8);
  const total = $derived(symbol.capacityBits);

  const parts = $derived([
    { key: 'header', label: 'mode + count', bits: headerBits },
    { key: 'data', label: 'characters', bits: dataBits },
    { key: 'term', label: 'terminator', bits: symbol.terminatorBits },
    { key: 'align', label: 'to byte', bits: symbol.byteAlignBits },
    { key: 'pad', label: 'pad bytes', bits: padBits },
  ]);

  const firstPad = $derived(symbol.dataCodewords.length - symbol.padCodewords);
  const rows = $derived.by(() => {
    const out: number[][] = [];
    for (let i = 0; i < symbol.dataCodewords.length; i += ROW)
      out.push(Array.from(symbol.dataCodewords.slice(i, i + ROW)));
    return out;
  });
  const visibleRows = $derived(all ? rows : rows.slice(0, MAX_ROWS));
</script>

<div class="step-text">
  <p>
    The bit stream is closed with up to four <strong>terminator</strong> zeros, padded with zeros to
    a whole byte, and cut into 8-bit <strong>codewords</strong>.
  </p>
  <p>
    Whatever room is left in version {symbol.version}-{symbol.level} is filled with the pad bytes
    <span class="mono">EC</span> and <span class="mono">11</span> (11101100 and 00010001) in turn, so
    the symbol never contains long runs of zeros.
  </p>
  <p>
    <strong>{symbol.dataCodewords.length} data codewords</strong>: {fmt(firstPad)} carry the message,
    {symbol.padCodewords} are padding.
  </p>
</div>

<div class="step-viz">
  <div class="stream" aria-label="Composition of the {fmt(total)} data bits">
    {#each parts as p (p.key)}
      {#if p.bits > 0}
        <div class="part {p.key}" style:flex-grow={p.bits} title="{p.label}: {p.bits} bits">
          <span class="bar"></span>
        </div>
      {/if}
    {/each}
  </div>
  <ul class="stream-legend">
    {#each parts as p (p.key)}
      <li class={p.key}>
        <span class="sw" aria-hidden="true"></span>{p.label} <span class="num">{fmt(p.bits)}</span>
      </li>
    {/each}
    <li class="total">capacity <span class="num">{fmt(total)} bits</span></li>
  </ul>

  <!-- Scrollable region: focusable so keyboard users can scroll it (WCAG 2.1.1). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="hex-wrap" role="region" aria-label="Data codewords table" tabindex="0">
    <table class="hex mono" aria-label="Data codewords in hexadecimal">
      <thead>
        <tr>
          <th scope="col" class="corner"></th>
          {#each Array.from({ length: ROW }, (_, i) => i) as c (c)}
            <th scope="col">+{hex(c, 1)}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each visibleRows as r, ri (ri)}
          <tr>
            <th scope="row">{String(ri * ROW).padStart(3, '0')}</th>
            {#each r as v, ci (ci)}
              {@const i = ri * ROW + ci}
              <td class:pad={i >= firstPad}>{hex(v)}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if rows.length > MAX_ROWS}
    <button type="button" class="more" onclick={() => (all = !all)}>
      {all ? 'Show fewer rows' : `Show all ${rows.length} rows`}
    </button>
  {/if}
  <p class="key"><span class="sw-pad" aria-hidden="true"></span> pad bytes</p>
</div>

<style>
  .stream {
    display: flex;
    gap: 2px;
    height: 28px;
  }

  .part {
    flex-basis: 0;
    min-width: 3px;
  }

  .bar {
    display: block;
    height: 100%;
  }

  .header .bar,
  .header .sw {
    background: var(--ink);
  }

  .data .bar,
  .data .sw {
    background: #5b5b55;
  }

  .term .bar,
  .term .sw {
    background: var(--cobalt);
  }

  .align .bar,
  .align .sw {
    background: #8ea2ff;
  }

  .pad .bar,
  .pad .sw {
    background: repeating-linear-gradient(-45deg, #b4b4ab 0 2px, transparent 2px 5px);
    box-shadow: inset 0 0 0 1px #b4b4ab;
  }

  .stream-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    font-size: 13px;
    color: var(--ink-2);
  }

  .stream-legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .sw {
    display: inline-block;
    width: 12px;
    height: 12px;
  }

  .total {
    margin-left: auto;
    color: var(--ink-3);
  }

  .hex-wrap {
    margin-top: 28px;
    overflow-x: auto;
  }

  .hex {
    border-collapse: collapse;
    font-size: 13px;
  }

  .hex th {
    padding: 4px 6px;
    font-weight: 400;
    font-size: 11px;
    color: var(--ink-3);
    text-align: center;
  }

  .hex thead th {
    border-bottom: 1px solid var(--ink);
  }

  .hex tbody th {
    padding-right: 12px;
    border-right: 1px solid var(--ink);
    text-align: right;
  }

  .hex td {
    min-width: 30px;
    padding: 5px 6px;
    text-align: center;
    border-bottom: 1px solid var(--rule-soft);
  }

  .hex td.pad {
    color: var(--ink-3);
    background: repeating-linear-gradient(-45deg, rgb(0 0 0 / 0.035) 0 2px, transparent 2px 5px);
  }

  .more {
    min-height: 40px;
    margin-top: 10px;
    padding: 0 12px;
    border: 1px dashed var(--ink-3);
    background: none;
    font-size: 13px;
  }

  .key {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    font-size: 13px;
    color: var(--ink-3);
  }

  .sw-pad {
    width: 14px;
    height: 14px;
    border: 1px solid #b4b4ab;
    background: repeating-linear-gradient(-45deg, rgb(0 0 0 / 0.08) 0 2px, transparent 2px 5px);
  }
</style>
