import { defineConfig, devices } from '@playwright/test';

/**
 * E2E + aksesibilitas (PRD §11.1) terhadap stack lengkap: nginx + backend + worker + Postgres + Redis + S3.
 * Jalankan stack dulu (lihat tests/e2e/README.md), lalu `npm run test:e2e`.
 * Backend memakai MockAiProvider (AI_PROVIDER_MODE=mock), jadi hasil cek deterministik.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // Satu worker: rate limit registrasi per IP dan satu sesi aktif per akun.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
    // Service worker (F2) hanya dinyalakan di offline.spec.ts, supaya page.route dan cache tidak memengaruhi spec lain.
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
