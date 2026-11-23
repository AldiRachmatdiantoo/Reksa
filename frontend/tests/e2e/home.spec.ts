import { expect, test } from '@playwright/test';
import {
  createMaterial,
  dismissCookieNotice,
  expectAccessible,
  expectResult,
  PASSWORD,
  PHOTO,
  reachPhotoStep,
  registerStudent,
} from './helpers';

// Beranda pelajar: tujuan setelah masuk, berisi satu langkah berikutnya sesuai keadaan akun.

test('login lands a student on Beranda, whose next step follows the account state', async ({ page, browser, baseURL }) => {
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

  // Akun baru: belum ada materi, jadi langkahnya menambah materi. Email belum diverifikasi ikut diberi tahu.
  await expect(page.getByRole('link', { name: /Tambah materi pertamamu/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Perlu kamu tahu' })).toBeVisible();
  await expectAccessible(page, 'beranda (akun baru)');

  await page.getByRole('button', { name: /Panduan REKSA/ }).click();
  await expect(page.getByText('Halo, Siswa! Aku Risa.')).toBeVisible();
  await page.getByRole('button', { name: 'Lewati' }).click();

  // Punya materi: langkahnya mulai sesi, dan membawa ke ruang belajar.
  await createMaterial(page.request, 'Homeostasis Beranda');
  await page.goto('/belajar/beranda');
  await page.getByRole('link', { name: /Mulai sesi belajar/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mau belajar materi apa?' })).toBeVisible();

  // Sesi menunggu foto: Beranda mengarahkan ke langkah foto.
  await reachPhotoStep(page, 'Homeostasis Beranda', 60);
  await page.goto('/belajar/beranda');
  await page.getByRole('link', { name: /Tinggal foto catatanmu/ }).click();
  await expect(page).toHaveURL(/\/belajar\/foto$/);

  // Setelah dicek, hasil barunya muncul di "Perlu kamu tahu".
  await page.locator('input[type=file]:not([capture])').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Kirim dan cek catatan' }).click();
  await expectResult(page);
  await page.goto('/belajar/beranda');
  await expect(page.getByText(/Hasil cek Homeostasis Beranda sudah keluar/)).toBeVisible();
  await expectAccessible(page, 'beranda (ada hasil)');
});
