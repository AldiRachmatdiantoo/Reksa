import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { homePathFor, ROLE_LABEL } from '@/features/auth/authApi';
import { Brand } from './Brand';
import { Button } from './Button';
import { Icon } from './Icon';
import { ThemeToggle } from './ThemeToggle';

/** Header halaman setelah login: identitas user, tema, dan keluar. */
export function AppHeader({ subtitle }: { subtitle: string }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const user = auth.status === 'authenticated' ? auth.user : null;

  const logout = async () => {
    setLeaving(true);
    // Pindah ke beranda dulu; kalau state auth berubah duluan, guard halaman
    // terproteksi akan mengarahkan ke /masuk.
    navigate('/', { replace: true });
    // Gagal di server pun, state lokal tetap dikosongkan oleh AuthProvider.
    await auth.logout().catch(() => undefined);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Brand to={user ? homePathFor(user.role) : '/'} subtitle={subtitle} />
        <div className="flex items-center gap-1 sm:gap-2">
          {user && (
            <span className="hidden flex-col items-end text-right sm:flex">
              <span className="max-w-48 truncate text-label-lg text-ink">{user.fullName}</span>
              <span className="text-label-sm text-ink-muted">{ROLE_LABEL[user.role]}</span>
            </span>
          )}
          <ThemeToggle />
          <Button variant="ghost" onClick={logout} disabled={leaving} aria-label="Keluar dari akun" className="px-3 sm:px-4">
            <Icon name="logout" />
            <span className="hidden sm:inline">{leaving ? 'Keluar...' : 'Keluar'}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
