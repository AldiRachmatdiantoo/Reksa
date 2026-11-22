import { expect, test } from '@playwright/test';
import { createMaterial, dismissCookieNotice, expectAccessible, expectResult, PHOTO, reachPhotoStep, registerStudent } from './helpers';

// FR-05: hasil cek tersimpan di Riwayat dan bisa dibuka lagi. Tren kalibrasi Pro (FR-11) diuji di
// backend (tests/integration/history.test.ts) karena akun E2E selalu Free.

test('a checked note shows up in Riwayat and opens the old result', async ({ page }) => {
  await registerStudent(page.request, 'riwayat');
  await createMaterial(page.request, 'Fotosintesis Riwayat');

  await page.goto('/belajar/riwayat');
  await dismissCookieNotice(page);
  await expect(page.getByRole('heading', { name: 'Belum ada catatan yang dicek' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lihat paket Pro' })).toBeVisible();
  await expectAccessible(page, 'riwayat (kosong)');

  await page.goto('/belajar');
  await reachPhotoStep(page, 'Fotosintesis Riwayat', 65);
  await page.locator('input[type=file]:not([capture])').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Kirim dan cek catatan' }).click();
  await expectResult(page);

  await page.getByRole('link', { name: 'Riwayat', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Riwayat' })).toBeVisible();
  const row = page.getByRole('link', { name: /Fotosintesis Riwayat/ });
  await expect(row).toContainText('tebakan 65%');
  await expectAccessible(page, 'riwayat (berisi)');

  await row.click();
  await expect(page).toHaveURL(/\/belajar\/riwayat\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Fotosintesis Riwayat')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kembali ke riwayat' })).toBeVisible();
  await expectAccessible(page, 'hasil cek lama');

  await page.goto('/belajar/riwayat/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Hasil cek ini tidak ditemukan' })).toBeVisible();
});
