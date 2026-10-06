<script lang="ts">
  import BlockMeters from './BlockMeters.svelte';
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte';

  const an = $derived(app.analysis);
  const sym = $derived(app.symbol);

  /** The live region text updates when a stroke ends, not on every pointer move. */
  let announced = $state('');
  $effect(() => {
    const a = an;
    const drawing = app.live !== null;
    if (!a || drawing) return;
    announced = `${a.headline}. ${a.detail}`;
  });

  let expanded = $state(false);
  const decoded = $derived(an?.report.text ?? null);
  const longText = $derived((decoded ?? '').length > 160);
</script>

<section class="readout" aria-labelledby="status-label">
  <h2 class="label" id="status-label"><span class="idx">01</span> Decoder</h2>

  {#if an && sym}
    <div class="status" data-verdict={an.verdict} data-testid="status">
      <p class="headline">
        <span class="mark" aria-hidden="true"></span>
        <span data-testid="status-headline">{an.headline}</span>
      </p>
      <p class="detail" data-testid="status-detail">{an.detail}</p>
      {#if an.verdict === 'unreadable' && an.focusBlock >= 0}
        <p class="pointer-note">Block {an.focusBlock + 1} is tinted vermilion on the code.</p>
      {/if}
      {#if an.report.warnings.length}
        <p class="pointer-note">{an.report.warnings.join(' ')}</p>
      {/if}
    </div>
    <p class="visually-hidden" aria-live="polite" aria-atomic="true">{announced}</p>

    {#if an.blocks.length}
      <div class="meters-head">
        <h3 class="label">Error budget per block</h3>
        <span class="label legend-key">
          <span class="key fill" aria-hidden="true"></span>corrected
          <span class="key over" aria-hidden="true"></span>over the limit
        </span>
      </div>
      <BlockMeters blocks={an.blocks} />
      <p class="budget-note">
        {sym.layout.numBlocks === 1 ? 'One block' : `${sym.layout.numBlocks} blocks`} of
        {sym.layout.group2.blocks
          ? `${sym.layout.group1.dataCodewords}–${sym.layout.group2.dataCodewords}`
          : sym.layout.group1.dataCodewords}
        data + {sym.layout.ecCodewordsPerBlock} EC codewords. Each fixes up to t = ⌊{sym.layout
          .ecCodewordsPerBlock}/2⌋ = {Math.floor(sym.layout.ecCodewordsPerBlock / 2)}
        wrong codewords{app.erasureMode
          ? `, or up to ${sym.layout.ecCodewordsPerBlock} known-bad ones`
          : ''}.
      </p>
    {/if}

    <div class="decoded">
      <h3 class="label">Decoded text</h3>
      {#if decoded !== null}
        <p
          class="payload"
          class:clamped={longText && !expanded}
          class:wrong={an.verdict === 'misread'}
          data-testid="decoded-text"
        >
          {decoded}
        </p>
        <p class="match" class:bad={an.verdict === 'misread'}>
          <Icon name={an.verdict === 'misread' ? 'cross' : 'check'} size={16} />
          {an.verdict === 'misread'
            ? 'Differs from the encoded text'
            : 'Matches the encoded text exactly'}
          {#if longText}
            <button type="button" class="link-btn" onclick={() => (expanded = !expanded)}
              >{expanded ? 'Show less' : 'Show all'}</button
            >
          {/if}
        </p>
      {:else}
        <p class="payload empty" data-testid="decoded-text">Nothing could be read.</p>
      {/if}
    </div>
  {:else}
    <div class="status" data-verdict="none" data-testid="status">
      <p class="headline">
        <span class="mark" aria-hidden="true"></span><span data-testid="status-headline"
          >Nothing to decode</span
        >
      </p>
      <p class="detail" data-testid="status-detail">
        Fix the message above and the decoder starts again.
      </p>
    </div>
  {/if}
</section>

<style>
  .readout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }

  .idx {
    color: var(--ink);
    margin-right: 6px;
  }

  .status {
    display: grid;
    gap: 6px;
  }

  .headline {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: clamp(34px, 3.4vw, 48px);
    font-weight: 600;
    line-height: 1.02;
    letter-spacing: -0.035em;
  }

  .mark {
    flex: none;
    width: 0.42em;
    height: 0.42em;
    background: var(--ink);
    transition: background 200ms var(--ease);
  }

  [data-verdict='readable'] .mark {
    background: var(--cobalt);
  }

  [data-verdict='unreadable'] .headline,
  [data-verdict='misread'] .headline {
    color: var(--vermilion);
  }

  [data-verdict='unreadable'] .mark,
  [data-verdict='misread'] .mark {
    background: var(--vermilion);
    border-radius: 0;
    transform: rotate(45deg) scale(0.85);
  }

  [data-verdict='none'] .mark {
    background: transparent;
    border: 2px solid var(--ink-3);
  }

  .detail {
    font-size: 17px;
    line-height: 1.45;
    max-width: 34em;
  }

  .pointer-note {
    font-size: 13px;
    color: var(--ink-3);
  }

  [data-verdict='unreadable'] .pointer-note {
    color: var(--vermilion-ink);
  }

  .meters-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    padding-top: 14px;
    border-top: 1px solid var(--rule);
  }

  .legend-key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    text-transform: none;
    letter-spacing: 0;
  }

  .key {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-left: 8px;
  }

  .key.fill {
    background: var(--cobalt);
  }

  .key.over {
    background: var(--vermilion);
  }

  .budget-note {
    font-size: 13px;
    line-height: 1.5;
    color: var(--ink-3);
  }

  .decoded {
    display: grid;
    gap: 8px;
    padding-top: 14px;
    border-top: 1px solid var(--rule);
  }

  .payload {
    font-family: var(--font-mono);
    font-size: 15px;
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .payload.clamped {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .payload.wrong {
    color: var(--vermilion-ink);
  }

  .payload.empty {
    font-family: var(--font-sans);
    color: var(--ink-3);
  }

  .match {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--ink-2);
  }

  .match :global(svg) {
    color: var(--cobalt);
  }

  .match.bad,
  .match.bad :global(svg) {
    color: var(--vermilion-ink);
  }

  .link-btn {
    margin-left: auto;
    min-height: 32px;
    padding: 0 4px;
    border: 0;
    background: none;
    text-decoration: underline;
    text-underline-offset: 3px;
    font-size: 13px;
  }
</style>
