/**
 * Membaca `?token=` dari tautan email lalu menghapusnya dari address bar, supaya token tidak
 * tertinggal di riwayat browser atau terkirim sebagai Referer ke halaman lain.
 */
export function readTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (token) {
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return token && /^[A-Za-z0-9_-]{20,128}$/.test(token) ? token : null;
}
