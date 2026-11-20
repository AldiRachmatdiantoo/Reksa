import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/shared/ui/Button';
import { LoadingBlock, StateBlock } from '@/shared/ui/StateBlock';
import { useAuth } from './AuthProvider';
import { homePathFor, type Role } from './authApi';

/** Halaman khusus user login dengan peran tertentu. Peran lain diarahkan ke halamannya sendiri. */
export function RequireAuth({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

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
          Periksa koneksi internetmu. Kalau kamu sedang mengembangkan REKSA, pastikan backend berjalan.
        </StateBlock>
      </div>
    );
  }

  if (auth.status === 'anonymous') {
    return <Navigate to="/masuk" replace state={{ from: location.pathname }} />;
  }

  if (!roles.includes(auth.user.role)) return <Navigate to={homePathFor(auth.user.role)} replace />;

  return children;
}
