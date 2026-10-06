<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';
  import { app, type BrushSize, type Tool } from '../lib/state.svelte';

  let { floating = false, hidden = false }: { floating?: boolean; hidden?: boolean } = $props();

  const TOOLS: { id: Tool; label: string; icon: IconName; hint: string; short: string }[] = [
    {
      id: 'inspect',
      label: 'Inspect',
      icon: 'inspect',
      hint: 'Hover or tap a module to see its role.',
      short: 'Tap a module to see its role.',
    },
    {
      id: 'scratch',
      label: 'Scratch',
      icon: 'scratch',
      hint: 'Drag across the code: every module you touch flips.',
      short: 'Drag to flip modules.',
    },
    {
      id: 'erase',
      label: 'Erase',
      icon: 'erase',
      hint: 'Drag to rub modules out to white.',
      short: 'Drag to rub modules out.',
    },
    {
      id: 'sticker',
      label: 'Sticker',
      icon: 'sticker',
      hint: 'Drag a rectangle, or tap, to cover the code with a logo.',
      short: 'Drag or tap to place a logo.',
    },
    {
      id: 'tear',
      label: 'Tear',
      icon: 'tear',
      hint: 'Tap near a corner: the tear reaches the point you tap.',
      short: 'Tap near a corner to tear it.',
    },
  ];

  const BRUSHES: BrushSize[] = ['S', 'M', 'L'];

  let noiseOpen = $state(false);
  let noiseButton: HTMLButtonElement | undefined = $state();
  let noisePanel: HTMLDivElement | undefined = $state();
  let noiseSlider: HTMLInputElement | undefined = $state();

  const current = $derived(TOOLS.find((t) => t.id === app.tool));
  const hint = $derived((floating ? current?.short : current?.hint) ?? '');
  const expected = $derived(
    app.symbol ? Math.round(app.noiseP * app.symbol.size * app.symbol.size) : 0,
  );
  const disabled = $derived(!app.symbol);

  function toggleNoise() {
    noiseOpen = !noiseOpen;
    if (noiseOpen) queueMicrotask(() => noiseSlider?.focus());
  }

  function applyNoise() {
    app.addNoise();
  }

  function onWindowPointerDown(e: PointerEvent) {
    if (!noiseOpen) return;
    const t = e.target as Node;
    if (noisePanel?.contains(t) || noiseButton?.contains(t)) return;
    noiseOpen = false;
  }

  function onPanelKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      noiseOpen = false;
      noiseButton?.focus();
    }
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div
  class="toolbar"
  class:floating
  class:hidden
  role="toolbar"
  aria-label="Damage tools"
  aria-hidden={hidden ? 'true' : undefined}
  inert={hidden}
