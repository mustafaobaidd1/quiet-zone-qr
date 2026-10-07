<script lang="ts">
  import { onDestroy } from 'svelte';
  import PlayerControls from './PlayerControls.svelte';
  import type { QrSymbol } from '../../lib/qr/encoder';
  import { boundaryPath } from '../../lib/geometry';
  import { cellPath, darkPath } from '../../lib/qr/render';
  import { Player, prefersReducedMotion } from '../../lib/player.svelte';
  import { hex } from '../../lib/format';

  let { symbol, visible }: { symbol: QrSymbol; visible: boolean } = $props();

  const size = $derived(symbol.size);
  const path = $derived(symbol.geometry.path);
  const totalBits = $derived(path.length);

  /** Order in which each module is filled (−1 for function modules). */
  const orderOf = $derived.by(() => {
    const o = new Int32Array(size * size).fill(-1);
    path.forEach((m, k) => (o[m] = k));
    return o;
  });

  const functionDark = $derived(
    darkPath(symbol.geometry.functionValues, size, 0, (i) => symbol.geometry.isFunction[i] === 1),
  );
  const functionArea = $derived(cellPath(size, (i) => symbol.geometry.isFunction[i] === 1));

  /** The zig-zag as one polyline through module centres, with cumulative lengths for dashing. */
  const route = $derived.by(() => {
    let d = '';
    const cum = new Float64Array(path.length);
    let len = 0;
    let px = 0;
    let py = 0;
    path.forEach((m, k) => {
      const x = (m % size) + 0.5;
      const y = Math.floor(m / size) + 0.5;
      if (k > 0) len += Math.hypot(x - px, y - py);
      cum[k] = len;
      d += `${k === 0 ? 'M' : 'L'}${x} ${y}`;
      px = x;
      py = y;
    });
    return { d, cum, len };
  });

  const player = new Player(1, 60);
  let autoplay = $state(false);

  $effect(() => {
    player.reset(totalBits, Math.max(60, totalBits / 9));
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
  const placedDark = $derived(
    darkPath(symbol.unmasked, size, 0, (i) => orderOf[i] >= 0 && orderOf[i] < shown),
  );
  const placedArea = $derived(cellPath(size, (i) => orderOf[i] >= 0 && orderOf[i] < shown));
  const dash = $derived(route.len - (shown > 0 ? route.cum[Math.min(shown, path.length) - 1] : 0));

  const current = $derived(Math.min(Math.max(shown - 1, 0), totalBits - 1));
  const cwIndex = $derived(current >> 3);
  const isRemainder = $derived(current >= symbol.codewords.length * 8);
  const outline = $derived.by(() => {
    if (shown === 0 || isRemainder) return '';
    const cells: number[] = [];
    for (let b = 0; b < 8; b++) cells.push(path[cwIndex * 8 + b]);
    return boundaryPath(size, cells);
  });
  const info = $derived(symbol.codewordInfo[cwIndex]);
</script>

<div class="step-text">
  <p>
    The interleaved bit stream is laid into the symbol along a fixed path. It starts at the
    <strong>bottom-right corner</strong> and climbs a two-module-wide column in a zig-zag, right then
    left, then turns and comes back down the next column.
  </p>
  <p>
    Function patterns, format and version areas are skipped, and so is the whole of column 6 (the
    vertical timing pattern). Each codeword fills an 8-module patch, usually 2 wide and 4 tall.
  </p>
  <p>
    Version {symbol.version} has {path.length} module slots for {symbol.codewords.length * 8} bits; the
    last {path.length - symbol.codewords.length * 8} are remainder bits set to 0.
  </p>
</div>

<div class="step-viz">
  <PlayerControls
    {player}
    label="zig-zag placement"
    unit="bit"
    valueText="bit {shown} of {totalBits}"
  />
  <p class="now mono">
    {#if shown === 0}
      Press play to place the bits
    {:else if isRemainder}
      remainder bits
    {:else if info}
      codeword #{cwIndex + 1} · block {info.block + 1} · {info.isEc ? 'EC' : 'data'} · 0x{hex(
        symbol.codewords[cwIndex],
      )} · bit {7 - (current & 7)}
    {/if}
  </p>
  <div class="grid-wrap">
    <svg
      viewBox="-1 -1 {size + 2} {size + 2}"
      role="img"
      aria-label="Placement of {totalBits} bits along the zig-zag path; {shown} placed so far"
    >
      <rect x="0" y="0" width={size} height={size} class="field" />
      <path d={functionArea} class="fn-area" />
      <path d={functionDark} class="fn-dark" />
      <path d={placedArea} class="placed-area" />
      <path d={placedDark} class="placed-dark" />
      <path
        d={route.d}
        class="route"
        style:stroke-dasharray="{route.len}
        {route.len}"
        style:stroke-dashoffset={dash}
      />
      {#if outline}
        <path d={outline} class="cw" />
      {/if}
    </svg>
  </div>
  <ul class="legend">
    <li><span class="sw fn" aria-hidden="true"></span>function patterns and reserved areas</li>
    <li><span class="sw route" aria-hidden="true"></span>placement path</li>
    <li><span class="sw cw" aria-hidden="true"></span>current codeword</li>
  </ul>
</div>

<style>
  .now {
    min-height: 22px;
    margin: 12px 0 8px;
    font-size: 13px;
  }

  .grid-wrap {
    max-width: 560px;
  }

  svg {
    width: 100%;
    height: auto;
    shape-rendering: crispEdges;
  }

  .field {
    fill: #f1f1ec;
  }

  .fn-area {
    fill: #ffffff;
  }

  .fn-dark {
    fill: #c4c4bb;
  }

  .placed-area {
    fill: #ffffff;
  }

  .placed-dark {
    fill: var(--ink);
  }

  .route {
    fill: none;
    stroke: var(--cobalt);
    stroke-width: 0.09;
    stroke-linejoin: round;
    shape-rendering: geometricPrecision;
    opacity: 0.75;
  }

  .cw {
    fill: none;
    stroke: var(--cobalt);
    stroke-width: 0.24;
    stroke-linecap: square;
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
    width: 14px;
    height: 14px;
  }

  .sw.fn {
    background: #c4c4bb;
  }

  .sw.route {
    height: 2px;
    background: var(--cobalt);
  }

  .sw.cw {
    border: 2px solid var(--cobalt);
  }
</style>
