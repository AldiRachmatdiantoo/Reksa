import { expect, test } from '@playwright/test';
import { createMaterial, dismissCookieNotice, expectAccessible, PASSWORD, registerStudent } from './helpers';

// Beranda pelajar: tujuan setelah masuk, berisi kartu pintasan ke tiap bagian REKSA.

test('login lands a student on Beranda, whose cards lead to every section', async ({ page, browser, baseURL }) => {
  // Daftar di konteks lain supaya halaman ini mulai tanpa sesi dan benar-benar lewat form masuk.
  const other = await browser.newContext({ baseURL });
  const email = await registerStudent(other.request, 'beranda');
  await other.close();

  await page.goto('/masuk');
  await dismissCookieNotice(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(PASSWORD);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL(/\/belajar\/beranda$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Halo, Siswa' })).toBeVisible();

  const cards = page.getByRole('navigation', { name: 'Pintasan Beranda' });
  await expect(cards.getByRole('link', { name: /Materi.*Belum ada materi/ })).toBeVisible();
  await expect(cards.getByRole('link', { name: /Ulang.*Belum ada yang waktunya/ })).toBeVisible();
  await expectAccessible(page, 'beranda');

  // Kartu Panduan membuka panduan maskot lagi.
  await cards.getByRole('button', { name: /Panduan REKSA/ }).click();
  await expect(page.getByText('Halo, Siswa! Aku Risa.')).toBeVisible();
  await page.getByRole('button', { name: 'Lewati' }).click();

  for (const [name, heading] of [
    [/Riwayat/, 'Riwayat'],
    [/Kelas/, 'Kelasmu'],
    [/Akun/, 'Akun'],
    [/Mulai sesi belajar/, 'Mau belajar materi apa?'],
  ] as const) {
    await page.goto('/belajar/beranda');
    await cards.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }

  await createMaterial(page.request, 'Homeostasis Beranda');
  await page.goto('/belajar/beranda');
  await expect(cards.getByRole('link', { name: /Materi.*1 materi tersimpan/ })).toBeVisible();
});
