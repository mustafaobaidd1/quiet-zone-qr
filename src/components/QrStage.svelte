<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tearFromPoint, type DamageOp } from '../lib/damage/damage';
  import { blockModules } from '../lib/damage/analysis';
  import { boundaryPath, insetSquares, polygonPoints } from '../lib/geometry';
  import { Role } from '../lib/qr/matrix';
  import { cellPath, darkPath, QUIET_ZONE } from '../lib/qr/render';
  import { probe } from '../lib/roles';
  import { app, BRUSH_RADIUS } from '../lib/state.svelte';

  const Q = QUIET_ZONE;

  const sym = $derived(app.symbol);
  const dmg = $derived(app.damage);
  const an = $derived(app.analysis);
  const size = $derived(sym?.size ?? 21);
  const total = $derived(size + 2 * Q);

  let svgEl: SVGSVGElement | undefined = $state();
  /** Pointer position in module units relative to the symbol's top-left corner. */
  let pointer = $state<{ x: number; y: number } | null>(null);
  let pointerType = $state<'mouse' | 'pen' | 'touch'>('mouse');
  let drawing = false;
  let stickerAnchor: { x: number; y: number } | null = null;
  /** Keyboard cursor (module index) while the stage has focus. */
  let cursor = $state<number | null>(null);
  let keyboardFocus = $state(false);

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- paths
  const regionSet = $derived(new Set<number>(app.regions));
  const dimming = $derived(regionSet.size > 0);

  const ink = $derived.by(() => {
    if (!sym || !dmg) return { strong: '', dim: '' };
    const { changed, modules } = dmg;
    const roles = sym.roles;
    if (!dimming) return { strong: darkPath(modules, size, Q, (i) => !changed[i]), dim: '' };
    return {
      strong: darkPath(modules, size, Q, (i) => !changed[i] && regionSet.has(roles[i])),
      dim: darkPath(modules, size, Q, (i) => !changed[i] && !regionSet.has(roles[i])),
    };
  });

  const addedInk = $derived(
    dmg ? darkPath(dmg.modules, size, Q, (i) => dmg.changed[i] === 1 && !dmg.sticker[i]) : '',
  );

  const missingInk = $derived.by(() => {
    if (!dmg) return '';
    const cells: number[] = [];
    for (let i = 0; i < dmg.modules.length; i++) {
      if (dmg.changed[i] && !dmg.modules[i] && !dmg.torn[i] && !dmg.sticker[i]) cells.push(i);
    }
    return insetSquares(size, cells, 0.17, Q);
  });

  const regionPaths = $derived.by(() => {
    if (!sym || !dimming) return [];
    return app.regions.map((role) => ({
      role,
      fill: cellPath(size, (i) => sym.roles[i] === role, Q),
      outline: boundaryPath(
        size,
        (function* () {
          for (let i = 0; i < sym.roles.length; i++) if (sym.roles[i] === role) yield i;
        })(),
        Q,
      ),
    }));
  });

  const probeInfo = $derived(sym && app.probeIndex !== null ? probe(sym, app.probeIndex) : null);

  /** Block to highlight: the probed module's block, else a hovered meter's block. */
  const highlightBlock = $derived(probeInfo?.block ?? app.focusBlock ?? null);

  const blockWash = $derived.by(() => {
    if (!sym || highlightBlock === null) return '';
    const cells = new Set(blockModules(sym, highlightBlock));
    return cellPath(size, (i) => cells.has(i), Q);
  });

  const codewordOutline = $derived.by(() => {
    if (!sym || !probeInfo || probeInfo.sequence === null) return '';
    const { path } = sym.geometry;
    const cells: number[] = [];
    for (let bit = 0; bit < 8; bit++) cells.push(path[probeInfo.sequence * 8 + bit]);
    return boundaryPath(size, cells, Q);
  });

  const failedWash = $derived.by(() => {
    // The probe or a hovered meter takes over the highlight while active.
    if (!an || an.failedBlockModules.length === 0 || highlightBlock !== null) return '';
    const set = new Set(an.failedBlockModules);
    return cellPath(size, (i) => set.has(i), Q);
  });

  const tears = $derived(dmg?.tears ?? []);
  const stickers = $derived(dmg?.stickers ?? []);

  // ---------------------------------------------------- corrected flashes
  type Flash = { id: number; d: string };
  let flashes = $state<Flash[]>([]);
  let previousCorrected = new Set<number>();
  let previousSymbol: unknown = null;
  let flashId = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const staticRepairs = $derived(
    reducedMotion && an ? insetSquares(size, an.correctedModules, 0.3, Q) : '',
  );

  $effect(() => {
    const current = an;
    if (!current || reducedMotion) return;
    const set = new Set(current.correctedModules);
    // Only modules repaired since the last decode flash; a new symbol (text or options changed)
    // resets the comparison instead of flashing everything again. The very first decode flashes
    // all repairs once, a moment after load, to show what the decoder put back.
    const fresh: number[] = [];
    const first = previousSymbol === null;
    if (first) {
      fresh.push(...set);
    } else if (previousSymbol === sym) {
      for (const i of set) if (!previousCorrected.has(i)) fresh.push(i);
    }
    previousCorrected = set;
    previousSymbol = sym;
    if (fresh.length === 0) return;
    const d = insetSquares(size, fresh, 0.06, Q);
    const show = () => {
      const id = ++flashId;
      flashes = [...flashes.slice(-6), { id, d }];
      const timer = setTimeout(() => {
        flashes = flashes.filter((fl) => fl.id !== id);
        timers.delete(timer);
      }, 1100);
      timers.add(timer);
    };
    if (first) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        show();
      }, 650);
      timers.add(timer);
    } else {
      show();
    }
  });

  onDestroy(() => timers.forEach(clearTimeout));

  // ------------------------------------------------------------ pointer
  function toModule(e: PointerEvent): { x: number; y: number } | null {
    if (!svgEl) return null;
    const rect = svgEl.getBoundingClientRect();
    if (rect.width === 0) return null;
    return {
      x: ((e.clientX - rect.left) / rect.width) * total - Q,
      y: ((e.clientY - rect.top) / rect.height) * total - Q,
    };
  }

  function indexAt(p: { x: number; y: number }): number | null {
    const c = Math.floor(p.x);
    const r = Math.floor(p.y);
    if (c < 0 || r < 0 || c >= size || r >= size) return null;
    return r * size + c;
  }

  function strokeOp(kind: 'scratch' | 'erase', x: number, y: number): DamageOp {
    return { kind, points: [x / size, y / size], radius: BRUSH_RADIUS[app.brush] / size };
  }

  function onPointerDown(e: PointerEvent) {
    if (!sym || e.button > 0) return;
    pointerType = (e.pointerType as typeof pointerType) || 'mouse';
    const p = toModule(e);
    if (!p) return;
    pointer = p;
    const idx = indexAt(p);
    cursor = null;
    switch (app.tool) {
      case 'inspect':
        app.probeIndex = idx;
        return;
      case 'scratch':
      case 'erase':
        drawing = true;
        svgEl?.setPointerCapture(e.pointerId);
        app.live = strokeOp(app.tool, p.x, p.y);
        e.preventDefault();
        return;
      case 'sticker':
        drawing = true;
        svgEl?.setPointerCapture(e.pointerId);
        stickerAnchor = p;
        app.live = { kind: 'sticker', x: p.x / size, y: p.y / size, w: 0, h: 0 };
        e.preventDefault();
        return;
      case 'tear': {
        const { corner, depth } = tearFromPoint(p.x / size, p.y / size);
        app.commit({ kind: 'tear', corner, depth, seed: Math.floor(Math.random() * 2 ** 31) });
        e.preventDefault();
        return;
      }
    }
  }

  function onPointerMove(e: PointerEvent) {
    const p = toModule(e);
    if (!p) return;
    pointer = p;
    pointerType = (e.pointerType as typeof pointerType) || 'mouse';
    if (!drawing) {
      if (e.pointerType === 'mouse' || app.tool === 'inspect') app.probeIndex = indexAt(p);
      return;
    }
    const live = app.live;
    if (!live) return;
    if (live.kind === 'scratch' || live.kind === 'erase') {
      const pts = live.points;
      const lx = pts[pts.length - 2] * size;
      const ly = pts[pts.length - 1] * size;
      if (Math.hypot(p.x - lx, p.y - ly) < 0.3) return;
      app.live = { ...live, points: [...pts, p.x / size, p.y / size] };
    } else if (live.kind === 'sticker' && stickerAnchor) {
      app.live = {
        kind: 'sticker',
        x: stickerAnchor.x / size,
        y: stickerAnchor.y / size,
        w: (p.x - stickerAnchor.x) / size,
        h: (p.y - stickerAnchor.y) / size,
      };
    }
  }

  function finishStroke() {
    if (!drawing) return;
    drawing = false;
    const live = app.live;
    if (!live) return;
    if (live.kind === 'sticker') {
      // A tap (or a tiny drag) places a default sticker about a quarter of the code wide.
      if (Math.abs(live.w) * size < 2 || Math.abs(live.h) * size < 2) {
        app.commit(defaultSticker(live.x, live.y));
      } else {
        app.commit(clampSticker(live));
      }
      stickerAnchor = null;
      return;
    }
    app.commit(live);
  }

  function defaultSticker(cx: number, cy: number): DamageOp {
    const w = 0.26;
    const h = 0.2;
    const x = Math.min(Math.max(cx - w / 2, 0), 1 - w);
    const y = Math.min(Math.max(cy - h / 2, 0), 1 - h);
    return { kind: 'sticker', x, y, w, h };
  }

  function clampSticker(op: Extract<DamageOp, { kind: 'sticker' }>): DamageOp {
    const x0 = Math.max(-0.05, Math.min(op.x, op.x + op.w));
    const y0 = Math.max(-0.05, Math.min(op.y, op.y + op.h));
    const x1 = Math.min(1.05, Math.max(op.x, op.x + op.w));
    const y1 = Math.min(1.05, Math.max(op.y, op.y + op.h));
    return { kind: 'sticker', x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function onPointerUp() {
    finishStroke();
  }

  function onPointerLeave(e: PointerEvent) {
    if (drawing) return;
    pointer = null;
    if (e.pointerType === 'mouse') app.probeIndex = null;
  }

  function onPointerCancel() {
    drawing = false;
    stickerAnchor = null;
    app.live = null;
  }

  // ----------------------------------------------------------- keyboard
  function onKeyDown(e: KeyboardEvent) {
    if (!sym) return;
    const step = e.shiftKey ? 5 : 1;
    const cur = cursor ?? Math.floor(size / 2) * size + Math.floor(size / 2);
    let r = Math.floor(cur / size);
    let c = cur % size;
    let handled = true;
    switch (e.key) {
      case 'ArrowUp':
        r = Math.max(0, r - step);
        break;
      case 'ArrowDown':
        r = Math.min(size - 1, r + step);
        break;
      case 'ArrowLeft':
        c = Math.max(0, c - step);
        break;
      case 'ArrowRight':
        c = Math.min(size - 1, c + step);
        break;
      case 'Home':
        c = 0;
        break;
      case 'End':
        c = size - 1;
        break;
      case 'Enter':
      case ' ':
        applyAtCursor(cur);
        break;
      case 'Escape':
        app.live = null;
        app.probeIndex = null;
        break;
      default:
        handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') {
      cursor = r * size + c;
      app.probeIndex = cursor;
    }
  }

  function applyAtCursor(index: number) {
    const r = Math.floor(index / size);
    const c = index % size;
    const x = (c + 0.5) / size;
    const y = (r + 0.5) / size;
    switch (app.tool) {
      case 'scratch':
      case 'erase':
        app.commit({ kind: app.tool, points: [x, y], radius: 0.45 / size });
        break;
      case 'sticker':
        app.commit(defaultSticker(x, y));
        break;
      case 'tear': {
        const { corner, depth } = tearFromPoint(x, y);
        app.commit({ kind: 'tear', corner, depth, seed: Math.floor(Math.random() * 2 ** 31) });
        break;
      }
      case 'inspect':
        app.probeIndex = index;
        break;
    }
  }

  function onFocus() {
    keyboardFocus = svgEl?.matches(':focus-visible') ?? false;
    if (keyboardFocus && cursor === null && sym) {
      cursor = Math.floor(size / 2) * size + Math.floor(size / 2);
      app.probeIndex = cursor;
    }
  }

  function onBlur() {
    keyboardFocus = false;
    if (cursor !== null && app.probeIndex === cursor) app.probeIndex = null;
    cursor = null;
  }

  // When the symbol size changes, keep the cursor inside it.
  $effect(() => {
    if (cursor !== null && cursor >= size * size) cursor = null;
  });

  const cursorRC = $derived(
    cursor === null ? null : { r: Math.floor(cursor / size), c: cursor % size },
  );

  const brushRadius = $derived(BRUSH_RADIUS[app.brush]);
  const showBrush = $derived(
    pointer !== null &&
      pointerType !== 'touch' &&
      (app.tool === 'scratch' || app.tool === 'erase') &&
      pointer.x > -Q &&
      pointer.y > -Q &&
      pointer.x < size + Q &&
      pointer.y < size + Q,
  );

  const tearPreview = $derived.by(() => {
    if (!pointer || app.tool !== 'tear' || pointerType === 'touch') return null;
    const { corner, depth } = tearFromPoint(pointer.x / size, pointer.y / size);
    // The straight line u + v = depth in corner coordinates, from paper edge to paper edge.
    const d = depth * size;
    const far = d + 2 * Q;
    const pts: Record<string, [number, number, number, number]> = {
      tl: [0, far, far, 0],
      tr: [total - far, 0, total, far],
      bl: [0, total - far, far, total],
      br: [total - far, total, total, total - far],
    };
    return pts[corner];
  });

  const cursorStyle = $derived(
    app.tool === 'inspect'
      ? 'crosshair'
      : app.tool === 'sticker'
        ? 'copy'
        : app.tool === 'tear'
          ? 'pointer'
          : 'none',
  );

  const label = $derived(
    sym
      ? `QR code, version ${sym.version}, ${sym.size} by ${sym.size} modules. ${an ? `${an.headline}. ${an.detail}` : ''} Use the arrow keys to move between modules and Enter to apply the selected tool.`
      : 'No QR code',
  );
</script>

<div class="stage" class:dimming>
  {#if sym && dmg}
    <!-- A custom widget: role="application" with its own keyboard model (arrows + Enter). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      bind:this={svgEl}
      viewBox="0 0 {total} {total}"
      role="application"
      aria-roledescription="QR code workbench"
      aria-label={label}
      aria-describedby="probe-readout"
      tabindex="0"
      style:cursor={cursorStyle}
      style:touch-action={app.tool === 'inspect' ? 'pan-y pinch-zoom' : 'none'}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerCancel}
      onpointerleave={onPointerLeave}
      onkeydown={onKeyDown}
      onfocus={onFocus}
      onblur={onBlur}
      data-testid="qr-svg"
      data-version={sym.version}
      data-changed={dmg.changedCount}
    >
      <defs>
        <mask
          id="paper-mask"
          maskUnits="userSpaceOnUse"
          x="-1"
          y="-1"
          width={total + 2}
          height={total + 2}
        >
          <rect x="-1" y="-1" width={total + 2} height={total + 2} fill="#fff" />
          {#each tears as t, i (i)}
            <polygon points={polygonPoints(t.polygon, size, Q)} fill="#000" />
          {/each}
        </mask>
        <clipPath id="paper-clip">
          <rect x="0" y="0" width={total} height={total} />
        </clipPath>
        <filter id="paper-shadow" x="-2%" y="-2%" width="104%" height="104%">
          <feDropShadow
            dx="0"
            dy="0.1"
            stdDeviation="0.14"
            flood-color="#000"
            flood-opacity="0.16"
          />
        </filter>
        <pattern
          id="hatch"
          width="0.5"
          height="0.5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="0.5" height="0.5" fill="var(--cobalt-wash)" />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="0.5"
            stroke="var(--cobalt)"
            stroke-width="0.12"
            opacity="0.55"
          />
        </pattern>
        <pattern
          id="erasure-hatch"
          width="0.6"
          height="0.6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <line x1="0" y1="0" x2="0" y2="0.6" stroke="var(--vermilion)" stroke-width="0.1" />
        </pattern>
      </defs>

      <!-- Paper (with the quiet zone); torn areas are cut out of it. -->
      <g filter="url(#paper-shadow)">
        <rect class="paper" x="0" y="0" width={total} height={total} mask="url(#paper-mask)" />
      </g>

      <!-- Symbol boundary hint inside the quiet zone -->
      <rect class="symbol-edge" x={Q} y={Q} width={size} height={size} mask="url(#paper-mask)" />

      {#each regionPaths as r (r.role)}
        <path
          class="region-fill"
          d={r.fill}
          fill={r.role === Role.Ec ? 'url(#hatch)' : 'var(--cobalt-wash)'}
        />
      {/each}

      {#if failedWash}
        <path class="failed-wash" d={failedWash} />
      {/if}

      {#if blockWash}
        <path class="block-wash" d={blockWash} />
      {/if}

      <g mask="url(#paper-mask)">
        <path class="ink" d={ink.strong} />
        {#if ink.dim}
          <path class="ink dim" d={ink.dim} />
        {/if}
        <path class="added" d={addedInk} />
        <path class="missing" d={missingInk} />
      </g>

      {#each regionPaths as r (r.role)}
        <path class="region-outline" d={r.outline} />
      {/each}

      {#if staticRepairs}
        <path class="repair-static" d={staticRepairs} />
      {/if}

      {#each flashes as f (f.id)}
        <path class="flash" d={f.d} />
      {/each}

      {#each stickers as s, i (i)}
        {@const x = s.x * size + Q}
        {@const y = s.y * size + Q}
        {@const w = s.w * size}
        {@const h = s.h * size}
        <g class="sticker" class:erasure={app.erasureMode}>
          <rect class="sticker-shadow" x={x + 0.25} y={y + 0.35} width={w} height={h} rx="0.9" />
          <rect class="sticker-body" {x} {y} width={w} height={h} rx="0.9" />
          {#if app.erasureMode}
            <rect
              x={x + 0.5}
              y={y + 0.5}
              width={Math.max(0, w - 1)}
              height={Math.max(0, h - 1)}
              rx="0.5"
              fill="url(#erasure-hatch)"
              opacity="0.5"
            />
          {/if}
          {#if w > 4 && h > 3}
            {@const r = Math.min(w, h) * 0.22}
            <g transform="translate({x + w / 2} {y + h / 2})">
              <circle {r} class="logo-disc" />
              <circle {r} cx={r * 0.45} cy={-r * 0.2} class="logo-cut" />
            </g>
          {/if}
        </g>
      {/each}

      <g clip-path="url(#paper-clip)">
        {#each tears as t, i (i)}
          <polyline class="tear-edge" points={polygonPoints(t.edge, size, Q)} />
        {/each}
      </g>

      {#if codewordOutline}
        <path class="codeword-outline" d={codewordOutline} />
      {/if}

      {#if keyboardFocus && cursorRC}
        <rect
          class="cursor"
          x={cursorRC.c + Q - 0.15}
          y={cursorRC.r + Q - 0.15}
          width="1.3"
          height="1.3"
        />
      {/if}

      {#if showBrush && pointer}
        <circle class="brush" cx={pointer.x + Q} cy={pointer.y + Q} r={brushRadius} />
      {/if}

      {#if tearPreview}
        <line
          class="tear-preview"
          x1={tearPreview[0]}
          y1={tearPreview[1]}
          x2={tearPreview[2]}
          y2={tearPreview[3]}
        />
      {/if}
    </svg>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    user-select: none;
    -webkit-user-select: none;
  }

  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
    shape-rendering: crispEdges;
    outline: none;
  }

  svg:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 4px;
  }

  .paper {
    fill: var(--card);
    stroke: none;
  }

  .symbol-edge {
    fill: none;
    stroke: var(--rule-soft);
    stroke-width: 0.06;
    stroke-dasharray: 0.3 0.3;
    shape-rendering: geometricPrecision;
  }

  .ink {
    fill: var(--ink);
  }

  .ink.dim {
    opacity: 0.16;
  }

  .added {
    fill: var(--vermilion);
  }

  .missing {
    fill: none;
    stroke: var(--vermilion);
    stroke-width: 0.13;
    shape-rendering: geometricPrecision;
  }

  .region-outline {
    fill: none;
    stroke: var(--cobalt);
    stroke-width: 0.12;
    stroke-linecap: square;
  }

  .block-wash {
    fill: var(--cobalt-wash);
  }

  .failed-wash {
    fill: rgb(255 59 31 / 0.16);
  }

  .codeword-outline {
    fill: none;
    stroke: var(--cobalt);
    stroke-width: 0.22;
    stroke-linecap: square;
  }

  .sticker-shadow {
    fill: rgb(0 0 0 / 0.12);
  }

  .sticker-body {
    fill: #fff;
    stroke: var(--ink);
    stroke-width: 0.08;
    shape-rendering: geometricPrecision;
  }

  .sticker.erasure .sticker-body {
    stroke: var(--vermilion);
    stroke-width: 0.14;
    stroke-dasharray: 0.5 0.3;
  }

  .logo-disc {
    fill: var(--ink);
    shape-rendering: geometricPrecision;
  }

  .logo-cut {
    fill: #fff;
    shape-rendering: geometricPrecision;
  }

  .tear-edge {
    fill: none;
    stroke: #b9b9b0;
    stroke-width: 0.09;
    stroke-linejoin: round;
    shape-rendering: geometricPrecision;
  }

  .flash {
    fill: var(--cobalt);
    animation: flash 1.05s var(--ease) forwards;
  }

  @keyframes flash {
    0% {
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    55% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  .repair-static {
    fill: var(--cobalt);
  }

  .cursor {
    fill: none;
    stroke: var(--cobalt);
    stroke-width: 0.18;
    shape-rendering: geometricPrecision;
  }

  .brush {
    fill: rgb(255 59 31 / 0.08);
    stroke: var(--ink);
    stroke-width: 0.07;
    stroke-dasharray: 0.25 0.18;
    pointer-events: none;
    shape-rendering: geometricPrecision;
  }

  .tear-preview {
    stroke: var(--vermilion);
    stroke-width: 0.12;
    stroke-dasharray: 0.5 0.35;
    pointer-events: none;
    shape-rendering: geometricPrecision;
  }

  .region-fill {
    pointer-events: none;
  }
</style>
