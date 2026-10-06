<script lang="ts">
  import { app } from '../lib/state.svelte';

  let visible = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const t = app.toast;
    if (!t) return;
    visible = true;
    clearTimeout(timer);
    timer = setTimeout(() => (visible = false), 5200);
    return () => clearTimeout(timer);
  });
</script>

<div class="toast-region" role="status" aria-live="polite">
  {#if app.toast && visible}
    <div class="toast" class:error={app.toast.tone === 'error'} data-testid="toast">
      <span class="dot" aria-hidden="true"></span>
      <span>{app.toast.message}</span>
      <button type="button" class="close" onclick={() => (visible = false)} aria-label="Dismiss"
        >×</button
      >
    </div>
  {/if}
</div>

<style>
  .toast-region {
    position: fixed;
    left: 50%;
    bottom: 24px;
    z-index: 40;
    width: min(560px, calc(100vw - 32px));
    transform: translateX(-50%);
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 8px 12px 16px;
    background: var(--ink);
    color: #fff;
    font-size: 14px;
    line-height: 1.4;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.2);
    pointer-events: auto;
    animation: rise 220ms var(--ease);
  }

  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    background: #7d95ff;
  }

  .toast.error .dot {
    background: var(--vermilion);
  }

  .close {
    flex: none;
    width: 36px;
    height: 36px;
    margin-left: auto;
    border: 0;
    background: none;
    color: #fff;
    font-size: 20px;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  @media (max-width: 1099px) {
    .toast-region {
      bottom: 130px;
    }
  }
</style>
