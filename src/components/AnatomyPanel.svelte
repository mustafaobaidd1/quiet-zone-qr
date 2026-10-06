<script lang="ts">
  import { Role, type RoleId } from '../lib/qr/matrix';
  import { probe, ROLES } from '../lib/roles';
  import { app } from '../lib/state.svelte';

  const sym = $derived(app.symbol);
  const dmg = $derived(app.damage);
  const info = $derived(sym && app.probeIndex !== null ? probe(sym, app.probeIndex) : null);

  const counts = $derived.by(() => {
    const m = new Map<number, number>();
    if (!sym) return m;
    for (const r of sym.roles) m.set(r, (m.get(r) ?? 0) + 1);
    return m;
  });

  const state = $derived.by(() => {
    if (!info || !dmg || app.probeIndex === null) return '';
    const i = app.probeIndex;
    const now = dmg.modules[i] ? 'dark' : 'light';
    if (dmg.torn[i]) return 'torn away (reads light)';
    if (dmg.sticker[i])
      return `under a sticker (reads light${app.erasureMode ? ', flagged as an erasure' : ''})`;
    if (dmg.changed[i]) return `${now}, should be ${now === 'dark' ? 'light' : 'dark'} — damaged`;
    return now;
  });

  function swatchClass(id: RoleId) {
    return id === Role.Ec ? 'hatch' : id === Role.Remainder ? 'dots' : 'wash';
  }
</script>

<section class="anatomy" aria-labelledby="anatomy-label">
  <h2 class="label" id="anatomy-label"><span class="idx">03</span> Anatomy</h2>

  <div class="probe" id="probe-readout" aria-live="polite" data-testid="probe">
    {#if info}
      <p class="coords label">Row {info.row} · Column {info.col}</p>
      <p class="role">{info.title}</p>
      <p class="detail">{info.detail}</p>
      {#if state}<p class="state">Module now: {state}</p>{/if}
    {:else}
      <p class="role muted">Point at a module</p>
      <p class="detail">
        Hover the code (or choose <strong>Inspect</strong> and tap) to see what any module does. The codeword
        it belongs to is outlined and its whole block is tinted.
      </p>
    {/if}
  </div>

  <div class="regions">
    <div class="regions-head">
      <h3 class="label">Regions</h3>
      {#if app.regions.length}
        <button type="button" class="reset" onclick={() => (app.regions = [])}>Show all</button>
      {/if}
    </div>
    <ul>
      {#each ROLES as r (r.id)}
        {@const n = counts.get(r.id) ?? 0}
        <li>
          <button
            type="button"
            class="region"
            aria-pressed={app.regions.includes(r.id)}
            disabled={n === 0}
            onclick={() => app.toggleRegion(r.id)}
            title={r.purpose}
          >
            <span class="swatch {swatchClass(r.id)}" aria-hidden="true"></span>
            <span class="name">{r.plural}</span>
            <span class="count num">{n === 0 ? (r.id === Role.Version ? 'v7+' : 'none') : n}</span>
          </button>
        </li>
      {/each}
    </ul>
    <p class="hint">Switch regions on to isolate them; everything else fades.</p>
  </div>

  <div class="damage-key">
    <h3 class="label">Damage key</h3>
    <ul>
      <li><span class="k added" aria-hidden="true"></span>Ink added — module should be light</li>
      <li><span class="k missing" aria-hidden="true"></span>Ink missing — module should be dark</li>
      <li>
        <span class="k repaired" aria-hidden="true"></span>Flashes when the decoder repairs a bit
      </li>
    </ul>
  </div>
</section>

<style>
  .anatomy {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }

  .idx {
    color: var(--ink);
    margin-right: 6px;
  }

  .probe {
    display: grid;
    gap: 4px;
    min-height: 112px;
    padding: 14px 16px;
    border: 1px solid var(--rule);
    background: var(--card);
  }

  .role {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .role.muted {
    color: var(--ink-2);
  }

  .detail {
    font-size: 14px;
    line-height: 1.5;
    color: var(--ink-2);
  }

  .state {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-3);
  }

  .regions-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 32px;
  }

  .reset {
    min-height: 32px;
    border: 0;
    background: none;
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .regions ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 12px;
  }

  .region {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 40px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: none;
    text-align: left;
    font-size: 14px;
  }

  .region:hover:not(:disabled) {
    background: var(--rule-soft);
  }

  .region[aria-pressed='true'] {
    border-color: var(--cobalt);
    background: var(--cobalt-soft);
  }

  .region:disabled {
    color: #9a9a92;
  }

  .swatch {
    width: 16px;
    height: 16px;
    border: 1px solid var(--cobalt);
  }

  .swatch.wash {
    background: var(--cobalt-wash);
  }

  .swatch.hatch {
    background: repeating-linear-gradient(45deg, var(--cobalt) 0 1px, var(--cobalt-wash) 1px 4px);
  }

  .swatch.dots {
    background:
      radial-gradient(circle, var(--cobalt) 1.5px, transparent 1.8px) 0 0 / 5px 5px,
      var(--cobalt-wash);
  }

  .region:disabled .swatch {
    border-color: var(--rule);
    background: none;
  }

  .count {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-3);
  }

  .hint {
    margin-top: 6px;
    font-size: 13px;
    color: var(--ink-3);
  }

  .damage-key ul {
    display: grid;
    gap: 6px;
    margin-top: 8px;
    font-size: 14px;
    color: var(--ink-2);
  }

  .damage-key li {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .k {
    flex: none;
    width: 14px;
    height: 14px;
  }

  .k.added {
    background: var(--vermilion);
  }

  .k.missing {
    border: 2px solid var(--vermilion);
    transform: scale(0.8);
  }

  .k.repaired {
    background: var(--cobalt);
  }

  @media (max-width: 420px) {
    .regions ul {
      grid-template-columns: 1fr;
    }
  }
</style>
