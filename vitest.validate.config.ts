import { defineConfig } from 'vitest/config';

/** `npm run validate`: the slow, large-sample checks whose numbers are quoted in the README. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['validate/**/*.validate.ts'],
    testTimeout: 600_000,
    reporters: ['verbose'],
  },
});
