<script lang="ts">
  import Icon from '../Icon.svelte';
  import StepBits from './StepBits.svelte';
  import StepCodewords from './StepCodewords.svelte';
  import StepFormat from './StepFormat.svelte';
  import StepInterleave from './StepInterleave.svelte';
  import StepMask from './StepMask.svelte';
  import StepPlacement from './StepPlacement.svelte';
  import StepRecovery from './StepRecovery.svelte';
  import StepRs from './StepRs.svelte';
  import { app } from '../../lib/state.svelte';

  const STEPS = [
    { id: 'bits', title: 'Text → bits' },
    { id: 'codewords', title: 'Codewords & padding' },
    { id: 'rs', title: 'Reed–Solomon' },
    { id: 'interleave', title: 'Interleaving' },
    { id: 'placement', title: 'Zig-zag placement' },
    { id: 'mask', title: 'Masking & penalties' },
    { id: 'format', title: 'Format information' },
    { id: 'recovery', title: 'Damage & recovery' },
  ] as const;

  let current = $state(0);
  let section: HTMLElement | undefined = $state();
  let stepper: HTMLDivElement | undefined = $state();
  let visible = $state(false);
  const tabs: HTMLButtonElement[] = [];

  $effect(() => {
    if (!section || !('IntersectionObserver' in window)) {
      visible = true;
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) visible = e.isIntersecting;
    });
    io.observe(section);
    return () => io.disconnect();
  });

  function go(i: number, focus = false) {
    current = Math.max(0, Math.min(STEPS.length - 1, i));
    if (focus) tabs[current]?.focus({ preventScroll: true });
    // On narrow screens the stepper scrolls sideways: keep the active step in view without
    // moving the page vertically.
    const tab = tabs[current];
    if (stepper && tab && stepper.scrollWidth > stepper.clientWidth) {
      const left = tab.offsetLeft - stepper.offsetLeft;
      const target = Math.max(0, left - (stepper.clientWidth - tab.offsetWidth) / 2);
      stepper.scrollTo({
        left: target,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }
  }

  function onTabKey(e: KeyboardEvent) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    if (e.key in keys) {
      go(current + keys[e.key], true);
      e.preventDefault();
    } else if (e.key === 'Home') {
      go(0, true);
      e.preventDefault();
    } else if (e.key === 'End') {
      go(STEPS.length - 1, true);
      e.preventDefault();
    }
  }

  const sym = $derived(app.symbol);
  const step = $derived(STEPS[current]);
  const n = (i: number) => String(i + 1).padStart(2, '0');
  const quoted = $derived(
    sym ? (sym.text.length > 42 ? `${sym.text.slice(0, 40)}…` : sym.text) : '',
  );
</script>

<section id="story" class="story" bind:this={section} aria-labelledby="story-title">
  <div class="head">
    <p class="label">Story mode</p>
    <h2 id="story-title">From text to modules, and back again</h2>
    {#if sym}
      <p class="lede">
        Eight steps follow your message <q class="mono">{quoted}</q> through the encoder, then through
        the damage you did to it above. Change the message or the damage and every step updates.
      </p>
    {/if}
  </div>

  <div class="stepper" role="tablist" aria-label="Story steps" bind:this={stepper}>
    {#each STEPS as s, i (s.id)}
      <button
        type="button"
        role="tab"
        id="story-tab-{s.id}"
        bind:this={tabs[i]}
        aria-selected={current === i}
        aria-controls="story-panel"
        tabindex={current === i ? 0 : -1}
        class="tab"
        class:past={i < current}
        onclick={() => go(i)}
        onkeydown={onTabKey}
        data-testid="story-tab"
      >
        <span class="n num">{n(i)}</span>
        <span class="t">{s.title}</span>
      </button>
    {/each}
  </div>

  <div
    class="panel"
    role="tabpanel"
    id="story-panel"
    aria-labelledby="story-tab-{step.id}"
    tabindex="-1"
    data-testid="story-panel"
    data-step={step.id}
  >
    {#if sym}
      <div class="panel-grid">
        <div class="big-n num" aria-hidden="true">{n(current)}</div>
        <h3 class="step-title">{step.title}</h3>
        {#key `${step.id}`}
          {#if step.id === 'bits'}
            <StepBits symbol={sym} />
          {:else if step.id === 'codewords'}
            <StepCodewords symbol={sym} />
          {:else if step.id === 'rs'}
            <StepRs symbol={sym} {visible} />
          {:else if step.id === 'interleave'}
            <StepInterleave symbol={sym} {visible} />
          {:else if step.id === 'placement'}
            <StepPlacement symbol={sym} {visible} />
          {:else if step.id === 'mask'}
            <StepMask symbol={sym} />
          {:else if step.id === 'format'}
            <StepFormat symbol={sym} />
          {:else}
            <StepRecovery symbol={sym} />
          {/if}
        {/key}
      </div>
    {:else}
      <p class="empty">Type a message in the panel above to follow it through the encoder.</p>
    {/if}

    <div class="nav">
      <button
        type="button"
        class="btn"
        onclick={() => go(current - 1)}
        disabled={current === 0}
        data-testid="story-prev"
      >
        <Icon name="arrow-left" size={16} /> Previous
      </button>
      <span class="label">Step {current + 1} of {STEPS.length}</span>
      <button
        type="button"
        class="btn primary"
        onclick={() => go(current + 1)}
        disabled={current === STEPS.length - 1}
        data-testid="story-next"
      >
        Next <Icon name="arrow-right" size={16} />
      </button>
    </div>
  </div>
</section>

<style>
  .story {
    max-width: 1520px;
    margin: 0 auto;
    padding: 72px 0 24px;
    border-top: 1px solid var(--ink);
  }

  .head {
    display: grid;
    gap: 10px;
    max-width: 52em;
  }

  h2 {
    font-size: clamp(32px, 4vw, 56px);
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.045em;
  }

  .lede {
    font-size: 17px;
    line-height: 1.5;
    color: var(--ink-2);
  }

  .lede q {
    font-size: 15px;
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .stepper {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    margin-top: 36px;
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--rule);
  }

  .tab {
    position: relative;
    display: grid;
    align-content: start;
    gap: 6px;
    min-height: 96px;
    padding: 14px 12px 14px 0;
    border: 0;
    background: none;
    text-align: left;
    color: var(--ink-3);
  }

  .tab::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 0;
    right: 12px;
    height: 4px;
    background: transparent;
    transition: background 160ms var(--ease);
  }

  .tab.past::before {
    background: var(--rule);
  }

  .tab[aria-selected='true'] {
    color: var(--ink);
  }

  .tab[aria-selected='true']::before {
    background: var(--ink);
  }

  .tab:hover {
    color: var(--ink);
  }

  .n {
    font-size: clamp(28px, 2.6vw, 40px);
    font-weight: 500;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .t {
    font-size: 13px;
    line-height: 1.25;
  }

  .tab:focus-visible {
    outline-offset: -2px;
  }

  .panel {
    padding-top: 40px;
    outline: none;
  }

  .panel-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-template-rows: auto auto 1fr;
    column-gap: var(--gutter);
    row-gap: 12px;
    align-items: start;
  }

  .big-n {
    grid-column: 1 / span 4;
    font-size: clamp(88px, 10vw, 152px);
    font-weight: 300;
    line-height: 0.8;
    letter-spacing: -0.06em;
    color: var(--ink);
  }

  .step-title {
    grid-column: 1 / span 4;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.025em;
  }

  .panel-grid :global(.step-text) {
    grid-column: 1 / span 4;
    display: grid;
    gap: 12px;
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink-2);
  }

  .panel-grid :global(.step-text strong) {
    color: var(--ink);
  }

  .panel-grid :global(.step-viz) {
    grid-column: 5 / -1;
    grid-row: 1 / span 3;
    min-width: 0;
  }

  .empty {
    color: var(--ink-2);
  }

  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid var(--rule);
  }

  .nav .btn {
    min-height: 44px;
  }

  @media (max-width: 1099px) {
    .stepper {
      display: flex;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scrollbar-width: thin;
    }

    .tab {
      flex: 0 0 132px;
      scroll-snap-align: start;
    }

    .big-n,
    .step-title,
    .panel-grid :global(.step-text),
    .panel-grid :global(.step-viz) {
      grid-column: 1 / -1;
      grid-row: auto;
    }

    .big-n {
      font-size: 72px;
    }

    .panel-grid :global(.step-viz) {
      margin-top: 16px;
    }
  }
</style>
