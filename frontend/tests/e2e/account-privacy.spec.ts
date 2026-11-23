import { expect, test } from '@playwright/test';
import { dismissCookieNotice, expectAccessible, PASSWORD } from './helpers';

// FR-13 dan FR-11 dari sisi pengguna: daftar dengan tahun lahir dan persetujuan,
// halaman dokumen publik, paket di halaman Akun, unduh data, lalu hapus akun.

test('legal pages are public and accessible', async ({ page }) => {
  await page.goto('/privasi');
  await dismissCookieNotice(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kebijakan Privasi' })).toBeVisible();
  await expect(page.getByText(/^Versi \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await expectAccessible(page, '/privasi');

  await page.getByRole('link', { name: 'Baca juga Syarat Layanan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Syarat Layanan' })).toBeVisible();
  await expectAccessible(page, '/syarat');
});

// REKSA hanya untuk 18+ (ketentuan Gemini API). Yang lahir tepat 18 tahun lalu menyatakan sudah 18.
test('someone under 18 cannot register; someone born 18 years ago confirms their age, exports data, then deletes the account', async ({
  page,
}) => {
  const email = `e2e-privasi-${Date.now()}@reksa.test`;
  const thisYear = new Date().getFullYear();
  const registerCalls: string[] = [];
  page.on('request', (r) => r.url().endsWith('/api/v1/auth/register') && registerCalls.push(r.method()));

  await page.goto('/daftar');
  await dismissCookieNotice(page);
  await expect(page.getByText('Gratis, untuk usia 18 tahun ke atas.', { exact: false })).toBeVisible();
  await page.getByLabel('Nama lengkap').fill('Mahasiswa Privasi');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(PASSWORD);

  // Di bawah 18: ditolak di formulir, tanpa request, dan tidak ada centang usia yang bisa dipakai untuk lolos.
  await page.getByLabel('Tahun lahir').fill(String(thisYear - 15));
  await expect(page.getByLabel('Aku sudah berumur 18 tahun.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByText('REKSA saat ini hanya untuk usia 18 tahun ke atas.')).toBeVisible();
  await expect(page.getByText('Setujui Syarat Layanan dan Kebijakan Privasi untuk lanjut.')).toBeVisible();
  await expectAccessible(page, '/daftar dengan error usia');

  // Lahir tepat 18 tahun lalu: wajib centang pernyataan sudah 18.
  await page.getByLabel('Tahun lahir').fill(String(thisYear - 18));
  await page.getByLabel(/setuju dengan/).check();
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByText('Centang pernyataan bahwa kamu sudah berumur 18 tahun.')).toBeVisible();
  expect(registerCalls).toEqual([]);

  await page.getByLabel('Aku sudah berumur 18 tahun.').check();
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page).toHaveURL(/\/belajar\/beranda$/);
  expect(registerCalls).toEqual(['POST']);

  await page.goto('/akun');
  await expect(page.getByText('Gratis, 3 foto catatan dan 3 materi baru per hari.')).toBeVisible();
  // PDF bukti belajar (FR-12) khusus Pro: akun gratis hanya melihat keterangannya, tanpa form.
  await expect(page.getByRole('heading', { name: 'PDF bukti belajar' })).toBeVisible();
  await expect(page.getByText('Fitur ini khusus paket Pro.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unduh PDF' })).toHaveCount(0);
  await expectAccessible(page, '/akun');

  // Kode salah: satu pesan umum (email belum terverifikasi dicek lebih dulu).
  await page.getByLabel('Kode aktivasi').fill('ZZZZ-ZZZZ-ZZZZ-ZZZZ');
  await page.getByRole('button', { name: 'Pakai kode' }).click();
  await expect(page.getByText('Verifikasi emailmu dulu sebelum memakai kode.')).toBeVisible();

  // Unduh data: server menjawab URL bertanda tangan, browser langsung mengunduh zip-nya.
  const exportResponse = page.waitForResponse((r) => r.url().endsWith('/api/v1/me/export'));
  await page.getByRole('button', { name: 'Unduh data saya' }).click();
  expect((await exportResponse).status()).toBe(201);

  await page.goto('/akun');
  await page.getByRole('button', { name: 'Unduh data saya' }).click();
  await expect(page.getByText(/Arsip hanya bisa dibuat sekali sehari/)).toBeVisible();

  // Hapus akun: kata sandi salah ditolak, lalu konfirmasi lewat dialog.
  const deleteField = page.getByLabel('Kata sandi', { exact: true });
  await deleteField.fill('SalahBanget123');
  await page.getByRole('button', { name: 'Hapus akun' }).click();
  await page.getByRole('button', { name: 'Ya, hapus akunku' }).click();
  await expect(page.getByText('Kata sandi salah.')).toBeVisible();

  await deleteField.fill(PASSWORD);
  await page.getByRole('button', { name: 'Hapus akun' }).click();
  await page.getByRole('button', { name: 'Ya, hapus akunku' }).click();
  await expect(page).toHaveURL(/\/$/);

  const login = await page.request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  expect(login.status()).toBe(401);
});
