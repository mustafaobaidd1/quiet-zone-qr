<script lang="ts">
  import type { QrSymbol } from '../../lib/qr/encoder';
  import { applyMask, maskBit, MASK_FORMULAS, writeFormat } from '../../lib/qr/matrix';
  import { cellPath, darkPath } from '../../lib/qr/render';
  import { app } from '../../lib/state.svelte';

  let { symbol }: { symbol: QrSymbol } = $props();

  const size = $derived(symbol.size);
  const best = $derived(symbol.penalties.reduce((b, p) => (p.total < b.total ? p : b)).mask);
  let selected = $state<number | null>(null);
  const focus = $derived(selected ?? symbol.mask);

  const thumbs = $derived(
    symbol.penalties.map((p) => {
      const m = Uint8Array.from(symbol.unmasked);
      applyMask(m, symbol.geometry, p.mask);
      writeFormat(m, size, symbol.level, p.mask);
      return { mask: p.mask, d: darkPath(m, size) };
    }),
  );

  /** Modules the focused mask inverts (data and EC area only). */
  const patternPath = $derived(
    cellPath(
      size,
      (i) => !symbol.geometry.isFunction[i] && maskBit(focus, Math.floor(i / size), i % size),
    ),
  );
  const fnArea = $derived(cellPath(size, (i) => symbol.geometry.isFunction[i] === 1));

  const rules = [
    { key: 'n1', name: 'N1', what: 'runs of 5+ same-colour modules: 3 + (length − 5)' },
    { key: 'n2', name: 'N2', what: '2×2 blocks of one colour: 3 each' },
    { key: 'n3', name: 'N3', what: 'finder-like 1:1:3:1:1 runs with 4 light modules: 40 each' },
    { key: 'n4', name: 'N4', what: '10 per 5% the dark share strays from 50%' },
  ] as const;
</script>

<div class="step-text">
  <p>
    Raw data can form large blank areas or shapes that look like finder patterns. So the data and EC
    modules are XORed with one of <strong>eight mask patterns</strong>; the function patterns are
    left alone.
  </p>
  <p>
    The encoder tries all eight, adds the format information for each, and scores the result with
    four penalty rules. The lowest total wins — here <strong>mask {best}</strong
    >{symbol.maskChoice === 'fixed'
      ? `, although you fixed mask ${symbol.mask} in the message panel`
      : ''}.
  </p>
  <p class="formula mono">mask {focus}: invert where {MASK_FORMULAS[focus]}</p>
</div>

