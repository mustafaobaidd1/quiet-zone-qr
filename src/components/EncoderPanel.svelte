<script lang="ts">
  import { encode, utf8Length, type ModeChoice } from '../lib/qr/encoder';
  import { EC_LEVELS, EC_RECOVERY, MAX_VERSION, type EcLevel } from '../lib/qr/tables';
  import { app } from '../lib/state.svelte';

  const MODES: { id: ModeChoice; label: string }[] = [
    { id: 'auto', label: 'Auto (optimal)' },
    { id: 'numeric', label: 'Numeric 0–9' },
    { id: 'alphanumeric', label: 'Alphanumeric' },
    { id: 'byte', label: 'Byte (UTF-8)' },
  ];
  const MODE_NAMES: Record<string, string> = {
    numeric: 'numeric',
    alphanumeric: 'alphanumeric',
    byte: 'byte',
  };

  const res = $derived(app.result);
  const sym = $derived(app.symbol);

  const versionValue = $derived(app.version === 'auto' ? 'auto' : String(app.version));
  const maskValue = $derived(app.mask === 'auto' ? 'auto' : String(app.mask));

  function setVersion(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    app.version = v === 'auto' ? 'auto' : Number(v);
  }

  function setMask(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    app.mask = v === 'auto' ? 'auto' : Number(v);
  }

  /** Longest prefix of the text that fits at the current level (binary search on code points). */
  function trimToFit() {
    const chars = [...app.text];
    let lo = 0;
    let hi = chars.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const r = encode(chars.slice(0, mid).join(''), {
        level: app.level,
        mode: app.mode,
        version: app.version,
      });
      if (r.ok) lo = mid;
      else hi = mid - 1;
    }
    app.text = chars.slice(0, lo).join('');
  }

  const segmentSummary = $derived(
    sym ? sym.segments.map((s) => `${MODE_NAMES[s.mode]} ×${s.count}`).join(' + ') : '',
  );

  const used = $derived(sym ? sym.segmentBits / sym.capacityBits : 0);
  const fmt = (n: number) => n.toLocaleString('en-US');
  const bestMask = $derived(
    sym ? sym.penalties.reduce((b, p) => (p.total < b.total ? p : b)).mask : 0,
  );
</script>

