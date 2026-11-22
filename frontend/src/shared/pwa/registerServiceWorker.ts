/**
 * Memasang service worker (F2) supaya aplikasi tetap terbuka saat koneksi putus di tengah sesi. Hanya di build
 * produksi: dev server Vite dan unit test tidak memakainya. Gagal dipasang pun aplikasi tetap jalan seperti biasa.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Mode offline tidak tersedia di browser ini; sisanya tetap jalan. */
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