<div class="step-viz">
  <div class="thumbs">
    {#each thumbs as t (t.mask)}
      {@const p = symbol.penalties[t.mask]}
      <button
        type="button"
        class="thumb"
        class:best={t.mask === best}
        class:used={t.mask === symbol.mask}
        aria-pressed={focus === t.mask}
        onclick={() => (selected = t.mask)}
        aria-label="Mask {t.mask}, penalty {p.total}{t.mask === best ? ', lowest' : ''}"
      >
        <svg viewBox="-1 -1 {size + 2} {size + 2}" aria-hidden="true">
          <rect x="-1" y="-1" width={size + 2} height={size + 2} fill="#fff" />
          <path d={t.d} fill="#111" />
        </svg>
        <span class="t-row">
          <span class="t-n mono">{t.mask}</span>
          <span class="t-total num">{p.total}</span>
        </span>
      </button>
    {/each}
  </div>

  <div class="detail">
    <div class="pattern">
      <p class="label">Mask {focus} pattern</p>
      <svg
        viewBox="-1 -1 {size + 2} {size + 2}"
        role="img"
        aria-label="Modules inverted by mask {focus}"
      >
        <rect x="0" y="0" width={size} height={size} fill="#fff" />
        <path d={fnArea} fill="#ecece6" />
        <path d={patternPath} fill="var(--ink)" />
      </svg>
    </div>
    <!-- Scrollable region: focusable so keyboard users can scroll it (WCAG 2.1.1). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="table-wrap" role="region" aria-label="Mask penalty table" tabindex="0">
      <table class="pen num">
        <thead>
          <tr>
            <th scope="col">rule</th>
            {#each symbol.penalties as p (p.mask)}
              <th scope="col" class:col-best={p.mask === best} class:col-focus={p.mask === focus}
                >{p.mask}</th
              >
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rules as r (r.key)}
            <tr>
              <th scope="row" title={r.what}><span class="mono">{r.name}</span></th>
              {#each symbol.penalties as p (p.mask)}
                <td class:col-best={p.mask === best} class:col-focus={p.mask === focus}
                  >{p[r.key]}</td
                >
              {/each}
            </tr>
          {/each}
          <tr class="total">
            <th scope="row">total</th>
            {#each symbol.penalties as p (p.mask)}
              <td class:col-best={p.mask === best} class:col-focus={p.mask === focus}>{p.total}</td>
            {/each}
          </tr>
        </tbody>
      </table>
      <ul class="rules">
        {#each rules as r (r.key)}
          <li><span class="mono">{r.name}</span> {r.what}</li>
        {/each}
      </ul>
      {#if focus !== symbol.mask}
        <button type="button" class="btn use" onclick={() => (app.mask = focus)}
          >Use mask {focus} for the code above</button
        >
      {:else if symbol.maskChoice === 'fixed'}
        <button type="button" class="btn use" onclick={() => (app.mask = 'auto')}
          >Back to automatic mask</button
        >
      {/if}
    </div>
  </div>
</div>

<style>
  .formula {
    padding: 10px 12px;
    border-left: 3px solid var(--ink);
    background: var(--card);
    font-size: 13px;
    color: var(--ink);
  }

  .thumbs {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 8px;
  }

  .thumb {
    display: grid;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--rule);
    background: var(--card);
  }

  .thumb:hover {
    border-color: var(--ink-3);
  }

  .thumb[aria-pressed='true'] {
    border-color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--ink);
  }

  .thumb svg {
    width: 100%;
    height: auto;
    shape-rendering: crispEdges;
  }

  .t-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0 2px;
  }

  .t-n {
    font-size: 11px;
    color: var(--ink-3);
  }

  .t-total {
    font-size: 14px;
    font-weight: 500;
  }

  .thumb.best .t-total {
    color: var(--cobalt);
  }

  .thumb.best .t-n::after {
    content: ' ★';
    color: var(--cobalt);
  }

  .detail {
    display: grid;
    grid-template-columns: minmax(0, 220px) minmax(0, 1fr);
    gap: 24px;
    margin-top: 24px;
    align-items: start;
  }

  .pattern svg {
    width: 100%;
    height: auto;
    margin-top: 6px;
    shape-rendering: crispEdges;
  }

  .table-wrap {
    overflow-x: auto;
  }

  .pen {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .pen th,
  .pen td {
    padding: 6px 6px;
    text-align: right;
    border-bottom: 1px solid var(--rule-soft);
  }

  .pen thead th {
    border-bottom: 1px solid var(--ink);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    color: var(--ink-3);
  }

  .pen tbody th {
    text-align: left;
    font-weight: 400;
    color: var(--ink-2);
  }

  .pen .total td,
  .pen .total th {
    border-top: 1px solid var(--ink);
    border-bottom: 0;
    font-weight: 600;
    color: var(--ink);
  }

  .pen .col-focus {
    background: var(--rule-soft);
  }

  .pen td.col-best {
    color: var(--cobalt);
  }

  .rules {
    display: grid;
    gap: 4px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: var(--ink-3);
  }

  .rules .mono {
    color: var(--ink);
    margin-right: 4px;
  }

  .use {
    margin-top: 14px;
    min-height: 44px;
  }

  @media (max-width: 700px) {
    .thumbs {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .detail {
      grid-template-columns: 1fr;
    }

    .pattern {
      max-width: 240px;
    }
  }
</style>
