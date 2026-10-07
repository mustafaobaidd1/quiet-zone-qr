<script lang="ts">
  import { onDestroy } from 'svelte';
  import PlayerControls from './PlayerControls.svelte';
  import type { QrSymbol } from '../../lib/qr/encoder';
  import { generatorPolynomial, gfMul, LOG } from '../../lib/qr/gf256';
  import { Player, prefersReducedMotion } from '../../lib/player.svelte';
  import { hex } from '../../lib/format';

  let { symbol, visible }: { symbol: QrSymbol; visible: boolean } = $props();

  let blockIndex = $state(0);
  const block = $derived(symbol.blocks[Math.min(blockIndex, symbol.blocks.length - 1)]);
  const d = $derived(symbol.layout.ecCodewordsPerBlock);
  const g = $derived(generatorPolynomial(d));

  /** The division as a shift register: one row per data codeword. */
  const rows = $derived.by(() => {
    const reg = new Array<number>(d).fill(0);
    const out: { m: number; f: number; reg: number[]; changed: boolean[] }[] = [];
    for (const m of block.data) {
      const f = m ^ reg[0];
      const next = reg.slice(1).concat(0);
      for (let j = 0; j < d; j++) next[j] ^= gfMul(g[j + 1], f);
      out.push({ m, f, reg: next, changed: next.map((v, j) => v !== reg[j]) });
      reg.splice(0, d, ...next);
    }
    return out;
  });

  const player = new Player(1, 7);
  let tableWrap: HTMLDivElement | undefined = $state();

  let autoplay = $state(false);

  $effect(() => {
    // Restart whenever the block (or symbol) changes.
    const k = rows.length;
    player.reset(k, Math.max(6, k / 5));
    if (prefersReducedMotion()) player.finish();
    else autoplay = true;
  });

  $effect(() => {
    if (visible && autoplay) {
      autoplay = false;
      player.play();
    }
    if (!visible) player.stop();
  });

  onDestroy(() => player.stop());

  const shown = $derived(Math.floor(player.progress));
  const done = $derived(shown >= rows.length);

  $effect(() => {
    void shown;
    if (tableWrap && (player.playing || done)) tableWrap.scrollTop = tableWrap.scrollHeight;
  });
</script>

<div class="step-text">
  <p>
    Each block of data codewords is read as a polynomial <span class="mono">m(x)</span> over GF(256)
    and divided by the generator
    <span class="mono">g(x) = (x − α<sup>0</sup>)(x − α<sup>1</sup>)…(x − α<sup>{d - 1}</sup>)</span
    >. The remainder is the block’s <strong>{d} error-correction codewords</strong>.
  </p>
  <p>
    Long division here is a shift register: XOR the next data codeword into the front cell, multiply
    the generator by that lead value, XOR it into the register, shift. Appending the remainder makes
    the whole block a multiple of <span class="mono">g(x)</span>, which is what the decoder checks.
  </p>
  <p>
    {d} check symbols can locate and fix <strong>t = ⌊{d}/2⌋ = {Math.floor(d / 2)}</strong> wrong codewords
    in this block.
  </p>
</div>

