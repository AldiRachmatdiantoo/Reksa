import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/core/apiClient';
import { EMAIL_TOKEN_RE, useUrlToken } from '@/shared/hooks/useUrlToken';
import { ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock } from '@/shared/ui/StateBlock';
import { AuthCardLayout } from './AuthCardLayout';
import { useAuth } from './AuthProvider';
import { authApi, homePathFor } from './authApi';

type State = 'checking' | 'done' | 'invalid' | 'error';

/** Tujuan tautan di email verifikasi: /verifikasi-email?token=... */
export function VerifyEmailPage() {
  const auth = useAuth();
  const token = useUrlToken('query', EMAIL_TOKEN_RE);
  const [state, setState] = useState<State>(token ? 'checking' : 'invalid');
  const started = useRef(false);

  useEffect(() => {
    document.title = 'Verifikasi Email · REKSA';
  }, []);

  useEffect(() => {
    // Token sekali pakai: StrictMode menjalankan efek dua kali, jangan sampai terkirim dua kali.
    if (!token || started.current) return;
    started.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setState('done'))
      .catch((err: unknown) => setState(err instanceof ApiError && err.status === 400 ? 'invalid' : 'error'));
  }, [token]);

  // Tandai terverifikasi di sesi yang sedang terbuka tanpa memuat ulang halaman.
  useEffect(() => {
    if (state === 'done' && auth.status === 'authenticated' && !auth.user.emailVerified) {
      auth.updateUser({ ...auth.user, emailVerified: true });
    }
  }, [state, auth]);

  const next =
    auth.status === 'authenticated' ? { to: homePathFor(auth.user.role), label: 'Lanjut ke REKSA' } : { to: '/masuk', label: 'Masuk' };

  if (state === 'checking') {
    return (
      <AuthCardLayout title="Memverifikasi email">
        <LoadingBlock label="Memeriksa tautan..." />
      </AuthCardLayout>
    );
  }

  if (state === 'done') {
    return (
      <AuthCardLayout
        title="Email terverifikasi"
        intro={
          auth.status !== 'authenticated'
            ? 'Masuk untuk lanjut belajar. Siswa sekarang bisa bergabung ke kelas dengan kode dari guru.'
            : auth.user.role === 'STUDENT'
              ? 'Sekarang kamu bisa bergabung ke kelas dengan kode dari gurumu.'
              : 'Email akunmu sudah terverifikasi.'
        }
      >
        <ButtonLink to={next.to} variant="primary" size="lg">
          <Icon name="task_alt" />
          {next.label}
        </ButtonLink>
      </AuthCardLayout>
    );
  }

  return (
    <AuthCardLayout
      title={state === 'invalid' ? 'Tautan tidak bisa dipakai' : 'Verifikasi belum berhasil'}
      intro={
        state === 'invalid'
          ? 'Tautan ini sudah dipakai, sudah lewat 24 jam, atau tidak lengkap. Minta tautan baru dari halaman Akun setelah masuk.'
          : 'Server REKSA tidak bisa dihubungi. Buka lagi tautan dari email beberapa saat lagi.'
      }
    >
      <ButtonLink to={auth.status === 'authenticated' ? '/akun' : '/masuk'} variant="primary" size="lg">
        {auth.status === 'authenticated' ? 'Buka halaman Akun' : 'Masuk'}
      </ButtonLink>
    </AuthCardLayout>
  );
}
