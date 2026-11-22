import { expect, test } from '@playwright/test';
import { dismissCookieNotice, expectAccessible, PASSWORD } from './helpers';

// FR-07 dan FR-08 dari sisi guru dan publik. Isi ledger dan peta (sesi siswa di kelas) diuji di backend
// (tests/integration/governance.test.ts, cohort.test.ts) karena butuh siswa dengan email terverifikasi.

test('the teacher portal shows the ledger and blind-spot map sections for an owned class', async ({ page }) => {
  const email = `e2e-guru-${Date.now()}@reksa.test`;
  const reg = await page.request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, fullName: 'Guru Ledger', role: 'EDUCATOR', birthYear: 1990, acceptTerms: true },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  expect((await page.request.post('/api/v1/classes', { data: { name: 'XI IPA Ledger' } })).status()).toBe(201);

  await page.goto('/guru');
  await dismissCookieNotice(page);
  const ledger = page.getByRole('region', { name: 'Bukti belajar siswa' });
  await expect(ledger).toBeVisible();
  await expect(ledger.getByText('Belum ada catatan yang dicek di kelas ini.', { exact: false })).toBeVisible();
  // Peta bagian sulit (FR-08): kelas kosong menampilkan keterangan, bukan angka karangan.
  const cohort = page.getByRole('region', { name: 'Peta bagian sulit' });
  await expect(cohort).toBeVisible();
  await expect(cohort.getByText('Belum ada catatan yang dicek di kelas ini.')).toBeVisible();
  await expectAccessible(page, 'portal guru dengan ledger');

  // FR-10: guru bisa bergabung ke institusi dari halaman Akun. Kode yang tidak dikenal dijawab pesan umum.
  await page.goto('/akun');
  const institution = page.getByRole('region', { name: 'Institusi' });
  await institution.getByLabel('Kode undangan').fill('A'.repeat(43));
  await institution.getByRole('button', { name: 'Gabung' }).click();
  await expect(institution.getByText('Kode undangan tidak berlaku.', { exact: false })).toBeVisible();
  await expectAccessible(page, 'akun guru dengan form institusi');
});

test('the public proof checker rejects unknown codes without showing personal data', async ({ page }) => {
  await page.goto('/cek-bukti');
  await dismissCookieNotice(page);
  await page.getByLabel('Kode bukti').fill('bukan-kode');
  await page.getByRole('button', { name: 'Cek' }).click();
  await expect(page.getByText('Kode bukti terdiri dari 64 huruf a sampai f dan angka.')).toBeVisible();

  await page.getByLabel('Kode bukti').fill('a'.repeat(64));
  await page.getByRole('button', { name: 'Cek' }).click();
  await expect(page).toHaveURL(new RegExp(`/cek-bukti/${'a'.repeat(64)}$`));
  await expect(page.getByText(/Tidak cocok\./)).toBeVisible();
  await expectAccessible(page, '/cek-bukti');
});
