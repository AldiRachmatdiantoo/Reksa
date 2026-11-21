import { expect, test } from '@playwright/test';
import { createMaterial, dismissCookieNotice, registerStudent } from './helpers';

// Regresi untuk dua bug yang hanya muncul di build produksi di balik nginx:
// 1. Pindah menu di dalam /belajar membuat layar kosong (AnimatePresence bersarang).
// 2. CSP memblokir <style> bawaan NumberFlow, jadi timer tampil sebagai deretan angka 0-9
//    dan halaman melebar ke samping. Font Google juga terblokir.

test('student menu navigation renders every page, with no CSP violations', async ({ page }) => {
  const cspErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) cspErrors.push(msg.text());
  });

  await registerStudent(page.request, 'nav');
  await createMaterial(page.request, 'Homeostasis Navigasi');

  await page.goto('/belajar/materi');
  await dismissCookieNotice(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Materi belajarmu' })).toBeVisible();

  const menu = page.getByRole('navigation', { name: 'Menu pelajar' });
  const visit = async (link: string, heading: string) => {
    await menu.getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('main')).toHaveCount(1);
  };
  await visit('Kelas', 'Kelasmu');
  await visit('Belajar', 'Mau belajar materi apa?');
  await visit('Materi', 'Materi belajarmu');
  await visit('Kelas', 'Kelasmu');

  // Keluar dari /belajar lalu masuk lagi.
  await page.goto('/akun');
  await expect(page.getByRole('heading', { level: 1, name: 'Akun' })).toBeVisible();
  await page.goto('/belajar');
  await expect(page.getByRole('heading', { level: 1, name: 'Mau belajar materi apa?' })).toBeVisible();

  // Timer NumberFlow tampil wajar: halaman tidak melebar ke samping.
  await page.getByRole('button', { name: /Homeostasis Navigasi/ }).click();
  await page.getByText('15 mnt').click();
  await page.getByRole('button', { name: 'Mulai waktu fokus' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Font teks dari bundel sendiri, bukan Google Fonts.
  const bodyFontLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Plus Jakarta Sans' && f.status === 'loaded');
  });
  expect(bodyFontLoaded).toBe(true);

  expect(cspErrors).toEqual([]);
});
