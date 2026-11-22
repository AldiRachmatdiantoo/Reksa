import { createHash } from 'node:crypto';

/**
 * File hasil build yang disimpan service worker saat dipasang (F2), supaya halaman berikutnya (misalnya langkah
 * foto) tetap terbuka walau koneksi putus di tengah sesi. Gambar landing dan subset font selain latin tidak ikut:
 * disimpan saat pertama dipakai saja, supaya pemasangan tidak menghabiskan kuota data.
 */
export function precacheList(fileNames: readonly string[]): string[] {
  const wanted = (f: string) => /\.(js|css)$/.test(f) || /-latin-(?!ext-)[^/]*\.woff2$/.test(f);
  return [...new Set(fileNames)]
    .filter((f) => f !== 'sw.js' && wanted(f))
    .map((f) => `/${f}`)
    .sort();
}

/**
 * Versi cache: berubah setiap isi build berubah (nama file aset memuat hash isinya, index.html ikut dihitung),
 * jadi sw.js ikut berubah, browser memasang yang baru, dan cache lama dibuang.
 */
export function buildVersion(precache: readonly string[], indexHtml = ''): string {
  return createHash('sha256').update(precache.join('\n')).update(indexHtml).digest('hex').slice(0, 12);
}

/** Mengisi placeholder di pwa/sw.js. */
export function renderServiceWorker(template: string, precache: readonly string[], indexHtml = ''): string {
  const count = (token: string) => template.split(token).length - 1;
  if (count('__PRECACHE__') !== 1 || count('__BUILD__') !== 1) {
    throw new Error('pwa/sw.js harus memuat __PRECACHE__ dan __BUILD__ masing-masing tepat satu kali');
  }
  return template.replace('__PRECACHE__', JSON.stringify(precache)).replace('__BUILD__', buildVersion(precache, indexHtml));
}
