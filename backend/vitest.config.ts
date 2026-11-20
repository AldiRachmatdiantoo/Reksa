import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/generated/**'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        // Butuh Docker: PostgreSQL & Redis asli lewat Testcontainers.
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts', 'tests/security/**/*.test.ts'],
          globalSetup: ['tests/support/globalSetup.ts'],
          // Satu database dipakai bersama; file dijalankan berurutan agar tidak saling ganggu.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
