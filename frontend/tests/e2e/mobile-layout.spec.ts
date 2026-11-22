import { expect, test, type Page } from '@playwright/test';
import { dismissCookieNotice, registerStudent } from './helpers';

/**
 * Halaman pelajar di HP kecil tidak boleh lebih lebar dari layar. Dulu menu Belajar/Materi/Ulang/Kelas
 * butuh 435px, jadi di layar 375px menu Kelas terpotong dan seluruh halaman bisa digeser ke samping.
 */
const STUDENT_PAGES = ['/belajar', '/belajar/materi', '/belajar/ulang', '/belajar/kelas', '/akun'];

async function overflowOf(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 20)}"`);
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide };
  });
}

for (const width of [320, 375]) {
  test(`halaman pelajar muat di layar ${width}px tanpa geser ke samping`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 760 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await registerStudent(page.request, `hp${width}`);
    await page.goto('/');
    await dismissCookieNotice(page);

    for (const path of STUDENT_PAGES) {
      await page.goto(path);
      const menu = page.getByRole('navigation', { name: 'Menu pelajar' });
      await expect(menu.getByRole('link', { name: 'Kelas' })).toBeInViewport({ ratio: 1 });
      const o = await overflowOf(page);
      expect(o.scrollWidth, `${path} melebar: ${o.wide.join(', ')}`).toBeLessThanOrEqual(o.clientWidth);
    }

    // Menu tetap berfungsi dari HP: ketuk Kelas.
    await page.getByRole('navigation', { name: 'Menu pelajar' }).getByRole('link', { name: 'Kelas' }).tap();
    await expect(page).toHaveURL(/\/belajar\/kelas$/);
    await context.close();
  });
}
