import { useIsPresent } from 'motion/react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/shared/ui/Button';
import { LoadingBlock, StateBlock } from '@/shared/ui/StateBlock';
import { useAuth } from './AuthProvider';
import { homePathFor, type Role } from './authApi';
import { ConsentGate } from './ConsentGate';

/** Halaman khusus user login dengan peran tertentu. Peran lain diarahkan ke halamannya sendiri. */
export function RequireAuth({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  // Halaman yang sedang animasi keluar (AnimatePresence) jangan mengarahkan ke /masuk. Saat logout atau hapus
  // akun, tujuan sudah dipilih (beranda); tanpa ini status anonim yang datang lebih cepat dari animasi
  // membuat halaman lama membelokkan pengguna ke /masuk.
  const isPresent = useIsPresent();

  if (auth.status === 'loading') return <LoadingBlock label="Memeriksa sesi login..." />;

  if (auth.status === 'unreachable') {
    return (
      <div className="px-4 py-16">
        <StateBlock
          icon="cloud_off"
          tone="danger"
          title="Server REKSA belum bisa dihubungi"
          action={<Button onClick={auth.recheck}>Coba hubungkan lagi</Button>}
        >
          Periksa koneksi internetmu. Tebakan dan foto yang tersimpan di perangkat ini tetap aman dan dikirim setelah terhubung lagi.
        </StateBlock>
      </div>
    );
  }

  if (auth.status === 'anonymous') {
    return isPresent ? <Navigate to="/masuk" replace state={{ from: location.pathname }} /> : null;
  }

  if (auth.user.consentRequired) return <ConsentGate user={auth.user} />;

  if (!roles.includes(auth.user.role)) return <Navigate to={homePathFor(auth.user.role)} replace />;

  return children;
}
