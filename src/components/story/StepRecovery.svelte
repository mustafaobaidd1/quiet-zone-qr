<script lang="ts">
  import type { QrSymbol } from '../../lib/qr/encoder';
  import { alphaPow, LOG } from '../../lib/qr/gf256';
  import { app } from '../../lib/state.svelte';
  import { hex } from '../../lib/format';

  let { symbol }: { symbol: QrSymbol } = $props();

  const an = $derived(app.analysis);

  /** Default block: the one the status talks about, else the busiest one. */
  const defaultBlock = $derived.by(() => {
    if (!an) return 0;
    if (an.focusBlock >= 0) return an.focusBlock;
    let best = 0;
    an.blocks.forEach((b, i) => {
      if (b.corrected + b.erasures > an.blocks[best].corrected + an.blocks[best].erasures) best = i;
    });
    return best;
  });
  let picked = $state<number | null>(null);
  const blockIndex = $derived(
    Math.min(picked ?? defaultBlock, (an?.report.blocks.length ?? 1) - 1),
  );
  const report = $derived(an?.report.blocks[blockIndex] ?? null);
  const rs = $derived(report?.rs ?? null);
  const original = $derived.by(() => {
    const b = symbol.blocks[blockIndex];
    return b ? [...b.data, ...b.ec] : [];
  });
  const n = $derived(report?.received.length ?? 0);
  const erasureSet = $derived(new Set(report?.erasures ?? []));
  const errorSet = $derived(new Set(rs?.positions ?? []));
  const syndromeZero = $derived(rs ? rs.syndromes.every((s) => s === 0) : true);
  const formatOk = $derived(an?.report.format?.info ?? null);

  /** Polynomial (low-first coefficients) as "1 + α^a x + α^b x² …" pieces. */
  function terms(p: number[]): { coef: string; exp: number | null; power: number }[] {
    const out: { coef: string; exp: number | null; power: number }[] = [];
    p.forEach((c, i) => {
      if (c === 0) return;
      out.push({ coef: c === 1 ? '' : 'α', exp: c === 1 ? null : LOG[c], power: i });
    });
    return out;
  }

  function scratchForMe() {
    app.commit({
      kind: 'scratch',
      points: [0.18, 0.62, 0.32, 0.55, 0.47, 0.6, 0.62, 0.52, 0.78, 0.58],
      radius: 0.5 / symbol.size,
    });
  }
</script>

<div class="step-text">
  <p>
    The decoder works backwards. It reads the <strong>format information</strong> (fixing up to 3 bits
    per copy), removes the mask, walks the zig-zag path and de-interleaves the codewords into blocks.
  </p>
  <p>
    For each block it computes <strong>syndromes</strong> S<sub>j</sub> = r(α<sup>j</sup>). All zero
    means the block is a valid codeword. Otherwise <strong>Berlekamp–Massey</strong> finds the
    shortest error locator Λ(x), a <strong>Chien search</strong> tries every position for a root,
    and <strong>Forney’s formula</strong> gives the value to XOR at each one.
  </p>
  <p>
    Codewords under a sticker can be treated as <strong>erasures</strong> (known positions), which
    halves their cost: a block survives while 2 × errors + erasures ≤ {symbol.layout
      .ecCodewordsPerBlock}.
  </p>
</div>