<div class="step-viz">
  {#if symbol.blocks.length > 1}
    <div class="blocks" role="group" aria-label="Block">
      {#if symbol.blocks.length <= 8}
        {#each symbol.blocks as b (b.index)}
          <button
            type="button"
            aria-pressed={blockIndex === b.index}
            onclick={() => (blockIndex = b.index)}>Block {b.index + 1}</button
          >
        {/each}
      {:else}
        <label class="label" for="rs-block">Block</label>
        <select id="rs-block" bind:value={blockIndex}>
          {#each symbol.blocks as b (b.index)}
            <option value={b.index}>Block {b.index + 1} of {symbol.blocks.length}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/if}

  <p class="gen mono" aria-label="Generator polynomial coefficients as powers of alpha">
    <span class="label">g(x)</span>
    {#each Array.from(g) as c, i (i)}
      <span class="term">α<sup>{LOG[c]}</sup><span class="x">x<sup>{d - i}</sup></span></span>
    {/each}
  </p>

  <PlayerControls {player} label="polynomial division" unit="step" />

  <!-- Scrollable region: focusable so keyboard users can scroll it (WCAG 2.1.1). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="table-wrap"
    bind:this={tableWrap}
    role="region"
    aria-label="Polynomial division, one row per step"
    tabindex="0"
  >
    <table class="rs mono">
      <thead>
        <tr>
          <th scope="col">step</th>
          <th scope="col">in</th>
          <th scope="col">lead</th>
          <th scope="col" colspan={d} class="reg-head">remainder register ({d} codewords)</th>
        </tr>
      </thead>
      <tbody>
        {#each rows.slice(0, shown) as r, i (i)}
          <tr class:latest={i === shown - 1 && !done}>
            <th scope="row">{i + 1}</th>
            <td class="in">{hex(r.m)}</td>
            <td class="lead"
              >{r.f === 0 ? '0' : ''}{#if r.f !== 0}α<sup>{LOG[r.f]}</sup>{/if}</td
            >
            {#each r.reg as v, j (j)}
              <td
                class:changed={r.changed[j] && i === shown - 1}
                class:final={done && i === rows.length - 1}>{hex(v)}</td
              >
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="result">
    <p class="label">EC codewords of block {block.index + 1}</p>
    {#if done}
      <p class="mono ec" data-testid="rs-ec">
        {#each Array.from(block.ec) as v, i (i)}<span>{hex(v)}</span>{/each}
      </p>
      <p class="check">
        Register after {rows.length} steps = the {d} EC codewords placed in the symbol.
      </p>
    {:else}
      <p class="waiting">The remainder appears after the last of the {rows.length} steps.</p>
    {/if}
  </div>
</div>

<style>
  .blocks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 16px;
  }

  .blocks button {
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid var(--ink);
    border-radius: var(--radius);
    background: var(--card);
    font-size: 13px;
  }

  .blocks button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--card);
  }

  .blocks select {
    min-height: 40px;
    padding: 0 10px;
    border: 1px solid var(--ink);
    background: var(--card);
  }

  .gen {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    margin-bottom: 16px;
    font-size: 13px;
  }

  .term {
    white-space: nowrap;
  }

  .x {
    margin-left: 1px;
    color: var(--ink-3);
  }

  sup {
    font-size: 0.72em;
    line-height: 0;
  }

  .table-wrap {
    max-height: 380px;
    margin-top: 12px;
    overflow: auto;
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--ink);
    background: var(--card);
  }

  .rs {
    border-collapse: collapse;
    font-size: 12px;
  }

  .rs thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 6px 6px;
    background: var(--card);
    border-bottom: 1px solid var(--rule);
    font-size: 11px;
    font-weight: 400;
    color: var(--ink-3);
    text-align: left;
    white-space: nowrap;
  }

  .rs tbody th {
    padding: 3px 8px;
    font-weight: 400;
    color: var(--ink-3);
    text-align: right;
  }

  .rs td {
    padding: 3px 4px;
    text-align: center;
    white-space: nowrap;
  }

  .rs td.in {
    padding-right: 8px;
  }

  .rs td.lead {
    min-width: 44px;
    padding-right: 10px;
    border-right: 1px solid var(--rule);
    color: var(--ink-2);
  }

  .rs tr.latest {
    background: var(--cobalt-soft);
  }

  .rs td.changed {
    color: var(--cobalt);
    font-weight: 600;
  }

  .rs td.final {
    background: var(--cobalt);
    color: #fff;
  }

  .result {
    margin-top: 16px;
  }

  .waiting {
    margin-top: 6px;
    font-size: 13px;
    color: var(--ink-3);
  }

  .ec {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
    font-size: 14px;
  }

  .ec span {
    padding: 3px 5px;
    border: 1px solid var(--cobalt);
    color: var(--cobalt);
  }

  .check {
    margin-top: 8px;
    font-size: 13px;
    color: var(--ink-2);
  }
</style>
