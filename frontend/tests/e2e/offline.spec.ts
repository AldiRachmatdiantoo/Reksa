import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createMaterial, dismissCookieNotice, expectAccessible, expectResult, PHOTO, registerStudent } from './helpers';

/** Banyaknya kiriman di antrean IndexedDB (shared/offline/outbox.ts). */
function queuedItems(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('reksa-offline', 1);
        open.onsuccess = () => {
          const count = open.result.transaction('outbox').objectStore('outbox').count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
}

// F2 (offline-first): koneksi putus di tengah sesi. Timer jalan terus, tebakan dan foto disimpan di IndexedDB,
// halaman tetap terbuka lewat service worker walau dimuat ulang, lalu semuanya terkirim sendiri saat online.
// Service worker diblokir di spec lain (playwright.config.ts), jadi dinyalakan di sini.
test.use({ serviceWorkers: 'allow' });

test('the guess and the photo wait on the device while offline, survive a reload, and go out once the connection is back', async ({
  page,
  context,
}) => {
  await registerStudent(page.request, 'offline');
  await createMaterial(page.request, 'Offline E2E');

  await page.goto('/belajar');
  await dismissCookieNotice(page);
  // File aplikasi baru tersedia offline setelah service worker aktif.
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated');

  await page.getByRole('button', { name: /Offline E2E/ }).click();
  await page.getByText('15 mnt').click();
  await page.getByRole('button', { name: 'Mulai waktu fokus' }).click();
  await expect(page.getByRole('heading', { name: 'Bacaan ditutup sementara' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText(/Kamu sedang offline/)).toBeVisible();

  // Halaman foto belum pernah dibuka: berkasnya datang dari cache service worker.
  await page.getByRole('button', { name: 'Selesai, lanjut tebak nilai' }).click();
  await expect(page).toHaveURL(/\/belajar\/foto$/);
  await page.getByLabel(/Tebakan nilaimu/).fill('60');
  await page.getByRole('button', { name: 'Simpan tebakan' }).click();
  await expect(page.getByText(/Tebakan 60% disimpan di perangkat ini/)).toBeVisible();

  await page.locator('input[type=file]:not([capture])').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Simpan dan kirim nanti' }).click();
  await expect(page.getByText(/Foto tersimpan di perangkat ini/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menunggu koneksi...' })).toBeDisabled();
  await expectAccessible(page, 'tebak & foto saat offline');

  expect(await queuedItems(page)).toBe(2);

  // Dimuat ulang tanpa koneksi: aplikasi tetap terbuka dari cache, bukan halaman error browser.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Server REKSA belum bisa dihubungi' })).toBeVisible();
  await expect(page.getByText(/tetap aman dan dikirim setelah terhubung lagi/)).toBeVisible();

  // Online lagi: sesi diperiksa ulang sendiri, antrean dari IndexedDB terkirim (tebakan dulu, lalu foto), hasil tampil.
  await context.setOffline(false);
  await expectResult(page);

  expect(await queuedItems(page)).toBe(0);
  const submissionId = await page.evaluate(() => JSON.parse(sessionStorage.getItem('reksa-study-session') ?? '{}').submissionId as string);
  const scan = (await (await page.request.get(`/api/v1/scans/${submissionId}`)).json()).scan;
  expect(scan.predictedJolScore).toBe(60);
  expect((await (await page.request.get('/api/v1/sessions/active')).json()).session).toBeNull();
  expect((await (await page.request.get('/api/v1/me/quota')).json()).quota.used).toBe(1);
});

test('starting a focus session needs a connection, and the page says so', async ({ page, context }) => {
  await registerStudent(page.request, 'offline-mulai');
  await createMaterial(page.request, 'Offline Mulai');
  await page.goto('/belajar');
  await dismissCookieNotice(page);
  await page.getByRole('button', { name: /Offline Mulai/ }).click();

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Mulai waktu fokus' })).toBeDisabled();
  await expect(page.getByText(/Mulai sesi butuh koneksi/)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Mulai waktu fokus' })).toBeEnabled();
});
