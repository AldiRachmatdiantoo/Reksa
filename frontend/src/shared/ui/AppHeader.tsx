import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { homePathFor, ROLE_LABEL } from '@/features/auth/authApi';
import { Brand } from './Brand';
import { Button, ButtonLink } from './Button';
import { Icon } from './Icon';
import { ThemeToggle } from './ThemeToggle';

/** Tempat utama pelajar. Langkah foto dan hasil termasuk "Belajar" karena bagian dari satu sesi. */
const STUDENT_NAV = [
  {
    to: '/belajar',
    label: 'Belajar',
    icon: 'edit_note',
    match: (p: string) =>
      p.startsWith('/belajar') && !['/belajar/materi', '/belajar/kelas', '/belajar/ulang'].some((other) => p.startsWith(other)),
  },
  { to: '/belajar/materi', label: 'Materi', icon: 'menu_book', match: (p: string) => p.startsWith('/belajar/materi') },
  { to: '/belajar/ulang', label: 'Ulang', icon: 'event_repeat', match: (p: string) => p.startsWith('/belajar/ulang') },
  { to: '/belajar/kelas', label: 'Kelas', icon: 'groups', match: (p: string) => p.startsWith('/belajar/kelas') },
];

function StudentNav({ className, layoutId }: { className: string; layoutId: string }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Menu pelajar" className={className}>
      {STUDENT_NAV.map((item) => {
        const active = item.match(pathname);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-label-lg transition-colors md:flex-none ${
              active ? 'text-teal' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-teal-wash"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <Icon name={item.icon} className="relative text-[20px]" />
            <span className="relative">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

/** Header halaman setelah login: identitas user, menu pelajar, tema, dan keluar. */
export function AppHeader({ subtitle }: { subtitle: string }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const user = auth.status === 'authenticated' ? auth.user : null;
  const isStudent = user?.role === 'STUDENT';

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
        {isStudent && <StudentNav layoutId="student-nav-desktop" className="hidden items-center gap-1 md:flex" />}
        <div className="flex items-center gap-1 sm:gap-2">
          {user && (
            <Link to="/akun" className="hidden flex-col items-end rounded-md px-2 py-1 text-right hover:bg-wash lg:flex">
              <span className="max-w-48 truncate text-label-lg text-ink">{user.fullName}</span>
              <span className="text-label-sm text-ink-muted">{ROLE_LABEL[user.role]}</span>
            </Link>
          )}
          {user && (
            <ButtonLink to="/akun" variant="ghost" aria-label="Akun" className="px-3 lg:hidden">
              <Icon name="account_circle" />
            </ButtonLink>
          )}
          <ThemeToggle />
          <Button variant="ghost" onClick={logout} disabled={leaving} aria-label="Keluar dari akun" className="px-3 sm:px-4">
            <Icon name="logout" />
            <span className="hidden sm:inline">{leaving ? 'Keluar...' : 'Keluar'}</span>
          </Button>
        </div>
      </div>
      {/* Di layar kecil menu pindah ke baris sendiri supaya label tetap terbaca dan mudah diketuk. */}
      {isStudent && (
        <StudentNav layoutId="student-nav-mobile" className="flex gap-1 border-t border-line-soft px-4 py-1.5 md:hidden" />
      )}
    </header>
  );
}
