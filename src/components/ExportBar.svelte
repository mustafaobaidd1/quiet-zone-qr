<script lang="ts">
  import Icon from './Icon.svelte';
  import { downloadPng, downloadSvg } from '../lib/export';
  import { app } from '../lib/state.svelte';

  const sym = $derived(app.symbol);

  function svg() {
    if (!sym) return;
    try {
      const name = downloadSvg(sym);
      app.notify(`Saved ${name} — the undamaged code. Point your phone camera at it.`);
    } catch (err) {
      app.notify(`Export failed: ${(err as Error).message}`, 'error');
    }
  }

  async function png() {
    if (!sym) return;
    try {
      const name = await downloadPng(sym);
      app.notify(`Saved ${name} — the undamaged code. Point your phone camera at it.`);
    } catch (err) {
      app.notify(`Export failed: ${(err as Error).message}`, 'error');
    }
  }
</script>

<div class="export">
  <p class="text">
    <span class="title">Test it with your phone.</span>
    <span class="sub">Downloads the undamaged code with its 4-module quiet zone.</span>
  </p>
  <div class="buttons">
    <button type="button" class="btn" onclick={svg} disabled={!sym} data-testid="export-svg">
      <Icon name="download" size={18} /> SVG
    </button>
    <button type="button" class="btn" onclick={png} disabled={!sym} data-testid="export-png">
      <Icon name="download" size={18} /> PNG
    </button>
  </div>
</div>

<style>
  .export {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    flex-wrap: wrap;
    padding-top: 10px;
    border-top: 1px solid var(--rule);
  }

  .text {
    flex: 1 1 240px;
    font-size: 13px;
    line-height: 1.4;
  }

  .title {
    font-weight: 600;
  }

  .sub {
    color: var(--ink-3);
  }

  .buttons {
    display: flex;
    gap: 8px;
  }

  .btn {
    min-height: 44px;
  }
</style>
