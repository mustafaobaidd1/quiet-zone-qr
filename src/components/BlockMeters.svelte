<script lang="ts">
  import type { BlockAnalysis } from '../lib/damage/analysis';
  import { app } from '../lib/state.svelte';

  let { blocks }: { blocks: BlockAnalysis[] } = $props();

  /** Room drawn beyond the limit for overflow, as a share of the budget. */
  const OVER = 0.5;

  const many = $derived(blocks.length > 8);
  const erasureView = $derived(blocks.some((b) => b.erasures > 0));

  /** Budget used (2e + f): the decoder's count when it succeeded, the true damage when not. */
  function used(b: BlockAnalysis) {
    if (b.ok && !b.miscorrected) return 2 * b.corrected + b.erasures;
    return b.budget;
  }

  function errorsShown(b: BlockAnalysis) {
    return b.ok && !b.miscorrected ? b.corrected : b.damaged - b.damagedErasures;
  }

  const worst = $derived(
    blocks.reduce<BlockAnalysis | null>(
      (w, b) => (!w || used(b) / b.ecCount > used(w) / w.ecCount ? b : w),
      null,
    ),
  );

  function setFocus(i: number | null) {
    app.focusBlock = i;
  }
</script>

{#if !many}
  <ol class="meters" aria-label="Error budget per Reed–Solomon block">
    {#each blocks as b (b.index)}
      {@const value = erasureView ? used(b) : errorsShown(b)}
      {@const limit = erasureView ? b.ecCount : Math.max(1, b.capacity)}
      {@const step = erasureView ? 2 : 1}
      {@const over = value > limit || b.miscorrected}
      {@const fill = Math.min(value, limit) / limit}
      {@const spill = Math.min(Math.max(value - limit, 0) / limit, OVER)}
      <li
        class="meter"
        class:over
        onpointerenter={() => setFocus(b.index)}
        onpointerleave={() => setFocus(null)}
        data-testid="block-meter"
        data-block={b.index + 1}
        data-errors={errorsShown(b)}
        data-ok={b.ok && !b.miscorrected}
      >
        <span class="figures num" aria-hidden="true">
          <span class="big">{value}</span><span class="of">/{limit}</span>
        </span>
        <span class="body">
          <span class="head" aria-hidden="true">
            <span class="name">Block {b.index + 1}</span>
            <span class="caption">
              {#if b.miscorrected}
                wrong codeword
              {:else if !b.ok && erasureView}
                over budget
              {:else if !b.ok}
                decoder gave up
              {:else if erasureView}
                2 × {b.corrected} errors + {b.erasures} erasures
              {:else if b.corrected === 0}
                no errors
              {:else}
                {b.corrected} corrected
              {/if}
            </span>
          </span>
          <span class="bar" aria-hidden="true">
            <span class="track">
              <span class="fill" style:width="{fill * 100}%"></span>
              {#each Array.from({ length: Math.max(0, Math.ceil(limit / step) - 1) }) as _, k (k)}
                <span class="tick" style:left="{((k + 1) * step * 100) / limit}%"></span>
              {/each}
            </span>
            <span class="spill" style:width="calc({(spill / OVER) * 20}% - 2px)"></span>
            <span class="limit"></span>
          </span>
        </span>
        <span class="visually-hidden">
          {#if b.ok && !b.miscorrected}
            Block {b.index + 1}: {b.corrected} errors corrected{b.erasures
              ? ` and ${b.erasures} erasures`
              : ''}; it can fix up to {b.capacity} errors.
          {:else if b.miscorrected}
            Block {b.index + 1}: corrected to the wrong codeword.
          {:else}
            Block {b.index + 1}: {errorsShown(b)} wrong codewords, more than it can fix ({b.capacity}).
          {/if}
        </span>
      </li>
    {/each}
  </ol>
{:else}
  <div class="many">
    {#if worst}
      <p class="summary">
        <span class="figures num"
          ><span class="big">{errorsShown(worst)}</span><span class="of">/{worst.capacity}</span
          ></span
        >
        <span class="summary-text"
          >errors in the most damaged block (block {worst.index + 1} of {blocks.length}). Hover a
          bar to find its block on the code.</span
        >
      </p>
    {/if}
    <ul class="minis" aria-label="Error budget per block">
      {#each blocks as b (b.index)}
        {@const u = used(b)}
        {@const h = Math.min(u / b.ecCount, 1 + OVER) / (1 + OVER)}
        <li class="mini-item">
          <button
            type="button"
            class="mini"
            class:over={u > b.ecCount || b.miscorrected}
            style:--h={h}
            onpointerenter={() => setFocus(b.index)}
            onpointerleave={() => setFocus(null)}
            onfocus={() => setFocus(b.index)}
            onblur={() => setFocus(null)}
            aria-label="Block {b.index + 1}: {errorsShown(b)} of {b.capacity} errors{b.ok &&
            !b.miscorrected
              ? ''
              : ', unreadable'}"
            data-testid="block-meter"
            data-block={b.index + 1}
            data-errors={errorsShown(b)}
            data-ok={b.ok && !b.miscorrected}
          >
            <span class="mini-fill"></span>
          </button>
        </li>
      {/each}
      <li class="mini-limit" aria-hidden="true"></li>
    </ul>
    <p class="mini-axis label" aria-hidden="true">
      <span>block 1</span><span>{blocks.length}</span>
    </p>
  </div>
{/if}

<style>
  .meters {
    display: grid;
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .meter {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    column-gap: 16px;
    align-items: end;
  }

  .figures {
    display: inline-flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 2px;
    white-space: nowrap;
  }

  .big {
    font-size: 40px;
    font-weight: 500;
    line-height: 0.9;
    letter-spacing: -0.04em;
  }

  .of {
    font-size: 16px;
    color: var(--ink-3);
  }

  .over .big {
    color: var(--vermilion-ink);
  }

  .body {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0 12px;
    padding-right: 20%;
  }

  .name {
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.04em;
    color: var(--ink);
  }

  .caption {
    margin-left: auto;
    font-size: 12px;
    color: var(--ink-3);
    text-align: right;
  }

  .over .caption {
    color: var(--vermilion-ink);
  }

  .bar {
    position: relative;
    display: flex;
    align-items: center;
    height: 16px;
    padding-right: 20%;
  }

  .track {
    position: relative;
    flex: 1;
    height: 16px;
    border: 1px solid var(--ink);
    background: var(--card);
    overflow: hidden;
  }

  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--cobalt);
    transition: width 260ms var(--ease);
  }

  .over .fill {
    background: var(--vermilion);
  }

  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgb(17 17 17 / 0.16);
  }

  .spill {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: calc(80% + 2px);
    background: repeating-linear-gradient(-45deg, var(--vermilion) 0 3px, transparent 3px 6px);
    transition: width 260ms var(--ease);
  }

  .limit {
    position: absolute;
    top: -4px;
    bottom: -4px;
    left: 80%;
    width: 2px;
    background: var(--ink);
  }

  /* Many blocks */
  .many {
    display: grid;
    gap: 10px;
  }

  .summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: end;
    gap: 16px;
  }

  .summary-text {
    font-size: 13px;
    line-height: 1.45;
    color: var(--ink-2);
  }

  .minis {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 64px;
    margin: 0;
    padding: 0;
    border-bottom: 1px solid var(--ink);
    list-style: none;
  }

  .mini-item {
    flex: 1 1 0;
    min-width: 0;
    height: 100%;
  }

  .mini {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: var(--rule-soft);
  }

  .mini-fill {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: calc(var(--h) * 100%);
    background: var(--cobalt);
    transition: height 260ms var(--ease);
  }

  .mini.over .mini-fill {
    background: var(--vermilion);
  }

  .mini:hover,
  .mini:focus-visible {
    background: #d9d9d1;
  }

  .mini-limit {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% / 1.5);
    height: 0;
    border-top: 2px solid var(--ink);
    pointer-events: none;
  }

  .mini-axis {
    display: flex;
    justify-content: space-between;
  }
</style>
