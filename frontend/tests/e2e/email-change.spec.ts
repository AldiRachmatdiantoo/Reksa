import { expect, test } from '@playwright/test';
import { dismissCookieNotice, expectAccessible, PASSWORD, registerStudent, tokenFromEmail } from './helpers';

// F1 (lanjutan FR-14): ganti email lewat tautan ke alamat baru. Butuh Mailpit dari docker compose.

test('a student changes the account email through a link sent to the new address', async ({ page }) => {
  await registerStudent(page.request, 'ganti-email');
  const newEmail = `e2e-email-baru-${Date.now()}@reksa.test`;

  await page.goto('/akun');
  await dismissCookieNotice(page);
  const section = page.getByRole('region', { name: 'Ganti email' });
  await expect(section).toBeVisible();

  await section.getByLabel('Email baru').fill(newEmail);
  await section.getByLabel('Kata sandi akun').fill('SalahBanget123');
  await section.getByRole('button', { name: 'Kirim tautan konfirmasi' }).click();
  await expect(section.getByText('Kata sandi salah.')).toBeVisible();
  await expectAccessible(page, '/akun dengan error ganti email');

  await section.getByLabel('Kata sandi akun').fill(PASSWORD);
  await section.getByRole('button', { name: 'Kirim tautan konfirmasi' }).click();
  await expect(section.getByRole('status')).toContainText(newEmail);

  const token = await tokenFromEmail(newEmail, 'konfirmasi-email');
  await page.goto(`/konfirmasi-email?token=${token}`);
  await expect(page.getByRole('heading', { name: 'Email akun sudah diganti' })).toBeVisible();
  // Token dihapus dari address bar setelah dibaca.
  await expect(page).toHaveURL(/\/konfirmasi-email$/);
  await expectAccessible(page, '/konfirmasi-email');

  await page.getByRole('link', { name: 'Buka halaman Akun' }).click();
  await expect(page.getByText(newEmail, { exact: true })).toBeVisible();
  await expect(page.getByText('Terverifikasi')).toBeVisible();

  // Tautan sekali pakai.
  await page.goto(`/konfirmasi-email?token=${token}`);
  await expect(page.getByRole('heading', { name: 'Tautan tidak bisa dipakai' })).toBeVisible();

  const login = await page.request.post('/api/v1/auth/login', { data: { email: newEmail, password: PASSWORD } });
  expect(login.status()).toBe(200);
});
