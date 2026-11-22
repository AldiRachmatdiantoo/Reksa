import { useEffect, useState } from 'react';

/** `query`: `?token=` dari tautan email. `hash`: fragment dari kode QR (tidak pernah terkirim ke server). */
export type UrlTokenSource = 'query' | 'hash';

/** Token tautan email (verifikasi, reset kata sandi). */
export const EMAIL_TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

/** Membaca token tanpa mengubah URL, jadi aman dipanggil berkali-kali saat render. */
export function peekUrlToken(source: UrlTokenSource, pattern: RegExp): string | null {
  const raw = source === 'query' ? new URL(window.location.href).searchParams.get('token') : window.location.hash.slice(1);
  return raw && pattern.test(raw) ? raw : null;
}

/** Menghapus token dari address bar dan riwayat browser, termasuk token yang formatnya salah. */
export function stripUrlToken(source: UrlTokenSource): void {
  const url = new URL(window.location.href);
  if (source === 'query') {
    if (!url.searchParams.has('token')) return;
    url.searchParams.delete('token');
  } else {
    if (!url.hash) return;
    url.hash = '';
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Token sekali pakai dari URL. Dibaca saat render tanpa efek samping, lalu dihapus dari address bar setelah
 * halaman tampil, supaya tidak tertinggal di riwayat browser atau terkirim sebagai Referer.
 *
 * Penghapusan sengaja tidak dilakukan saat render: React bisa membuang render pertama dan mengulanginya (misalnya
 * saat halaman lazy selesai dimuat). Kalau token sudah dihapus di render yang dibuang, render berikutnya tidak
 * menemukannya dan pengguna melihat "tautan tidak berlaku".
 */
export function useUrlToken(source: UrlTokenSource, pattern: RegExp): string | null {
  const [token] = useState(() => peekUrlToken(source, pattern));
  useEffect(() => stripUrlToken(source), [source]);
  return token;
}
