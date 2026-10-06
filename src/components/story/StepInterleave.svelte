<script lang="ts">
  import { onDestroy } from 'svelte';
  import PlayerControls from './PlayerControls.svelte';
  import type { QrSymbol } from '../../lib/qr/encoder';
  import { Player, prefersReducedMotion } from '../../lib/player.svelte';
  import { hex } from '../../lib/format';

  let { symbol, visible }: { symbol: QrSymbol; visible: boolean } = $props();

  const SHADES = ['#111111', '#6d6d66', '#a7a79e', '#d3d3ca'];
  const MAX_ROWS = 8;

  const layout = $derived(symbol.layout);
  const rowLen = $derived(Math.max(...layout.dataPerBlock) + layout.ecCodewordsPerBlock);
  const shownBlocks = $derived(Math.min(MAX_ROWS, layout.numBlocks));
  const total = $derived(symbol.codewords.length);
  const seqRows = $derived(Math.ceil(total / rowLen));

  // Position of each sequence entry inside its block row (EC codewords are right-aligned so the
  // shorter blocks' gap sits between data and EC, as in the standard's figures).
  const cellX = (block: number, indexInBlock: number) => {
    const dataLen = layout.dataPerBlock[block];
    return indexInBlock < dataLen
      ? indexInBlock
      : rowLen - layout.ecCodewordsPerBlock + (indexInBlock - dataLen);
  };

  const player = new Player(1, 20);
  let autoplay = $state(false);

  $effect(() => {
    player.reset(total, Math.max(12, total / 6));
    if (prefersReducedMotion()) player.finish();
    else autoplay = true;
  });

  $effect(() => {
    if (visible && autoplay) {
      autoplay = false;
      player.play();
    }
    if (!visible) player.stop();
  });

  onDestroy(() => player.stop());

  const shown = $derived(Math.floor(player.progress));
  const cur = $derived(Math.min(shown, total - 1));
  const curInfo = $derived(symbol.codewordInfo[cur]);

  const CELL = 10;
  const GAP = 2;
  const W = $derived(rowLen * (CELL + GAP));
  const rowsH = $derived(shownBlocks * (CELL + 6));
  const seqTop = $derived(rowsH + 34);
  const H = $derived(seqTop + seqRows * (CELL + GAP) + 4);

  const taken = $derived.by(() => {
    const set = new Set<string>();
    for (let i = 0; i < shown; i++) {
      const c = symbol.codewordInfo[i];
      set.add(`${c.block}:${c.indexInBlock}`);
    }
    return set;
  });

  const valueOf = (seq: number) => symbol.codewords[seq];
</script>

<div class="step-text">
  <p>
    Version {symbol.version}-{symbol.level} splits its codewords into
    <strong>{layout.numBlocks} block{layout.numBlocks === 1 ? '' : 's'}</strong>, each with its own
    Reed–Solomon check symbols{layout.group2.blocks
      ? ' (the later blocks hold one extra data codeword)'
      : ''}.
  </p>
  <p>
    The blocks are then <strong>interleaved</strong>: the first data codeword of every block, then
    the second of every block, and so on, followed by the EC codewords in the same column order.
  </p>
  <p>
    Neighbouring codewords in the symbol therefore belong to different blocks, so one scratch or one
    torn corner costs every block a little instead of one block a lot.
  </p>
</div>

