<script lang="ts">
  export type IconName =
    | 'inspect'
    | 'scratch'
    | 'erase'
    | 'sticker'
    | 'tear'
    | 'noise'
    | 'undo'
    | 'redo'
    | 'clear'
    | 'download'
    | 'check'
    | 'cross'
    | 'arrow-left'
    | 'arrow-right'
    | 'play'
    | 'pause'
    | 'external';

  let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="square"
  stroke-linejoin="miter"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'inspect'}
    <rect x="4.5" y="4.5" width="15" height="15" />
    <rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" stroke="none" />
    <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
  {:else if name === 'scratch'}
    <path d="M3 17l4-6 3 5 4-8 3 6 4-7" />
  {:else if name === 'erase'}
    <path d="M14.5 4.5l5 5-9 9h-5l-2.5-2.5z" />
    <path d="M10 9l5 5" />
    <path d="M11 20.5h10" />
  {:else if name === 'sticker'}
    <path d="M4 4h16v10l-6 6H4z" />
    <path d="M14 20v-6h6" />
  {:else if name === 'tear'}
    <path d="M4 4h16v7l-2 1.5 1 2-2.5 1 .5 2.5-2.5-.5-1 2.5-2-1L10 20H4z" />
  {:else if name === 'noise'}
    <g fill="currentColor" stroke="none">
      <rect x="4" y="4" width="3" height="3" />
      <rect x="11" y="6" width="3" height="3" />
      <rect x="17" y="3" width="3" height="3" />
      <rect x="6" y="11" width="3" height="3" />
      <rect x="15" y="12" width="3" height="3" />
      <rect x="3" y="17" width="3" height="3" />
      <rect x="10" y="17" width="3" height="3" />
      <rect x="18" y="18" width="3" height="3" />
    </g>
  {:else if name === 'undo'}
    <path d="M9 5L4 10l5 5" />
    <path d="M4.5 10H14a6 6 0 0 1 0 12h-3" />
  {:else if name === 'redo'}
    <path d="M15 5l5 5-5 5" />
    <path d="M19.5 10H10a6 6 0 0 0 0 12h3" />
  {:else if name === 'clear'}
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 3.5V8h4.5" />
  {:else if name === 'download'}
    <path d="M12 3.5v12M7 11l5 5 5-5" />
    <path d="M4 20.5h16" />
  {:else if name === 'check'}
    <path d="M4.5 12.5l5 5 10-11" />
  {:else if name === 'cross'}
    <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />
  {:else if name === 'arrow-left'}
    <path d="M10 5l-7 7 7 7M3.5 12h17" />
  {:else if name === 'arrow-right'}
    <path d="M14 5l7 7-7 7M20.5 12h-17" />
  {:else if name === 'play'}
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
  {:else if name === 'pause'}
    <path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor" stroke="none" />
  {:else if name === 'external'}
    <path d="M10 4.5H4.5v15h15V14" />
    <path d="M13.5 3.5h7v7M20 4l-9 9" />
  {/if}
</svg>
