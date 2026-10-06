<script lang="ts">
  import { EXP, gfDiv, gfMul, gfPow, LOG } from '../lib/qr/gf256';
  import { bin, hex } from '../lib/format';

  type Op = 'mul' | 'div' | 'add' | 'pow';

  let aText = $state('83');
  let bText = $state('202');
  let op = $state<Op>('mul');
  let table = $state<'exp' | 'log'>('exp');

  function parse(t: string, max: number): number | null {
    const s = t.trim().toLowerCase();
    if (s === '') return null;
    const v = s.startsWith('0x')
      ? Number.parseInt(s.slice(2), 16)
      : /^[0-9]+$/.test(s)
        ? Number(s)
        : Number.NaN;
    return Number.isInteger(v) && v >= 0 && v <= max ? v : null;
  }

  const a = $derived(parse(aText, 255));
  const b = $derived(parse(bText, op === 'pow' ? 1000 : 255));

  const result = $derived.by((): { value: number | null; error?: string } => {
    if (a === null) return { value: null, error: 'a must be 0–255 (decimal, or hex like 0x53).' };
    if (b === null)
      return {
        value: null,
        error:
          op === 'pow'
            ? 'n must be a whole number 0–1000.'
            : 'b must be 0–255 (decimal, or hex like 0xCA).',
      };
    switch (op) {
      case 'mul':
        return { value: gfMul(a, b) };
      case 'div':
        if (b === 0) return { value: null, error: 'Division by 0 is undefined: 0 has no inverse.' };
        return { value: gfDiv(a, b) };
      case 'add':
        return { value: a ^ b };
      case 'pow':
        if (a === 0 && b === 0) return { value: 1 };
        return { value: gfPow(a, b) };
    }
  });

  /** Exponent cells to highlight in the antilog table, and value cells in the log table. */
  const marks = $derived.by(() => {
    const exps = new Set<number>();
    const vals = new Set<number>();
    const r = result.value;
    if (op === 'add') return { exps, vals, result: null };
    if (a !== null && a > 0) {
      exps.add(LOG[a]);
      vals.add(a);
    }
    if (op !== 'pow' && b !== null && b > 0) {
      exps.add(LOG[b]);
      vals.add(b);
    }
    if (r !== null && r > 0) {
      exps.add(LOG[r]);
      vals.add(r);
    }
    return { exps, vals, result: r !== null && r > 0 ? r : null };
  });

  const opSymbol: Record<Op, string> = { mul: '×', div: '÷', add: '+', pow: '^' };
</script>

