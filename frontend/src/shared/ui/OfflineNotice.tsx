import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { Icon } from './Icon';

/** Baris di bawah header saat perangkat offline (F2). Timer jalan di perangkat; kiriman menunggu koneksi. */
export function OfflineNotice() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <p role="status" className="flex items-start gap-2 border-t border-line-soft bg-wash px-4 py-2 text-body-sm text-ink sm:px-6">
      <Icon name="cloud_off" className="mt-px text-[18px] text-ink-muted" />
      <span className="mx-auto w-full max-w-6xl">
        Kamu sedang offline. Timer tetap jalan, dan tebakan serta foto disimpan di perangkat ini lalu dikirim otomatis saat koneksi kembali.
      </span>
    </p>
  );
}