<section class="encoder" aria-labelledby="message-label">
  <h2 class="label" id="message-label"><span class="idx">02</span> Message</h2>

  <div class="field">
    <label class="visually-hidden" for="message">Text to encode</label>
    <textarea
      id="message"
      rows="2"
      spellcheck="false"
      autocomplete="off"
      placeholder="Type something to encode"
      bind:value={app.text}
      aria-describedby="encode-status"
      aria-invalid={!res.ok && res.error.kind !== 'empty'}
      data-testid="message"></textarea>
    <span class="count num" aria-hidden="true"
      >{fmt([...app.text].length)} chars · {fmt(utf8Length(app.text))} bytes</span
    >
  </div>

  <div class="controls">
    <div class="control">
      <label class="label" for="mode">Mode</label>
      <select id="mode" bind:value={app.mode} data-testid="mode">
        {#each MODES as m (m.id)}
          <option value={m.id}>{m.label}</option>
        {/each}
      </select>
    </div>
    <fieldset class="control levels">
      <legend class="label">Error correction</legend>
      <div class="segmented">
        {#each EC_LEVELS as l (l)}
          <label class="level" class:active={app.level === l}>
            <input
              type="radio"
              name="ec-level"
              value={l}
              bind:group={app.level}
              data-testid="level-{l}"
            />
            <span class="level-letter">{l}</span>
            <span class="level-pct">{EC_RECOVERY[l as EcLevel]}</span>
          </label>
        {/each}
      </div>
    </fieldset>
    <div class="control">
      <label class="label" for="version">Version</label>
      <select id="version" value={versionValue} onchange={setVersion} data-testid="version">
        <option value="auto">Auto (smallest)</option>
        {#each Array.from({ length: MAX_VERSION }, (_, i) => i + 1) as v (v)}
          <option value={String(v)}>{v} · {17 + 4 * v}×{17 + 4 * v}</option>
        {/each}
      </select>
    </div>
    <div class="control">
      <label class="label" for="mask">Mask</label>
      <select id="mask" value={maskValue} onchange={setMask} data-testid="mask">
        <option value="auto">Auto (lowest)</option>
        {#each [0, 1, 2, 3, 4, 5, 6, 7] as m (m)}
          <option value={String(m)}>Mask {m}</option>
        {/each}
      </select>
    </div>
  </div>

  <div id="encode-status" class="status" aria-live="polite" data-testid="encode-status">
    {#if sym}
      <p class="facts">
        <span><strong>Version {sym.version}</strong> · {sym.size}×{sym.size} modules</span>
        <span>{segmentSummary}</span>
        <span>mask {sym.mask}{sym.maskChoice === 'fixed' ? ' (fixed)' : ''}</span>
      </p>
      <div class="capacity" aria-hidden="true">
        <span style:width="{Math.min(1, used) * 100}%"></span>
      </div>
      <p class="capacity-text num">
        {fmt(sym.segmentBits)} of {fmt(sym.capacityBits)} data bits used ({Math.round(used * 100)}%)
        · {sym.layout.dataCodewords} data + {sym.layout.ecCodewordsPerBlock * sym.layout.numBlocks} EC
        codewords
      </p>
    {:else if !res.ok}
      {@const err = res.error}
      <div
        class="error"
        class:empty={err.kind === 'empty'}
        role={err.kind === 'empty' ? undefined : 'alert'}
      >
        {#if err.kind === 'empty'}
          <p>
            <strong>Type something to encode.</strong> Any text works: a URL, a sentence, digits, emoji.
          </p>
        {:else if err.kind === 'invalid-char'}
          <p>
            <strong
              >{err.mode === 'numeric' ? 'Numeric' : 'Alphanumeric'} mode cannot encode “{err.char}”</strong
            >
            (character {err.index + 1}). {err.mode === 'numeric'
              ? 'It only takes the digits 0–9.'
              : 'It only takes 0–9, A–Z (capitals), space and $ % * + - . / :'}
          </p>
          <button type="button" class="btn" onclick={() => (app.mode = 'auto')}
            >Switch to Auto</button
          >
        {:else if err.kind === 'too-long'}
          <p>
            <strong>Too long for any QR code at level {err.level}.</strong> It needs {fmt(err.bits)} data
            bits; the largest symbol, version 40-{err.level}, holds {fmt(err.capacityBits)}.
          </p>
          <div class="actions">
            {#if err.fitsAtLevel && err.fitsAtLevel !== err.level}
              <button
                type="button"
                class="btn"
                onclick={() => (app.level = err.fitsAtLevel as EcLevel)}
                >Use level {err.fitsAtLevel}</button
              >
            {/if}
            <button type="button" class="btn" onclick={trimToFit}>Trim to fit</button>
          </div>
        {:else if err.kind === 'version-too-small'}
          <p>
            <strong>Does not fit version {err.version}-{err.level}.</strong> It needs {fmt(
              err.bits,
            )} data bits; that version holds {fmt(err.capacityBits)}.
          </p>
          <div class="actions">
            {#if err.minVersion}
              <button
                type="button"
                class="btn"
                onclick={() => (app.version = err.minVersion as number)}
                >Use version {err.minVersion}</button
              >
            {/if}
            <button type="button" class="btn" onclick={() => (app.version = 'auto')}
              >Auto version</button
            >
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if sym}
    <div class="masks">
      <div class="masks-head">
        <h3 class="label">Mask penalties</h3>
        <span class="label">N1 + N2 + N3 + N4, lower is better</span>
      </div>
      <ol class="mask-strip" aria-label="Penalty score of each mask pattern">
        {#each sym.penalties as p (p.mask)}
          <li>
            <button
              type="button"
              class="mask-cell"
              class:chosen={p.mask === sym.mask}
              class:best={p.mask === bestMask}
              aria-pressed={app.mask === p.mask}
              onclick={() => (app.mask = app.mask === p.mask ? 'auto' : p.mask)}
              title="Rule 1: {p.n1} · Rule 2: {p.n2} · Rule 3: {p.n3} · Rule 4: {p.n4}"
              aria-label="Mask {p.mask}: penalty {p.total}{p.mask === bestMask
                ? ', lowest'
                : ''}{p.mask === sym.mask ? ', in use' : ''}"
            >
              <span class="mask-n mono">{p.mask}</span>
              <span class="mask-total num">{p.total}</span>
            </button>
          </li>
        {/each}
      </ol>
    </div>
  {/if}
</section>

<style>
  .encoder {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    container-type: inline-size;
  }

  .idx {
    color: var(--ink);
    margin-right: 6px;
  }

  .field {
    position: relative;
    min-width: 0;
  }

  textarea {
    display: block;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    min-height: 76px;
    max-height: 220px;
    padding: 12px 14px 26px;
    border: 1px solid var(--ink);
    border-radius: var(--radius);
    background: var(--card);
    font-family: var(--font-mono);
    font-size: 15px;
    line-height: 1.45;
    resize: vertical;
    field-sizing: content;
  }

  textarea::placeholder {
    color: var(--ink-3);
  }

  textarea[aria-invalid='true'] {
    border-color: var(--vermilion);
    box-shadow: inset 3px 0 0 var(--vermilion);
  }

  textarea:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .count {
    position: absolute;
    right: 10px;
    bottom: 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-3);
    pointer-events: none;
  }

  .controls {
    display: grid;
    grid-template-columns: 1.15fr auto 1fr 1fr;
    gap: 12px;
    align-items: end;
  }

  .control {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 4px;
  }

  select {
    width: 100%;
    min-height: 44px;
    padding: 0 30px 0 10px;
    border: 1px solid var(--ink);
    border-radius: var(--radius);
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23111' stroke-width='1.4'/%3E%3C/svg%3E")
        no-repeat right 10px center,
      var(--card);
    font-size: 14px;
    appearance: none;
    text-overflow: ellipsis;
  }

  .segmented {
    display: flex;
    border: 1px solid var(--ink);
    border-radius: var(--radius);
    background: var(--card);
  }

  .level {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 46px;
    min-height: 42px;
    padding: 2px 6px;
    cursor: pointer;
    line-height: 1.05;
  }

  .level + .level {
    border-left: 1px solid var(--ink);
  }

  .level input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .level-letter {
    font-weight: 600;
    font-size: 15px;
  }

  .level-pct {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--ink-3);
  }

  .level.active {
    background: var(--ink);
    color: var(--card);
  }

  .level.active .level-pct {
    color: #c9c9c2;
  }

  .level:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
    z-index: 1;
  }

  .status {
    min-height: 64px;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 16px;
    font-size: 14px;
  }

  .capacity {
    height: 4px;
    margin: 10px 0 6px;
    background: var(--rule-soft);
  }

  .capacity span {
    display: block;
    height: 100%;
    background: var(--ink);
    transition: width 200ms var(--ease);
  }

  .capacity-text {
    font-size: 12px;
    color: var(--ink-3);
  }

  .error {
    display: grid;
    gap: 10px;
    justify-items: start;
    padding: 12px 14px;
    border-left: 3px solid var(--vermilion);
    background: var(--card);
    font-size: 14px;
    line-height: 1.5;
  }

  .error.empty {
    border-left-color: var(--ink);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .masks {
    display: grid;
    gap: 8px;
  }

  .masks-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .mask-strip {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--ink);
  }

  .mask-strip li + li {
    border-left: 1px solid var(--rule);
  }

  .mask-cell {
    display: grid;
    width: 100%;
    min-height: 52px;
    padding: 6px 4px;
    border: 0;
    background: var(--card);
    text-align: center;
    line-height: 1.15;
  }

  .mask-cell:hover {
    background: var(--rule-soft);
  }

  .mask-n {
    font-size: 11px;
    color: var(--ink-3);
  }

  .mask-total {
    font-size: 15px;
    font-weight: 500;
  }

  .mask-cell.best .mask-n::after {
    content: ' ★';
    color: var(--cobalt);
  }

  .mask-cell.chosen {
    background: var(--ink);
    color: var(--card);
  }

  .mask-cell.chosen .mask-n {
    color: #c9c9c2;
  }

  @container (max-width: 560px) {
    .controls {
      grid-template-columns: 1fr 1fr;
    }

    .levels {
      grid-column: 1 / -1;
      order: -1;
    }

    .levels .segmented {
      width: 100%;
    }

    .level {
      flex: 1;
    }
  }
</style>