<div class="step-viz">
  {#if !an || !report || !rs}
    <p>Nothing to decode yet.</p>
  {:else}
    {#if an.verdict === 'pristine'}
      <div class="callout">
        <p>
          The code is undamaged, so every syndrome is zero. Damage it to watch the decoder work.
        </p>
        <button
          type="button"
          class="btn primary"
          onclick={scratchForMe}
          data-testid="scratch-for-me">Scratch it for me</button
        >
      </div>
    {/if}

    <div class="stage-row">
      <span class="stage-n mono">1</span>
      <div class="stage-body">
        <p class="stage-title">Format information</p>
        {#if formatOk && an.report.format}
          <p class="stage-note">
            Copy {an.report.format.used + 1} decoded as level {formatOk.level}, mask {formatOk.mask}
            ({an.report.format.copies[an.report.format.used].distance} bit{an.report.format.copies[
              an.report.format.used
            ].distance === 1
              ? ''
              : 's'} repaired; the other copy is {an.report.format.copies[1 - an.report.format.used]
              .distance} bit{an.report.format.copies[1 - an.report.format.used].distance === 1
              ? ''
              : 's'} from a valid code).
          </p>
        {:else}
          <p class="stage-note fail">{an.report.failure?.reason}</p>
        {/if}
      </div>
    </div>

    {#if an.report.blocks.length > 1}
      <div class="blocks" role="group" aria-label="Block to inspect">
        {#if an.report.blocks.length <= 10}
          {#each an.report.blocks as b (b.index)}
            <button
              type="button"
              aria-pressed={blockIndex === b.index}
              class:bad={!b.rs.ok}
              onclick={() => (picked = b.index)}
            >
              Block {b.index + 1}
            </button>
          {/each}
        {:else}
          <label class="label" for="rec-block">Block</label>
          <select
            id="rec-block"
            value={blockIndex}
            onchange={(e) => (picked = Number((e.currentTarget as HTMLSelectElement).value))}
          >
            {#each an.report.blocks as b (b.index)}
              <option value={b.index}>Block {b.index + 1}{b.rs.ok ? '' : ' (failed)'}</option>
            {/each}
          </select>
        {/if}
      </div>
    {/if}

    <div class="stage-row">
      <span class="stage-n mono">2</span>
      <div class="stage-body">
        <p class="stage-title">
          Received block {blockIndex + 1}
          <span class="dim">— {report.dataCount} data + {report.ecCount} EC codewords</span>
        </p>
        <div class="cells mono" aria-label="Received codewords">
          {#each Array.from(report.received) as v, i (i)}
            <span
              class="cell"
              class:wrong={v !== original[i]}
              class:erased={erasureSet.has(i)}
              class:ec={i >= report.dataCount}
              title="#{i}: received {hex(v)}, sent {hex(original[i])}">{hex(v)}</span
            >
          {/each}
        </div>
        <p class="key">
          <span class="k wrong"></span>differs from what was sent
          <span class="k erased"></span>erasure <span class="k ec"></span>EC codeword
        </p>
      </div>
    </div>

    <div class="stage-row">
      <span class="stage-n mono">3</span>
      <div class="stage-body">
        <p class="stage-title">Syndromes S<sub>0</sub>…S<sub>{report.ecCount - 1}</sub></p>
        <div class="cells mono" aria-label="Syndromes">
          {#each rs.syndromes as s, j (j)}
            <span class="cell syn" class:zero={s === 0}>{hex(s)}</span>
          {/each}
        </div>
        <p class="stage-note">
          {syndromeZero
            ? 'All zero: the block is a valid codeword, nothing to fix.'
            : 'Not all zero: the block contains errors.'}
        </p>
      </div>
    </div>

    {#if !syndromeZero}
      <div class="stage-row">
        <span class="stage-n mono">4</span>
        <div class="stage-body">
          <p class="stage-title">
            Berlekamp–Massey{report.erasures.length
              ? ' on the erasure-adjusted (Forney) syndromes'
              : ''}
          </p>
          <div class="bm-wrap">
            <table class="bm mono">
              <thead
                ><tr
                  ><th scope="col">r</th><th scope="col">Δ</th><th scope="col">L</th><th scope="col"
                    >σ(x)</th
                  ></tr
                ></thead
              >
              <tbody>
                {#each rs.bmSteps as st (st.r)}
                  <tr class:jump={st.discrepancy !== 0}>
                    <td>{st.r}</td>
                    <td>{hex(st.discrepancy)}</td>
                    <td>{st.length}</td>
                    <td class="poly">
                      {#each terms(st.locator) as t, k (k)}{k > 0
                          ? ' + '
                          : ''}{#if t.exp !== null}α<sup>{t.exp}</sup
                          >{:else if t.power === 0}1{/if}{#if t.power > 0}x{#if t.power > 1}<sup
                              >{t.power}</sup
                            >{/if}{/if}{/each}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="stage-note">
            Final locator degree L = {rs.errorLocator.length - 1}{report.erasures.length
              ? `, plus ${report.erasures.length} erasure${report.erasures.length === 1 ? '' : 's'}`
              : ''}; the block can afford 2L + erasures ≤ {report.ecCount}.
          </p>
        </div>
      </div>

      <div class="stage-row">
        <span class="stage-n mono">5</span>
        <div class="stage-body">
          <p class="stage-title">Chien search and Forney</p>
          {#if rs.positions.length}
            <table class="roots mono">
              <thead
                ><tr
                  ><th scope="col">position</th><th scope="col">locator X</th><th scope="col"
                    >magnitude</th
                  ><th scope="col">received → fixed</th></tr
                ></thead
              >
              <tbody>
                {#each rs.positions as pos, k (pos)}
                  <tr>
                    <td>{pos}{erasureSet.has(pos) ? ' (erased)' : ''}</td>
                    <td>α<sup>{n - 1 - pos}</sup> = {hex(alphaPow(n - 1 - pos))}</td>
                    <td>{rs.magnitudes[k] !== undefined ? hex(rs.magnitudes[k]) : '—'}</td>
                    <td>{hex(report.received[pos])} → {rs.ok ? hex(rs.corrected[pos]) : '?'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
          {#if rs.ok}
            <p class="stage-note">
              {rs.errorsFound} error{rs.errorsFound === 1 ? '' : 's'}{report.erasures.length
                ? ` and ${report.erasures.length} erasure${report.erasures.length === 1 ? '' : 's'}`
                : ''} located and corrected; the corrected block’s syndromes are all zero.
            </p>
          {:else}
            <p class="stage-note fail">Stopped: {rs.reason}.</p>
          {/if}
        </div>
      </div>

      <div class="stage-row">
        <span class="stage-n mono">6</span>
        <div class="stage-body">
          <p class="stage-title">Corrected block {blockIndex + 1}</p>
          {#if rs.ok}
            <div class="cells mono" aria-label="Corrected codewords">
              {#each Array.from(rs.corrected) as v, i (i)}
                <span
                  class="cell"
                  class:fixed={errorSet.has(i) && v !== report.received[i]}
                  class:wrongfix={v !== original[i]}>{hex(v)}</span
                >
              {/each}
            </div>
            {#if an.blocks[blockIndex]?.miscorrected}
              <p class="stage-note fail">
                This is a valid codeword, but not the one that was sent: a miscorrection.
              </p>
            {:else}
              <p class="stage-note">Identical to the codewords that were sent.</p>
            {/if}
          {:else}
            <p class="stage-note fail">
              Not recoverable: more than t = {report.capacity} codewords are wrong, no codeword lies within
              reach of what was received, and one failed block is enough to make the whole symbol unreadable.
            </p>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .callout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
    padding: 14px 16px;
    border: 1px solid var(--ink);
    background: var(--card);
  }

  .blocks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 4px 0 16px 40px;
  }

  .blocks button {
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid var(--ink);
    border-radius: var(--radius);
    background: var(--card);
    font-size: 13px;
  }

  .blocks button.bad {
    border-color: var(--vermilion);
    color: var(--vermilion-ink);
  }

  .blocks button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--card);
  }

  .blocks button.bad[aria-pressed='true'] {
    background: var(--vermilion);
    border-color: var(--vermilion);
    color: #fff;
  }

  .blocks select {
    min-height: 40px;
    padding: 0 10px;
    border: 1px solid var(--ink);
    background: var(--card);
  }

  .stage-row {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 12px;
    padding: 14px 0;
    border-top: 1px solid var(--rule);
  }

  .stage-n {
    font-size: 13px;
    color: var(--ink-3);
    padding-top: 2px;
  }

  .stage-title {
    margin-bottom: 8px;
    font-weight: 600;
  }

  .dim {
    font-weight: 400;
    color: var(--ink-3);
  }

  .stage-note {
    margin-top: 8px;
    font-size: 13px;
    color: var(--ink-2);
  }

  .stage-note.fail {
    color: var(--vermilion-ink);
  }

  .cells {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    font-size: 12px;
  }

  .cell {
    min-width: 28px;
    padding: 3px 3px;
    border: 1px solid var(--rule);
    background: var(--card);
    text-align: center;
  }

  .cell.ec {
    border-style: dashed;
  }

  .cell.wrong {
    border-color: var(--vermilion);
    background: var(--vermilion);
    color: #fff;
  }

  .cell.erased {
    background:
      repeating-linear-gradient(-45deg, rgb(255 59 31 / 0.25) 0 2px, transparent 2px 5px),
      var(--card);
    color: var(--ink);
    border-color: var(--vermilion);
  }

  .cell.wrong.erased {
    background:
      repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.35) 0 2px, transparent 2px 5px),
      var(--vermilion);
    color: #fff;
  }

  .cell.syn.zero {
    color: #a4a49b;
  }

  .cell.fixed {
    border-color: var(--cobalt);
    background: var(--cobalt);
    color: #fff;
  }

  .cell.wrongfix {
    border-color: var(--vermilion);
    box-shadow: inset 0 0 0 1px var(--vermilion);
  }

  .key {
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
    width: 12px;
    height: 12px;
    margin-left: 8px;
    border: 1px solid var(--rule);
  }

  .k.wrong {
    background: var(--vermilion);
    border-color: var(--vermilion);
  }

  .k.erased {
    border-color: var(--vermilion);
    background: repeating-linear-gradient(-45deg, rgb(255 59 31 / 0.35) 0 2px, transparent 2px 5px);
  }

  .k.ec {
    border-style: dashed;
    border-color: var(--ink-3);
  }

  .bm-wrap {
    max-height: 300px;
    overflow: auto;
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--ink);
  }

  .bm,
  .roots {
    border-collapse: collapse;
    font-size: 12px;
  }

  .bm th,
  .bm td,
  .roots th,
  .roots td {
    padding: 4px 10px 4px 0;
    text-align: left;
    white-space: nowrap;
  }

  .bm thead th,
  .roots thead th {
    position: sticky;
    top: 0;
    background: var(--paper);
    font-weight: 400;
    font-size: 11px;
    color: var(--ink-3);
    border-bottom: 1px solid var(--rule);
  }

  .bm tr.jump td {
    color: var(--ink);
  }

  .bm tr:not(.jump) td {
    color: #8f8f87;
  }

  .poly {
    white-space: normal !important;
    min-width: 220px;
  }

  .roots {
    margin-top: 4px;
  }

  .roots td {
    border-bottom: 1px solid var(--rule-soft);
  }

  sup {
    font-size: 0.75em;
    line-height: 0;
  }

  sub {
    font-size: 0.75em;
    line-height: 0;
  }
</style>
