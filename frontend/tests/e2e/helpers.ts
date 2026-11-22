import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import path from 'node:path';

export const PHOTO = path.join(import.meta.dirname, 'fixtures', 'catatan.jpg');
export const PASSWORD = 'PasswordKuat123';

/** Akun pelajar baru; cookie sesi tersimpan di konteks browser pemilik `request`. */
export async function registerStudent(request: APIRequestContext, label: string) {
  const email = `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@reksa.test`;
  const res = await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, fullName: `Siswa ${label}`, birthYear: 2000, acceptTerms: true },
  });
  expect(res.status(), await res.text()).toBe(201);
  return email;
}

export async function createMaterial(request: APIRequestContext, title: string) {
  const res = await request.post('/api/v1/materials', {
    data: { title, content: 'Homeostasis menjaga kondisi internal tubuh tetap stabil lewat umpan balik negatif.' },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).material.id as string;
}

/**
 * Audit WCAG 2.1 A/AA dengan axe-core. PRD §11.1: target 0 pelanggaran kritis. Pelanggaran "serious"
 * juga digagalkan supaya masalah kontras/label tidak menumpuk.
 */
export async function expectAccessible(page: Page, name: string) {
  // Tipe Page di @axe-core/playwright tertinggal satu versi dari @playwright/test; objeknya sama saat runtime.
  type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page'];
  // Tunggu animasi masuk selesai (misalnya pemberitahuan cookie yang fade in setelah 0,6 detik). Axe yang jalan di
  // tengah fade membaca teks setengah transparan sebagai kontras rendah. Animasi tak berujung (spinner) diabaikan.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  );
  const results = await new AxeBuilder({ page: page as unknown as AxePage })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map(
      (v) =>
        `${v.impact} ${v.id}: ${v.help} (${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')})`,
    );
  expect(blocking, `Pelanggaran aksesibilitas di ${name}`).toEqual([]);
}

/** Seperti pengguna sungguhan: tutup pemberitahuan cookie (pilih "Hanya penting") supaya tidak menutupi tombol. */
export async function dismissCookieNotice(page: Page) {
  const button = page.getByRole('button', { name: 'Hanya penting' });
  if (await button.isVisible().catch(() => false)) await button.click();
}

/** Dari ruang belajar sampai tebakan tersimpan (siap kirim foto). */
export async function reachPhotoStep(page: Page, materialTitle: string, jol = 70) {
  await page.goto('/belajar');
  await dismissCookieNotice(page);
  await page.getByRole('button', { name: new RegExp(materialTitle) }).click();
  await page.getByText('15 mnt').click();
  await page.getByRole('button', { name: 'Mulai waktu fokus' }).click();
  await expect(page.getByRole('heading', { name: 'Bacaan ditutup sementara' })).toBeVisible();
  await page.getByRole('button', { name: 'Selesai, lanjut tebak nilai' }).click();
  await expect(page).toHaveURL(/\/belajar\/foto$/);
  await page.getByLabel(/Tebakan nilaimu/).fill(String(jol));
  await page.getByRole('button', { name: 'Simpan tebakan' }).click();
  await expect(page.getByText(`Tebakan ${jol}% tersimpan`)).toBeVisible();
}

/** Halaman hasil sudah menampilkan nilai dari backend (audit DONE). */
export async function expectResult(page: Page) {
  await expect(page).toHaveURL(/\/belajar\/hasil$/);
  await expect(page.getByRole('heading', { name: 'Ringkasan untukmu' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Tebakanmu')).toBeVisible();
  await expect(page.getByText(/Hasil contoh/)).toHaveCount(0);
  await expect(page.getByText(/Rencana latihan ulang|Tidak ada konsep yang terlewat/)).toBeVisible();
}
