import { expect, test } from '@playwright/test';
import { createMaterial, dismissCookieNotice, expectAccessible, expectResult, PHOTO, reachPhotoStep, registerStudent } from './helpers';

// FR-06: setelah audit menemukan konsep yang terlewat, jadwal H+3 dan H+7 muncul di menu Ulang.
// Menandai selesai butuh jadwal yang sudah jatuh tempo; itu diuji di backend (tests/integration/spaced.test.ts).

test('an audit with blind spots schedules H+3 and H+7 reviews on the Ulang page', async ({ page }) => {
  await registerStudent(page.request, 'ulang');
  await createMaterial(page.request, 'Homeostasis Ulang');

  await page.goto('/belajar/ulang');
  await dismissCookieNotice(page);
  await expect(page.getByRole('heading', { name: 'Belum ada latihan ulang' })).toBeVisible();
  await expectAccessible(page, 'latihan ulang (kosong)');

  await page.goto('/belajar');
  await reachPhotoStep(page, 'Homeostasis Ulang', 70);
  await page.locator('input[type=file]:not([capture])').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Kirim dan cek catatan' }).click();
  await expectResult(page);

  await page.getByRole('link', { name: 'Ulang', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Latihan ulang' })).toBeVisible();
  await expect(page.getByText('Tidak ada yang jatuh tempo hari ini.')).toBeVisible();
  const upcoming = page.getByRole('region', { name: 'Berikutnya' });
  await expect(upcoming.getByText('H+3')).toBeVisible();
  await expect(upcoming.getByText('H+7')).toBeVisible();
  await expect(upcoming.getByText('Homeostasis Ulang')).toHaveCount(2);
  await expectAccessible(page, 'latihan ulang (berikutnya)');

  const api = await (await page.request.get('/api/v1/spaced/due')).json();
  expect(api.due).toEqual([]);
  expect(api.upcoming.map((s: { intervalDay: number }) => s.intervalDay)).toEqual([3, 7]);
});