<div class="step-viz">
  {#if layout.numBlocks === 1}
    <p class="single">
      With a single block there is nothing to interleave: data codewords, then EC codewords, in
      order.
    </p>
  {/if}
  <PlayerControls
    {player}
    label="interleaving"
    unit="codeword"
    valueText="codeword {shown} of {total}"
  />
  <div class="now mono" aria-live="off">
    {#if shown > 0 && curInfo}
      <span>#{cur + 1}</span>
      <span>block {curInfo.block + 1}</span>
      <span
        >{curInfo.isEc
          ? `EC ${curInfo.indexInBlock - layout.dataPerBlock[curInfo.block] + 1}`
          : `data ${curInfo.indexInBlock + 1}`}</span
      >
      <span>0x{hex(valueOf(cur))}</span>
    {:else}
      <span>Press play to deal the codewords out</span>
    {/if}
  </div>
  <div class="svg-wrap">
    <svg
      viewBox="-34 -4 {W + 38} {H + 8}"
      role="img"
      aria-label="Blocks of codewords (rows) and the interleaved sequence (below)"
    >
      {#each Array.from({ length: shownBlocks }, (_, b) => b) as b (b)}
        {@const y = b * (CELL + 6)}
        <text x="-6" y={y + CELL - 1} class="row-label" text-anchor="end">B{b + 1}</text>
        {#each Array.from({ length: layout.dataPerBlock[b] + layout.ecCodewordsPerBlock }, (_, i) => i) as i (i)}
          {@const isEc = i >= layout.dataPerBlock[b]}
          {@const used = taken.has(`${b}:${i}`)}
          <rect
            x={cellX(b, i) * (CELL + GAP)}
            {y}
            width={CELL}
            height={CELL}
            fill={isEc ? 'url(#ec-hatch)' : SHADES[b % SHADES.length]}
            stroke={isEc ? SHADES[b % SHADES.length] : 'none'}
            stroke-width={isEc ? 1 : 0}
            class:current={shown > 0 &&
              curInfo &&
              curInfo.block === b &&
              curInfo.indexInBlock === i}
            class:gone={used}
          />
        {/each}
      {/each}
      {#if layout.numBlocks > shownBlocks}
        <text x="0" y={rowsH + 12} class="more-label"
          >+ {layout.numBlocks - shownBlocks} more blocks</text
        >
      {/if}
      {#if shown > 0 && !player.done && curInfo && curInfo.block < shownBlocks}
        <line
          class="deal"
          x1={cellX(curInfo.block, curInfo.indexInBlock) * (CELL + GAP) + CELL / 2}
          y1={curInfo.block * (CELL + 6) + CELL}
          x2={(cur % rowLen) * (CELL + GAP) + CELL / 2}
          y2={seqTop + Math.floor(cur / rowLen) * (CELL + GAP)}
        />
      {/if}
      <text x="-6" y={seqTop - 10} class="row-label" text-anchor="end">→</text>
      <text x="0" y={seqTop - 10} class="seq-label">placement order</text>
      {#each Array.from({ length: shown }, (_, k) => k) as k (k)}
        {@const c = symbol.codewordInfo[k]}
        <rect
          x={(k % rowLen) * (CELL + GAP)}
          y={seqTop + Math.floor(k / rowLen) * (CELL + GAP)}
          width={CELL}
          height={CELL}
          fill={c.isEc ? 'url(#ec-hatch)' : SHADES[c.block % SHADES.length]}
          stroke={c.isEc ? SHADES[c.block % SHADES.length] : 'none'}
          class:current={k === cur && !player.done}
        />
      {/each}
      <defs>
        <pattern
          id="ec-hatch"
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="3" height="3" fill="#fff" />
          <line x1="0" y1="0" x2="0" y2="3" stroke="#111" stroke-width="1.2" />
        </pattern>
      </defs>
    </svg>
  </div>
  <ul class="legend">
    {#each Array.from({ length: Math.min(4, layout.numBlocks) }, (_, b) => b) as b (b)}
      <li>
        <span class="sw" style:background={SHADES[b]} aria-hidden="true"></span>block {b +
          1}{layout.numBlocks > 4 && b === 3 ? ' (shades repeat)' : ''}
      </li>
    {/each}
    <li><span class="sw hatch" aria-hidden="true"></span>EC codeword</li>
  </ul>
</div>

<style>
  .single {
    margin-bottom: 12px;
    color: var(--ink-2);
  }

  .now {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    min-height: 22px;
    margin: 12px 0 8px;
    font-size: 13px;
  }

  .svg-wrap {
    overflow-x: auto;
  }

  svg {
    width: 100%;
    height: auto;
    min-width: 320px;
    shape-rendering: crispEdges;
  }

  rect.current {
    stroke: var(--cobalt);
    stroke-width: 2.5;
    paint-order: stroke;
  }

  rect.gone {
    opacity: 0.18;
  }

  .deal {
    stroke: var(--cobalt);
    stroke-width: 1.2;
    pointer-events: none;
  }

  .row-label,
  .seq-label,
  .more-label {
    font-family: var(--font-mono);
    font-size: 9px;
    fill: var(--ink-3);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
    font-size: 13px;
    color: var(--ink-2);
  }

  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .sw {
    width: 12px;
    height: 12px;
  }

  .sw.hatch {
    border: 1px solid var(--ink);
    background: repeating-linear-gradient(45deg, var(--ink) 0 1px, #fff 1px 3px);
  }
</style>
