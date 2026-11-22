import { expect, test, type Page } from '@playwright/test';
import { dismissCookieNotice, registerStudent } from './helpers';

/** Mencatat setiap panggilan /auth/me dan /auth/refresh beserta status jawabannya. */
function watchAuthCalls(page: Page) {
  const calls: string[] = [];
  page.on('response', (res) => {
    const path = new URL(res.url()).pathname;
    if (path === '/api/v1/auth/me' || path === '/api/v1/auth/refresh') calls.push(`${res.request().method()} ${path} ${res.status()}`);
  });
  return calls;
}

// Dulu setiap muat halaman untuk pengunjung yang belum login memanggil /auth/me lalu /auth/refresh,
// dua-duanya 401, dan keduanya tampil sebagai error merah di konsol.
test('a visitor without a session makes no auth calls and sees no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  const calls = watchAuthCalls(page);

  for (const path of ['/', '/masuk', '/daftar', '/cek-bukti']) {
    await page.goto(path);
    await dismissCookieNotice(page);
    await expect(page.locator('main')).toBeVisible();
  }
  await page.goto('/belajar');
  await expect(page).toHaveURL(/\/masuk/);

  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

test('a signed-in student stays signed in after a reload, and stays out after logging out', async ({ page }) => {
  await registerStudent(page.request, 'sesi');
  const calls = watchAuthCalls(page);

  await page.goto('/belajar/kelas');
  await dismissCookieNotice(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kelasmu' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Kelasmu' })).toBeVisible();
  expect(calls.filter((c) => c.startsWith('GET /api/v1/auth/me'))).toEqual(['GET /api/v1/auth/me 200', 'GET /api/v1/auth/me 200']);

  await page.getByRole('button', { name: 'Keluar dari akun' }).click();
  await expect(page).toHaveURL(/\/$/);
  calls.length = 0;
  await page.goto('/belajar');
  await expect(page).toHaveURL(/\/masuk/);
  expect(calls).toEqual([]);
});

// Akun baru belum terverifikasi: penjelasannya ada di kotak verifikasi, tombol Gabung mati,
// dan tidak ada pesan error kedua dari server (dulu keduanya tampil bersamaan).
test('an unverified student sees one verify notice and a disabled join button', async ({ page }) => {
  await registerStudent(page.request, 'gabung');
  await page.goto('/belajar/kelas');
  await dismissCookieNotice(page);

  const join = page.getByRole('region', { name: 'Gabung ke kelas' });
  await expect(join.getByText('Verifikasi emailmu dulu supaya bisa bergabung ke kelas.')).toBeVisible();
  await join.getByLabel('Kode kelas').fill('ABCD2345');
  await expect(join.getByRole('button', { name: 'Gabung', exact: true })).toBeDisabled();
  await join.getByLabel('Kode kelas').press('Enter');
  await expect(join.getByRole('alert')).toHaveCount(0);
});
