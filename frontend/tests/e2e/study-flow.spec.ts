import { devices, expect, test } from '@playwright/test';
import { createMaterial, dismissCookieNotice, expectAccessible, expectResult, PHOTO, reachPhotoStep, registerStudent } from './helpers';

// Alur pelajar lengkap terhadap backend asli (PRD §11.1 E2E):
// materi → fokus → tebak nilai → foto → hasil cek, plus QR bridge laptop ↔ HP dan pemulihan sesi.

test('golden path: focus, JOL, photo upload, and the real audit result', async ({ page }) => {
  await registerStudent(page.request, 'utama');
  await createMaterial(page.request, 'Homeostasis E2E');

  await page.goto('/belajar');
  await expectAccessible(page, 'ruang belajar (pilih materi)');

  await reachPhotoStep(page, 'Homeostasis E2E', 70);
  await expect(page.getByText('Sisa 3 dari 3 cek hari ini.')).toBeVisible();
  await expectAccessible(page, 'tebak & foto');

  await page.locator('input[type=file]:not([capture])').setInputFiles(PHOTO);
  await expect(page.getByRole('img', { name: /Pratinjau foto catatan/ })).toBeVisible();
  await page.getByRole('button', { name: 'Kirim dan cek catatan' }).click();

  await expectResult(page);
  await expect(page.getByRole('img', { name: /Foto catatan yang dicek/ })).toBeVisible();
  await expectAccessible(page, 'hasil cek');

  // Server: sesi selesai, kuota terpotong satu.
  expect((await (await page.request.get('/api/v1/sessions/active')).json()).session).toBeNull();
  expect((await (await page.request.get('/api/v1/me/quota')).json()).quota.used).toBe(1);

  // Hasil tetap bisa dibuka lagi setelah muat ulang.
  await page.reload();
  await expectResult(page);
});

test('QR bridge: the phone uploads without login and the laptop moves on by itself', async ({ page, browser }) => {
  await registerStudent(page.request, 'qr');
  await createMaterial(page.request, 'Homeostasis QR');
  await reachPhotoStep(page, 'Homeostasis QR', 40);

  const issued = page.waitForResponse((r) => r.url().endsWith('/qr-bridge') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Pakai kamera HP' }).click();
  const { qrToken } = (await (await issued).json()) as { qrToken: string };
  await expect(page.getByRole('img', { name: /Kode QR/ })).toBeVisible();
  await expectAccessible(page, 'panel QR laptop');

  // HP: konteks terpisah tanpa cookie login.
  const phoneContext = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await phoneContext.newPage();
  await phone.goto(`/unggah#${qrToken}`);
  await expect(phone).toHaveURL(/\/unggah$/); // token dihapus dari address bar
  await expect(phone.getByRole('heading', { name: 'Foto catatan kertasmu' })).toBeVisible();
  await expectAccessible(phone, 'halaman unggah HP');
  await phone.locator('input[type=file]:not([capture])').setInputFiles(PHOTO);
  await expect(phone.getByRole('heading', { name: 'Foto terkirim' })).toBeVisible();

  // Laptop pindah sendiri lewat SSE.
  await expectResult(page);

  // Token sekali pakai.
  const again = await phoneContext.newPage();
  await again.goto(`/unggah#${qrToken}`);
  await again.locator('input[type=file]:not([capture])').setInputFiles(PHOTO);
  await expect(again.getByRole('alert')).toContainText('Kode QR sudah tidak berlaku');
  await phoneContext.close();
});

test('a running session survives a reload and is restored in a new tab; "Ulangi" cancels it on the server', async ({ page, context }) => {
  await registerStudent(page.request, 'pulih');
  await createMaterial(page.request, 'Homeostasis Pulih');

  await page.goto('/belajar');
  await dismissCookieNotice(page);
  await page.getByRole('button', { name: /Homeostasis Pulih/ }).click();
  await page.getByRole('button', { name: 'Mulai waktu fokus' }).click();
  await expect(page.getByRole('heading', { name: 'Bacaan ditutup sementara' })).toBeVisible();
  await expectAccessible(page, 'waktu fokus berjalan');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bacaan ditutup sementara' })).toBeVisible();

  // Tab baru tanpa cache sessionStorage: sesi dipulihkan dari GET /sessions/active.
  const tab = await context.newPage();
  await tab.goto('/belajar');
  await expect(tab.getByRole('heading', { name: 'Bacaan ditutup sementara' })).toBeVisible();
  await tab.close();

  await page.getByRole('button', { name: 'Ulangi dan buka bacaan' }).click();
  await page.getByRole('button', { name: 'Ya, ulangi' }).click();
  await expect(page.getByRole('heading', { name: 'Homeostasis Pulih' })).toBeVisible();
  expect((await (await page.request.get('/api/v1/sessions/active')).json()).session).toBeNull();
});
