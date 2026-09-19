import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Testy uderzają w prawdziwą bazę (lokalna Supabase w Dockerze),
    // więc nie zrównoleglamy plików — każdy test i tak działa w transakcji.
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});