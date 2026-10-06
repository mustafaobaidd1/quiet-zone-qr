<script lang="ts">
  import { onMount } from 'svelte';
  import AnatomyPanel from './components/AnatomyPanel.svelte';
  import EncoderPanel from './components/EncoderPanel.svelte';
  import ExportBar from './components/ExportBar.svelte';
  import HowItWorks from './components/HowItWorks.svelte';
  import QrStage from './components/QrStage.svelte';
  import Readout from './components/Readout.svelte';
  import Story from './components/story/Story.svelte';
  import Toast from './components/Toast.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import Icon from './components/Icon.svelte';
  import { app } from './lib/state.svelte';

  let wide = $state(true);
  let stageVisible = $state(true);
  let stageWrap: HTMLDivElement | undefined = $state();
  let coarse = $state(false);

  onMount(() => {
    const mq = window.matchMedia('(min-width: 1100px)');
    const pointer = window.matchMedia('(pointer: coarse)');
    const update = () => {
      wide = mq.matches;
      coarse = pointer.matches;
    };
    update();
    mq.addEventListener('change', update);
    pointer.addEventListener('change', update);

    let observer: IntersectionObserver | undefined;
    if (stageWrap && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) stageVisible = e.isIntersecting;
        },
        { rootMargin: '0px 0px -120px 0px' },
      );
      observer.observe(stageWrap);
    }

    document.documentElement.dataset.ready = 'true';
    return () => {
      mq.removeEventListener('change', update);
      pointer.removeEventListener('change', update);
      observer?.disconnect();
    };
  });

  function onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT')
    )
      return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      app.undo();
      e.preventDefault();
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      app.redo();
      e.preventDefault();
    }
  }

  const showHint = $derived(!app.touched && app.symbol !== null && app.tool === 'scratch');
  const err = $derived(app.result.ok ? null : app.result.error);
</script>

<svelte:window onkeydown={onKeyDown} />

<a class="skip" href="#workbench">Skip to the QR code</a>

<header class="topbar">
  <a class="back" href="https://mustafaobaidd1.github.io/">
    <Icon name="arrow-left" size={16} />
    <span>Mustafa Obaid · Portfolio</span>
  </a>
  <nav aria-label="Sections">
    <a href="#story">Story</a>
    <a href="#how">How it works</a>
    <a href="https://github.com/mustafaobaidd1/quiet-zone-qr" class="source"
      >Source code <Icon name="external" size={14} /></a
    >
  </nav>
</header>

