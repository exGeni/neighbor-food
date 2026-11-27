// Needs the emulators: run through `npm run test:rules`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/rules/*.test.ts'],
    env: { TZ: 'Europe/Warsaw' },
    // One emulator database is shared and cleared between tests.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
