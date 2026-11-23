import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/env.ts'],
    // Database tests can hit a remote Neon branch that wakes from sleep, plus bcrypt at cost 12.
    testTimeout: 30_000,
    globalSetup: ['./test/global-setup.ts'],
  },
});
