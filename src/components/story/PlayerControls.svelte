<script lang="ts">
  import Icon from '../Icon.svelte';
  import type { Player } from '../../lib/player.svelte';

  let {
    player,
    label,
    unit = 'step',
    valueText,
  }: { player: Player; label: string; unit?: string; valueText?: string } = $props();

  const id = `scrub-${Math.random().toString(36).slice(2, 8)}`;
  const shown = $derived(Math.floor(player.progress));
</script>

<div class="controls">
  <button
    type="button"
    class="play"
    onclick={() => player.toggle()}
    aria-label={player.playing
      ? `Pause ${label}`
      : player.done
        ? `Replay ${label}`
        : `Play ${label}`}
  >
    <Icon name={player.playing ? 'pause' : 'play'} size={18} />
  </button>
  <label class="visually-hidden" for={id}>{label}</label>
  <input
    {id}
    type="range"
    min="0"
    max={player.length}
    step="1"
    value={shown}
    oninput={(e) => player.seek(Number((e.currentTarget as HTMLInputElement).value))}
    aria-valuetext={valueText ?? `${unit} ${shown} of ${player.length}`}
  />
  <span class="count num" aria-hidden="true">{shown}/{player.length}</span>
  <button type="button" class="all" onclick={() => player.finish()} disabled={player.done}
    >Show all</button
  >
</div>

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .play {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    border: 1px solid var(--ink);
    border-radius: 50%;
    background: var(--card);
  }

  .play:hover {
    background: var(--ink);
    color: var(--card);
  }

  input[type='range'] {
    flex: 1;
    min-width: 0;
    min-height: 32px;
    accent-color: var(--ink);
  }

  .count {
    min-width: 64px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-3);
    text-align: right;
  }

  .all {
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    background: none;
    font-size: 13px;
  }

  .all:hover:not(:disabled) {
    border-color: var(--ink);
  }

  .all:disabled {
    color: #a1a199;
  }
</style>
