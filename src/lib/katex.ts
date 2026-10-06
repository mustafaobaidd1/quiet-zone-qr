/**
 * Lazy KaTeX: equations are typeset only when they come near the viewport, so the library and its
 * fonts stay out of the initial bundle. Until then (or if loading fails) the element keeps its
 * plain-text fallback.
 */

type Katex = typeof import('katex').default;

let loading: Promise<Katex> | null = null;

export function loadKatex(): Promise<Katex> {
  if (!loading) {
    loading = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
      ([mod]) => mod.default,
    );
  }
  return loading;
}

/** Svelte action: <span use:tex={'a^2'}>fallback</span>; data-display="true" for block maths. */
export function tex(node: HTMLElement, source: string) {
  let current = source;
  let seen = false;

  const render = () => {
    loadKatex()
      .then((katex) => {
        katex.render(current, node, {
          throwOnError: false,
          displayMode: node.dataset.display === 'true',
          output: 'htmlAndMathml',
        });
        node.dataset.typeset = 'true';
      })
      .catch(() => {
        /* keep the plain-text fallback */
      });
  };

  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'undefined') {
    seen = true;
    render();
  } else {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          seen = true;
          observer?.disconnect();
          observer = null;
          render();
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(node);
  }

  return {
    update(next: string) {
      current = next;
      if (seen) render();
    },
    destroy() {
      observer?.disconnect();
    },
  };
}
