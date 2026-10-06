<script lang="ts">
  import type { QrSymbol } from '../../lib/qr/encoder';
  import { charCountBits } from '../../lib/qr/tables';
  import { fmt, showChar } from '../../lib/format';

  let { symbol }: { symbol: QrSymbol } = $props();

  const LIMIT = 36;
  const MODE_TEXT = {
    numeric: 'Numeric mode packs three digits into 10 bits.',
    alphanumeric: 'Alphanumeric mode packs two characters into 11 bits: first × 45 + second.',
    byte: 'Byte mode stores each UTF-8 byte as 8 bits.',
  } as const;

  const segments = $derived(symbol.segments);
  /** Segments whose full bit listing has been expanded (2 header chunks + LIMIT data chunks otherwise). */
  let expanded = $state<boolean[]>([]);
  const shown = (si: number) => (expanded[si] ? Number.POSITIVE_INFINITY : LIMIT + 2);
</script>

<div class="step-text">
  <p>
    The encoder first chooses a <strong>mode</strong>. Digits, upper-case letters and everything
    else cost different numbers of bits, so “Auto” splits the text into the cheapest run of
    segments.
  </p>
  <p>
    Every segment starts with a 4-bit mode indicator and a character count. In version
    {symbol.version} the count takes {charCountBits('numeric', symbol.version)}, {charCountBits(
      'alphanumeric',
      symbol.version,
    )}
    or {charCountBits('byte', symbol.version)} bits (numeric, alphanumeric, byte).
  </p>
  <p>
    This message needs <strong>{fmt(symbol.segmentBits)} bits</strong> in {segments.length}
    segment{segments.length === 1 ? '' : 's'}.
  </p>
</div>

<div class="step-viz">
  {#each segments as seg, si (si)}
    <div class="segment">
      <p class="seg-head">
        <span class="label">Segment {si + 1}</span>
        <span class="seg-mode">{seg.mode}</span>
        <span class="seg-note">{MODE_TEXT[seg.mode]}</span>
      </p>
      <div class="chunks" role="list" aria-label="Bits of segment {si + 1}">
        {#each seg.chunks.slice(0, shown(si)) as c, ci (ci)}
          <div class="chunk {c.kind}" role="listitem">
            <span class="chars">
              {#if c.kind === 'mode'}mode{:else if c.kind === 'count'}count {c.value}{:else}{showChar(
                  c.chars ?? '',
                )}{/if}
            </span>
            {#if c.formula && c.kind === 'data'}<span class="formula">{c.formula}</span>{/if}
            <span class="bits mono">{c.bits}</span>
          </div>
        {/each}
        {#if seg.chunks.length > shown(si)}
          <button type="button" class="more" onclick={() => (expanded[si] = true)}>
            + {fmt(seg.chunks.length - shown(si))} more
          </button>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .segment + .segment {
    margin-top: 24px;
  }

  .seg-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    margin-bottom: 10px;
  }

  .seg-mode {
    font-weight: 600;
    text-transform: capitalize;
  }

  .seg-note {
    font-size: 13px;
    color: var(--ink-3);
  }

  .chunks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chunk {
    display: grid;
    align-content: start;
    gap: 2px;
    min-width: 64px;
    padding: 8px 10px;
    border: 1px solid var(--rule);
    background: var(--card);
  }

  .chunk.mode,
  .chunk.count {
    border-color: var(--ink);
    background: var(--paper);
  }

  .chars {
    font-size: 20px;
    font-weight: 500;
    line-height: 1.1;
    letter-spacing: -0.01em;
    white-space: pre;
  }

  .chunk.mode .chars,
  .chunk.count .chars {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1.6;
    color: var(--ink-2);
  }

  .formula {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-3);
  }

  .bits {
    font-size: 12px;
    letter-spacing: 0.04em;
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .more {
    min-height: 44px;
    padding: 0 14px;
    border: 1px dashed var(--ink-3);
    background: none;
    font-size: 13px;
  }
</style>
