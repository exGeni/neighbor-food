import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/*.test.ts'],
    // Dates and daylight saving are judged in the building's own time zone.
    env: { TZ: 'Europe/Warsaw' },
  },
});