>
  <div class="context" aria-live="polite">
    {#if app.tool === 'scratch' || app.tool === 'erase'}
      <span class="context-label">Brush</span>
      <div class="segmented" role="group" aria-label="Brush size">
        {#each BRUSHES as b (b)}
          <button
            type="button"
            aria-pressed={app.brush === b}
            onclick={() => (app.brush = b)}
            aria-label="Brush size {b === 'S' ? 'small' : b === 'M' ? 'medium' : 'large'}"
            >{b}</button
          >
        {/each}
      </div>
      <span class="context-hint">{hint}</span>
    {:else if app.tool === 'sticker'}
      <label class="switch">
        <input type="checkbox" bind:checked={app.erasureMode} />
        <span class="track" aria-hidden="true"></span>
        <span>Erasure decoding</span>
      </label>
      <span class="context-hint"
        >{app.erasureMode
          ? 'Codewords under stickers are known-bad: each costs 1 unit of the budget instead of 2.'
          : hint}</span
      >
    {:else}
      <span class="context-hint">{hint}</span>
    {/if}
  </div>

  <div class="row">
    <div class="tools">
      {#each TOOLS as t (t.id)}
        <button
          type="button"
          class="tool"
          aria-pressed={app.tool === t.id}
          onclick={() => (app.tool = t.id)}
          {disabled}
          title={t.hint}
          data-tool={t.id}
        >
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </button>
      {/each}
    </div>
    <span class="divider" aria-hidden="true"></span>
    <div class="actions">
      <div class="noise-wrap">
        <button
          type="button"
          class="tool"
          bind:this={noiseButton}
          aria-expanded={noiseOpen}
          aria-controls="noise-panel"
          onclick={toggleNoise}
          {disabled}
          title="Flip random modules"
        >
          <Icon name="noise" />
          <span>Noise</span>
        </button>
        {#if noiseOpen}
          <div
            class="noise-panel"
            id="noise-panel"
            bind:this={noisePanel}
            role="dialog"
            aria-label="Random noise"
            tabindex="-1"
            onkeydown={onPanelKey}
          >
            <label for="noise-p" class="label">Flip each module with probability</label>
            <div class="noise-row">
              <input
                id="noise-p"
                type="range"
                min="0.005"
                max="0.25"
                step="0.005"
                bind:value={app.noiseP}
                bind:this={noiseSlider}
                aria-valuetext="{(app.noiseP * 100).toFixed(1)} percent"
              />
              <output for="noise-p" class="num">{(app.noiseP * 100).toFixed(1)}%</output>
            </div>
            <p class="noise-note">
              ≈ {expected} of {app.symbol ? app.symbol.size * app.symbol.size : 0} modules. Each click
              adds a fresh draw.
            </p>
            <button type="button" class="btn primary" onclick={applyNoise} data-testid="apply-noise"
              >Add noise</button
            >
          </div>
        {/if}
      </div>
      <button
        type="button"
        class="tool"
        onclick={() => app.undo()}
        disabled={disabled || app.ops.length === 0}
        title="Undo (Ctrl+Z). Redo: Ctrl+Shift+Z"
      >
        <Icon name="undo" />
        <span>Undo</span>
      </button>
      <button
        type="button"
        class="tool"
        onclick={() => app.clear()}
        disabled={disabled || app.ops.length === 0}
        title="Remove all damage"
      >
        <Icon name="clear" />
        <span>Clear</span>
      </button>
    </div>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .row {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }

  .tools,
  .actions {
    display: flex;
    gap: 4px;
  }

  .divider {
    width: 1px;
    background: var(--rule);
    margin: 6px 6px;
  }

  .tool {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 64px;
    min-height: 56px;
    padding: 6px 8px 5px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: var(--ink);
    font-size: 12px;
    line-height: 1;
    letter-spacing: 0.01em;
    transition:
      background 120ms var(--ease),
      color 120ms var(--ease),
      border-color 120ms var(--ease);
  }

  .tool:hover:not(:disabled) {
    background: var(--rule-soft);
  }

  .tool[aria-pressed='true'] {
    background: var(--ink);
    color: var(--card);
  }

  .tool[aria-pressed='true']:hover {
    background: var(--ink);
  }

  .tool[aria-expanded='true'] {
    border-color: var(--ink);
  }

  .tool:disabled {
    color: #a8a8a0;
  }

  .context {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 32px;
    font-size: 13px;
    color: var(--ink-2);
  }

  .context-label {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .context-hint {
    min-width: 0;
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--ink);
    border-radius: var(--radius);
  }

  .segmented button {
    min-width: 36px;
    min-height: 32px;
    border: 0;
    background: transparent;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .segmented button + button {
    border-left: 1px solid var(--ink);
  }

  .segmented button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--card);
  }

  .switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    color: var(--ink);
    white-space: nowrap;
    cursor: pointer;
  }

  .switch input {
    position: absolute;
    opacity: 0;
    width: 36px;
    height: 20px;
    margin: 0;
    cursor: pointer;
  }

  .track {
    position: relative;
    width: 36px;
    height: 20px;
    border: 1px solid var(--ink);
    border-radius: 10px;
    background: var(--card);
    transition: background 120ms var(--ease);
  }

  .track::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--ink);
    transition: transform 160ms var(--ease);
  }

  .switch input:checked + .track {
    background: var(--vermilion);
    border-color: var(--vermilion);
  }

  .switch input:checked + .track::after {
    transform: translateX(16px);
    background: #fff;
  }

  .switch input:focus-visible + .track {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .noise-wrap {
    position: relative;
  }

  .noise-panel {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    z-index: 30;
    display: grid;
    gap: 10px;
    width: 280px;
    padding: 16px;
    border: 1px solid var(--ink);
    background: var(--card);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.12);
    transform: translateX(-50%);
  }

  .noise-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .noise-row input {
    flex: 1;
    accent-color: var(--ink);
    min-height: 32px;
  }

  .noise-row output {
    min-width: 52px;
    font-family: var(--font-mono);
    font-size: 14px;
    text-align: right;
  }

  .noise-note {
    font-size: 13px;
    color: var(--ink-3);
  }

  /* Phone and tablet: tools become a bottom bar while the code is on screen. */
  .toolbar.floating {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 20;
    gap: 0;
    padding: 6px max(8px, env(safe-area-inset-left)) max(6px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--ink);
    background: rgb(251 251 249 / 0.96);
    backdrop-filter: blur(8px);
    transition: transform 220ms var(--ease);
  }

  .toolbar.floating.hidden {
    transform: translateY(110%);
  }

  .toolbar.floating .context {
    order: -1;
    min-height: 36px;
    padding: 0 4px 4px;
    font-size: 12px;
    gap: 8px;
  }

  .toolbar.floating .context-hint {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toolbar.floating .row,
  .toolbar.floating .context {
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
  }

  .toolbar.floating .row {
    justify-content: space-between;
    gap: 0;
  }

  .toolbar.floating .tools,
  .toolbar.floating .actions {
    gap: 0;
    flex: 1 1 auto;
    justify-content: space-around;
  }

  .toolbar.floating .tools {
    flex-grow: 5;
  }

  .toolbar.floating .actions {
    flex-grow: 3;
  }

  .toolbar.floating .divider {
    margin: 8px 2px;
  }

  .toolbar.floating .tool {
    flex: 1 1 0;
    min-width: 44px;
    min-height: 52px;
    padding: 6px 2px 4px;
    font-size: 11px;
  }

  .toolbar.floating .noise-panel {
    position: fixed;
    bottom: 112px;
    left: 50%;
    width: min(320px, calc(100vw - 32px));
  }

  @media (max-width: 360px) {
    .toolbar.floating .tool span {
      font-size: 10px;
    }
  }
</style>
