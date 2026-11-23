import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { homePathFor, ROLE_LABEL } from '@/features/auth/authApi';
import { Brand } from './Brand';
import { Button, ButtonLink } from './Button';
import { Icon } from './Icon';
import { OfflineNotice } from './OfflineNotice';
import { ThemeToggle } from './ThemeToggle';

/** Tempat utama pelajar. Langkah foto dan hasil termasuk "Belajar" karena bagian dari satu sesi. */
const STUDENT_NAV = [
  { to: '/belajar/beranda', label: 'Beranda', icon: 'home', match: (p: string) => p.startsWith('/belajar/beranda') },
  {
    to: '/belajar',
    label: 'Belajar',
    icon: 'edit_note',
    match: (p: string) =>
      p.startsWith('/belajar') &&
      !['/belajar/beranda', '/belajar/materi', '/belajar/kelas', '/belajar/ulang', '/belajar/riwayat'].some((other) => p.startsWith(other)),
  },
  { to: '/belajar/materi', label: 'Materi', icon: 'menu_book', match: (p: string) => p.startsWith('/belajar/materi') },
  { to: '/belajar/ulang', label: 'Ulang', icon: 'event_repeat', match: (p: string) => p.startsWith('/belajar/ulang') },
  { to: '/belajar/riwayat', label: 'Riwayat', icon: 'history', match: (p: string) => p.startsWith('/belajar/riwayat') },
  { to: '/belajar/kelas', label: 'Kelas', icon: 'groups', match: (p: string) => p.startsWith('/belajar/kelas') },
];

/**
 * `stacked`: ikon di atas label, untuk baris menu di layar di bawah 1280px. Enam menu berjajar dengan ikon di
 * samping label butuh sekitar 630px, jadi di HP atau tablet menu terakhir terpotong dan halaman bisa digeser ke samping.
 */
function StudentNav({ className, layoutId, stacked = false }: { className: string; layoutId: string; stacked?: boolean }) {
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
            className={`relative flex min-h-11 items-center justify-center transition-colors ${
              stacked
                ? 'min-w-0 flex-1 flex-col gap-0.5 rounded-xl px-0 py-1 text-label-sm sm:text-label-md'
                : 'gap-1.5 rounded-full px-4 text-label-lg'
            } ${active ? 'text-teal' : 'text-ink-muted hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                aria-hidden="true"
                className={`absolute inset-0 bg-teal-wash ${stacked ? 'rounded-xl' : 'rounded-full'}`}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <Icon name={item.icon} className="relative text-[20px]" />
            <span className="relative max-w-full truncate">{item.label}</span>
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
    // Pindah ke beranda setelah server menghapus cookie. Kalau pindah duluan, membuka halaman lain saat request
    // masih jalan memotongnya: cookie tetap ada dan pengguna masih login (berbahaya di komputer bersama).
    // Gagal di server pun, status lokal tetap dikosongkan oleh AuthProvider.
    await auth.logout(() => navigate('/', { replace: true })).catch(() => undefined);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Brand to={user ? homePathFor(user.role) : '/'} subtitle={subtitle} />
        {isStudent && <StudentNav layoutId="student-nav-desktop" className="hidden items-center gap-1 xl:flex" />}
        <div className="flex items-center gap-1 sm:gap-2">
          {user && (
            <Link to="/akun" className="hidden flex-col items-end rounded-md px-2 py-1 text-right hover:bg-wash xl:flex">
              <span className="max-w-48 truncate text-label-lg text-ink">{user.fullName}</span>
              <span className="text-label-sm text-ink-muted">{ROLE_LABEL[user.role]}</span>
            </Link>
          )}
          {user && (
            <ButtonLink to="/akun" variant="ghost" aria-label="Akun" className="px-3 xl:hidden">
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
        <StudentNav
          stacked
          layoutId="student-nav-mobile"
          className="flex gap-0.5 border-t border-line-soft px-1.5 py-1 sm:px-4 xl:hidden"
        />
      )}
      <OfflineNotice />
    </header>
  );
}
