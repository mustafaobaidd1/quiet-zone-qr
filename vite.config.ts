import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

/** GitHub Pages serves this project from https://mustafaobaidd1.github.io/quiet-zone-qr/ */
export const REPO = 'quiet-zone-qr';

export default defineConfig({
  // Same base path in dev, preview and production, so path bugs show up locally.
  base: `/${REPO}/`,
  plugins: [svelte()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: { port: 5306, strictPort: true },
  preview: { port: 5406, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
