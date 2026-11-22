import { expect, test } from '@playwright/test';
import { createMaterial, dismissCookieNotice, expectAccessible, expectResult, PHOTO, registerStudent } from './helpers';

// F3 (interleaving): dua materi dicampur dalam satu sesi. Kedua bacaan tampil lalu ditutup bersama,
// dan hasil cek menyebut keduanya.
test('a student mixes two materials into one focus session and gets one result for both', async ({ page }) => {
  await registerStudent(page.request, 'interleave');
  await createMaterial(page.request, 'Homeostasis E2E');
  const second = await page.request.post('/api/v1/materials', {
    data: { title: 'Fotosintesis E2E', content: 'Fotosintesis mengubah cahaya menjadi energi kimia di klorofil daun.' },
  });
  expect(second.status()).toBe(201);

  await page.goto('/belajar');
  await dismissCookieNotice(page);
  await page.getByRole('button', { name: /Homeostasis E2E/ }).click();

  await expect(page.getByRole('heading', { name: 'Campur dengan materi lain' })).toBeVisible();
  await page.getByLabel('Materi kedua').selectOption({ label: 'Fotosintesis E2E' });
  await expect(page.getByRole('heading', { name: 'Fotosintesis E2E', level: 2 })).toBeVisible();
  await expectAccessible(page, 'ruang belajar dengan dua materi');

  await page.getByText('15 mnt').click();
  await page.getByRole('button', { name: 'Mulai waktu fokus' }).click();
  await expect(page.getByRole('heading', { name: 'Bacaan ditutup sementara' })).toBeVisible();
  await expect(page.getByText(/tentang Homeostasis E2E dan Fotosintesis E2E/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fotosintesis E2E', level: 2 })).toHaveCount(0);

  await page.getByRole('button', { name: 'Selesai, lanjut tebak nilai' }).click();
  await expect(page).toHaveURL(/\/belajar\/foto$/);
  await expect(page.getByText('Homeostasis E2E + Fotosintesis E2E')).toBeVisible();
  await page.getByLabel(/Tebakan nilaimu/).fill('55');
  await page.getByRole('button', { name: 'Simpan tebakan' }).click();
  await page.locator('input[type=file]:not([capture])').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Kirim dan cek catatan' }).click();

  await expectResult(page);
  await expect(page.getByText('Homeostasis E2E + Fotosintesis E2E')).toBeVisible();

  const session = (await (await page.request.get('/api/v1/history')).json()).items[0];
  expect(session.materialTitle).toBe('Homeostasis E2E + Fotosintesis E2E');
  expect((await (await page.request.get('/api/v1/me/quota')).json()).quota.used).toBe(1);
});

test('switching back to one material starts a plain session', async ({ page }) => {
  await registerStudent(page.request, 'interleave-batal');
  await createMaterial(page.request, 'Satu E2E');
  await createMaterial(page.request, 'Dua E2E');
  await page.goto('/belajar');
  await dismissCookieNotice(page);
  await page.getByRole('button', { name: /Satu E2E/ }).click();

  await page.getByLabel('Materi kedua').selectOption({ label: 'Dua E2E' });
  await page.getByLabel('Materi kedua').selectOption({ label: 'Tidak, satu materi saja' });
  await expect(page.getByRole('heading', { name: 'Dua E2E', level: 2 })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mulai waktu fokus' }).click();
  await expect(page.getByRole('heading', { name: 'Bacaan ditutup sementara' })).toBeVisible();

  const active = (await (await page.request.get('/api/v1/sessions/active')).json()).session;
  expect(active.secondMaterialId).toBeNull();
});