<div class="calc">
  <div class="inputs">
    <label class="field">
      <span class="label">a</span>
      <input
        type="text"
        inputmode="numeric"
        bind:value={aText}
        aria-invalid={a === null}
        autocomplete="off"
        spellcheck="false"
      />
    </label>
    <label class="field op">
      <span class="label">operation</span>
      <select bind:value={op}>
        <option value="mul">× multiply</option>
        <option value="div">÷ divide</option>
        <option value="add">+ add (XOR)</option>
        <option value="pow">^ power</option>
      </select>
    </label>
    <label class="field">
      <span class="label">{op === 'pow' ? 'n' : 'b'}</span>
      <input
        type="text"
        inputmode="numeric"
        bind:value={bText}
        aria-invalid={b === null}
        autocomplete="off"
        spellcheck="false"
      />
    </label>
  </div>

  <div class="out" aria-live="polite">
    {#if result.error}
      <p class="error">{result.error}</p>
    {:else if a !== null && b !== null && result.value !== null}
      <p class="eq">
        <span class="num">{a}</span>
        {opSymbol[op]} <span class="num">{b}</span> = <strong class="num">{result.value}</strong>
        <span class="hexv mono">0x{hex(result.value)} · {bin(result.value, 8)}</span>
      </p>
      <p class="why mono">
        {#if op === 'add'}
          {bin(a, 8)} ⊕ {bin(b, 8)} = {bin(result.value, 8)} — addition is bitwise XOR, so a + a = 0.
        {:else if op === 'mul'}
          {#if a === 0 || b === 0}
            Anything times 0 is 0.
          {:else}
            α<sup>{LOG[a]}</sup> · α<sup>{LOG[b]}</sup> = α<sup>({LOG[a]} + {LOG[b]}) mod 255</sup>
            = α<sup>{(LOG[a] + LOG[b]) % 255}</sup> = {result.value}
          {/if}
        {:else if op === 'div'}
          {#if a === 0}
            0 divided by anything non-zero is 0.
          {:else}
            α<sup>{LOG[a]}</sup> / α<sup>{LOG[b]}</sup> = α<sup>({LOG[a]} − {LOG[b]}) mod 255</sup>
            = α<sup>{(((LOG[a] - LOG[b]) % 255) + 255) % 255}</sup> = {result.value}
          {/if}
        {:else}
          {#if a === 0}
            0<sup>{b}</sup> = {result.value}
          {:else}
            (α<sup>{LOG[a]}</sup>)<sup>{b}</sup> = α<sup>{LOG[a]} × {b} mod 255</sup> = α<sup
              >{(LOG[a] * b) % 255}</sup
            >
            = {result.value}
          {/if}
        {/if}
      </p>
    {/if}
  </div>

  <div class="tables">
    <div class="tabs" role="group" aria-label="Table">
      <button type="button" aria-pressed={table === 'exp'} onclick={() => (table = 'exp')}
        >antilog: i → α<sup>i</sup></button
      >
      <button type="button" aria-pressed={table === 'log'} onclick={() => (table = 'log')}
        >log: x → i</button
      >
    </div>
    <div class="grid-wrap">
      <table
        class="gf mono"
        aria-label={table === 'exp'
          ? 'Antilog table: entry at row r, column c is alpha to the power 16r + c'
          : 'Log table: entry at row r, column c is the exponent of 16r + c'}
      >
        <thead>
          <tr>
            <th scope="col"></th>
            {#each Array.from({ length: 16 }, (_, c) => c) as c (c)}<th scope="col"
                >{c.toString(16).toUpperCase()}</th
              >{/each}
          </tr>
        </thead>
        <tbody>
          {#each Array.from({ length: 16 }, (_, r) => r) as r (r)}
            <tr>
              <th scope="row">{r.toString(16).toUpperCase()}_</th>
              {#each Array.from({ length: 16 }, (_, c) => c) as c (c)}
                {@const i = r * 16 + c}
                {#if table === 'exp'}
                  <td
                    class:on={marks.exps.has(i)}
                    class:res={marks.result !== null && LOG[marks.result] === i && i < 255}
                    class:na={i === 255}>{i === 255 ? '·' : EXP[i]}</td
                  >
                {:else}
                  <td class:on={marks.vals.has(i)} class:res={marks.result === i} class:na={i === 0}
                    >{i === 0 ? '–' : LOG[i]}</td
                  >
                {/if}
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="note">
      {#if table === 'exp'}
        Row and column give the exponent in hex: the cell at row 3_, column 4 is α<sup>0x34</sup> =
        α<sup>52</sup>. Highlighted: the exponents used above.
      {:else}
        Row and column give the byte in hex: the cell at row 5_, column 3 is log<sub>α</sub>(0x53) =
        log<sub>α</sub>(83). Log of 0 is undefined.
      {/if}
    </p>
  </div>
</div>

<style>
  .calc {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  .inputs {
    display: grid;
    grid-template-columns: 1fr 1.4fr 1fr;
    gap: 10px;
    align-items: end;
  }

  .field {
    display: grid;
    gap: 4px;
  }

  input,
  select {
    width: 100%;
    min-height: 44px;
    padding: 0 10px;
    border: 1px solid var(--ink);
    border-radius: var(--radius);
    background: var(--card);
    font-family: var(--font-mono);
    font-size: 15px;
  }

  input[aria-invalid='true'] {
    border-color: var(--vermilion);
  }

  .out {
    min-height: 64px;
    padding: 12px 14px;
    border-left: 3px solid var(--ink);
    background: var(--card);
  }

  .eq {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
    font-size: 22px;
    letter-spacing: -0.01em;
  }

  .eq strong {
    font-weight: 600;
    color: var(--cobalt);
  }

  .hexv {
    font-size: 13px;
    color: var(--ink-3);
  }

  .why {
    margin-top: 4px;
    font-size: 13px;
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }

  .error {
    color: var(--vermilion-ink);
    font-size: 14px;
  }

  sup {
    font-size: 0.75em;
    line-height: 0;
  }

  sub {
    font-size: 0.75em;
    line-height: 0;
  }

  .tabs {
    display: inline-flex;
    border: 1px solid var(--ink);
    border-radius: var(--radius);
  }

  .tabs button {
    min-height: 36px;
    padding: 0 12px;
    border: 0;
    background: var(--card);
    font-size: 13px;
  }

  .tabs button + button {
    border-left: 1px solid var(--ink);
  }

  .tabs button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--card);
  }

  .grid-wrap {
    margin-top: 10px;
    overflow-x: auto;
  }

  .gf {
    border-collapse: collapse;
    font-size: 11px;
  }

  .gf th {
    padding: 3px 4px;
    font-weight: 400;
    color: var(--ink-3);
    text-align: center;
  }

  .gf thead th {
    border-bottom: 1px solid var(--ink);
  }

  .gf tbody th {
    border-right: 1px solid var(--ink);
    text-align: right;
    padding-right: 6px;
  }

  .gf td {
    min-width: 28px;
    padding: 3px 2px;
    text-align: center;
    color: var(--ink-2);
  }

  .gf tbody tr:nth-child(even) td {
    background: rgb(0 0 0 / 0.025);
  }

  .gf td.on {
    background: var(--ink) !important;
    color: var(--card);
  }

  .gf td.res {
    background: var(--cobalt) !important;
    color: #fff;
  }

  .gf td.na {
    color: #b7b7ae;
  }

  .note {
    margin-top: 8px;
    font-size: 12px;
    color: var(--ink-3);
  }

  @media (max-width: 520px) {
    .inputs {
      grid-template-columns: 1fr 1fr;
    }

    .op {
      grid-column: 1 / -1;
      order: -1;
    }
  }
</style>
