import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * false saat browser tahu perangkat tidak punya koneksi. true belum tentu server terjangkau (wifi tanpa internet),
 * jadi kiriman tetap ditangani lewat error jaringan, bukan hanya lewat nilai ini.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