<main id="workbench" class:wide>
  <section class="bench">
    <div class="titles">
      <h1>
        <span class="t1">Quiet Zone</span>
        <span class="t2">inside a QR code</span>
      </h1>
      <p class="dek">
        How does a QR code still scan when part of it is scratched, torn or covered by a logo?
        <span class="dek-more"
          >Damage this one and watch Reed–Solomon error correction put it back: encoder, decoder and
          finite-field arithmetic written from scratch, running live in your browser.</span
        >
      </p>
    </div>

    <div class="stage-col">
      <div class="stage-wrap" bind:this={stageWrap}>
        {#if app.symbol}
          <QrStage />
          <span class="qz-note label" aria-hidden="true">Quiet zone · 4 modules</span>
          {#if showHint}
            <div class="hint" aria-hidden="true">
              <Icon name="scratch" size={18} />
              <span>{coarse ? 'Scratch the code with your finger' : 'Scratch the code'}</span>
            </div>
          {/if}
        {:else}
          <div
            class="placeholder"
            class:error={err && err.kind !== 'empty'}
            data-testid="placeholder"
          >
            <div class="ph-grid" aria-hidden="true"></div>
            <p class="ph-title">
              {#if !err || err.kind === 'empty'}
                Type something to encode
              {:else if err.kind === 'invalid-char'}
                That character does not fit the chosen mode
              {:else if err.kind === 'too-long'}
                Too long for a QR code
              {:else}
                Does not fit the chosen version
              {/if}
            </p>
            <p class="ph-sub">
              {#if !err || err.kind === 'empty'}
                The code appears as soon as there is a message.
              {:else}
                See the message panel for the reason and a one-click fix.
              {/if}
            </p>
            {#if !err || err.kind === 'empty'}
              <button
                type="button"
                class="btn"
                onclick={() => (app.text = 'https://mustafaobaidd1.github.io/quiet-zone-qr/')}
                >Use the page address</button
              >
            {/if}
          </div>
        {/if}
      </div>
      <Toolbar floating={!wide} hidden={!wide && !stageVisible} />
      {#if wide}
        <ExportBar />
      {/if}
    </div>

    <div class="cell readout-cell"><Readout /></div>
    <div class="cell encoder-cell">
      <EncoderPanel />
      {#if !wide}
        <ExportBar />
      {/if}
    </div>
    <div class="cell anatomy-cell"><AnatomyPanel /></div>
  </section>

  <Story />
  <HowItWorks />
</main>

<footer class="footer">
  <div class="foot-grid">
    <p class="foot-title">Quiet Zone</p>
    <p>
      Built by Mustafa Obaid. Encoder, decoder and Reed–Solomon codec written from scratch in
      TypeScript; validated against published worked examples and two independent QR libraries.
    </p>
    <p class="foot-links">
      <a class="link" href="https://mustafaobaidd1.github.io/">← Portfolio</a>
      <a class="link" href="https://github.com/mustafaobaidd1/quiet-zone-qr">Source code</a>
      <span>MIT License · QR Code is a registered trademark of DENSO WAVE INCORPORATED.</span>
    </p>
  </div>
</footer>

<Toast />

<style>
  .skip {
    position: absolute;
    top: -100px;
    left: 16px;
    z-index: 100;
    padding: 10px 14px;
    background: var(--ink);
    color: #fff;
  }

  .skip:focus {
    top: 8px;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 15;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    height: 56px;
    padding: 0 var(--margin);
    border-bottom: 1px solid var(--ink);
    background: rgb(251 251 249 / 0.94);
    backdrop-filter: blur(8px);
    font-size: 14px;
  }

  .topbar a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    text-decoration: none;
  }

  .topbar a:hover span,
  nav a:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  nav {
    display: flex;
    gap: 22px;
  }

  main {
    padding: 0 var(--margin);
  }

  .bench {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    column-gap: var(--gutter);
    max-width: 1520px;
    margin: 0 auto;
    padding: 28px 0 56px;
  }

  .titles,
  .stage-col,
  .cell {
    grid-column: 1 / -1;
    min-width: 0;
  }

  .cell {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
    align-content: start;
    margin-top: 40px;
  }

  .readout-cell {
    margin-top: 28px;
  }

  h1 {
    display: grid;
    gap: 2px;
  }

  .t1 {
    font-size: clamp(44px, 6.4vw, 84px);
    font-weight: 700;
    line-height: 0.92;
    letter-spacing: -0.055em;
  }

  .t2 {
    font-size: clamp(18px, 1.7vw, 24px);
    font-weight: 400;
    letter-spacing: -0.01em;
    color: var(--ink-2);
  }

  .dek {
    max-width: 36em;
    margin-top: 12px;
    font-size: 16px;
    line-height: 1.5;
    color: var(--ink-2);
  }

  .stage-col {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    align-content: start;
    margin-top: 22px;
  }

  .stage-wrap {
    position: relative;
    width: 100%;
  }

  .qz-note {
    position: absolute;
    top: 0;
    left: 0;
    padding: 5px 0 0 3px;
    font-size: 10px;
    color: var(--ink-3);
    pointer-events: none;
    display: none;
  }

  .hint {
    position: absolute;
    top: 50%;
    left: 50%;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--ink);
    color: #fff;
    font-size: 15px;
    font-weight: 500;
    white-space: nowrap;
    transform: translate(-50%, -50%);
    pointer-events: none;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
    animation: nudge 2.4s var(--ease) 1.2s infinite;
  }

  @keyframes nudge {
    0%,
    70%,
    100% {
      transform: translate(-50%, -50%);
    }
    80% {
      transform: translate(calc(-50% + 6px), calc(-50% - 2px));
    }
    90% {
      transform: translate(calc(-50% - 4px), calc(-50% + 1px));
    }
  }

  .placeholder {
    position: relative;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    aspect-ratio: 1 / 1;
    padding: 24px;
    border: 1px dashed var(--ink-3);
    background: var(--card);
    text-align: center;
    overflow: hidden;
  }

  .placeholder.error {
    border: 1px solid var(--vermilion);
  }

  .ph-grid {
    position: absolute;
    inset: 12%;
    background-image:
      linear-gradient(var(--rule-soft) 1px, transparent 1px),
      linear-gradient(90deg, var(--rule-soft) 1px, transparent 1px);
    background-size: calc(100% / 21) calc(100% / 21);
    opacity: 0.9;
  }

  .ph-title {
    position: relative;
    font-size: clamp(22px, 2.4vw, 30px);
    font-weight: 600;
    letter-spacing: -0.025em;
  }

  .placeholder.error .ph-title {
    color: var(--vermilion-ink);
  }

  .ph-sub {
    position: relative;
    max-width: 26em;
    color: var(--ink-2);
  }

  .placeholder .btn {
    position: relative;
    margin-top: 6px;
  }

  /* Phone/tablet: room under the content for the floating tool bar. */
  main:not(.wide) {
    padding-bottom: 120px;
  }

  @media (max-width: 699px) {
    .t1 {
      font-size: 46px;
    }

    .dek {
      font-size: 15px;
    }

    .dek-more {
      display: none;
    }
  }

  /* Tablet: code and decoder side by side, message and anatomy below. */
  @media (min-width: 700px) and (max-width: 1099px) {
    .stage-col {
      grid-column: 1 / span 7;
      grid-row: 2;
    }

    .readout-cell {
      grid-column: 8 / -1;
      grid-row: 2;
      margin-top: 22px;
    }

    .encoder-cell {
      grid-column: 1 / span 7;
      grid-row: 3;
    }

    .anatomy-cell {
      grid-column: 8 / -1;
      grid-row: 3;
    }
  }

  @media (min-width: 1100px) {
    .bench {
      padding-top: 36px;
      align-items: start;
    }

    .stage-col {
      grid-column: 1 / span 6;
      grid-row: 1 / span 4;
      position: sticky;
      top: 76px;
      margin-top: 0;
    }

    .stage-col {
      /* Keep the code, its tools and the export row inside one screen while it is sticky. */
      max-width: max(440px, calc(100vh - 280px));
    }

    .titles {
      grid-column: 7 / -1;
      grid-row: 1;
    }

    .readout-cell {
      grid-column: 7 / -1;
      grid-row: 2;
      margin-top: 32px;
    }

    .encoder-cell {
      grid-column: 7 / -1;
      grid-row: 3;
    }

    .anatomy-cell {
      grid-column: 7 / -1;
      grid-row: 4;
    }

    .qz-note {
      display: block;
    }
  }

  .footer {
    margin-top: 40px;
    padding: 36px var(--margin) 48px;
    border-top: 1px solid var(--ink);
    font-size: 14px;
    color: var(--ink-2);
  }

  main:not(.wide) + .footer {
    padding-bottom: 150px;
  }

  .foot-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px var(--gutter);
    max-width: 1520px;
    margin: 0 auto;
  }

  .foot-grid > * {
    grid-column: 1 / -1;
  }

  .foot-title {
    font-weight: 700;
    color: var(--ink);
  }

  .foot-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
  }

  @media (min-width: 900px) {
    .foot-title {
      grid-column: 1 / span 3;
    }

    .foot-grid > p:nth-child(2) {
      grid-column: 4 / span 5;
    }

    .foot-links {
      grid-column: 9 / -1;
      flex-direction: column;
    }
  }

  @media (max-width: 560px) {
    nav {
      gap: 14px;
    }

    nav a:not(.source) {
      display: none;
    }

    .back span {
      font-size: 13px;
    }
  }
</style>
