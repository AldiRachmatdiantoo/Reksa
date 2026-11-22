import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/core/apiClient';
import { EMAIL_TOKEN_RE, useUrlToken } from '@/shared/hooks/useUrlToken';
import { ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock } from '@/shared/ui/StateBlock';
import { AuthCardLayout } from './AuthCardLayout';
import { useAuth } from './AuthProvider';
import { authApi } from './authApi';

type State = 'checking' | 'done' | 'invalid' | 'taken' | 'error';

/** Tujuan tautan di email konfirmasi ganti email: /konfirmasi-email?token=... Boleh dibuka tanpa login. */
export function ConfirmEmailChangePage() {
  const auth = useAuth();
  const token = useUrlToken('query', EMAIL_TOKEN_RE);
  const [state, setState] = useState<State>(token ? 'checking' : 'invalid');
  const started = useRef(false);
  const refreshed = useRef(false);

  useEffect(() => {
    document.title = 'Konfirmasi Email Baru · REKSA';
  }, []);

  useEffect(() => {
    // Token sekali pakai: StrictMode menjalankan efek dua kali, jangan sampai terkirim dua kali.
    if (!token || started.current) return;
    started.current = true;
    authApi
      .confirmEmailChange(token)
      .then(() => setState('done'))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 409) setState('taken');
        else setState(err instanceof ApiError && err.status === 400 ? 'invalid' : 'error');
      });
  }, [token]);

  // Sesi yang terbuka di tab ini ikut menampilkan email baru tanpa memuat ulang halaman.
  useEffect(() => {
    if (state !== 'done' || auth.status !== 'authenticated' || refreshed.current) return;
    refreshed.current = true;
    authApi
      .me()
      .then(auth.updateUser)
      .catch(() => {
        /* Halaman Akun memuat ulang data saat dibuka. */
      });
  }, [state, auth]);

  const signedIn = auth.status === 'authenticated';

  if (state === 'checking') {
    return (
      <AuthCardLayout title="Mengganti email">
        <LoadingBlock label="Memeriksa tautan..." />
      </AuthCardLayout>
    );
  }

  if (state === 'done') {
    return (
      <AuthCardLayout
        title="Email akun sudah diganti"
        intro={
          signedIn ? 'Mulai sekarang, masuk ke REKSA memakai alamat baru ini.' : 'Masuk memakai alamat baru ini dan kata sandi yang sama.'
        }
      >
        <ButtonLink to={signedIn ? '/akun' : '/masuk'} variant="primary" size="lg">
          <Icon name="task_alt" />
          {signedIn ? 'Buka halaman Akun' : 'Masuk'}
        </ButtonLink>
      </AuthCardLayout>
    );
  }

  const copy: Record<Exclude<State, 'checking' | 'done'>, { title: string; intro: string }> = {
    invalid: {
      title: 'Tautan tidak bisa dipakai',
      intro:
        'Tautan ini sudah dipakai, sudah lewat 24 jam, tidak lengkap, atau dibatalkan karena kata sandi akun diganti. Minta lagi dari halaman Akun.',
    },
    taken: {
      title: 'Alamat ini sudah dipakai',
      intro:
        'Sejak permintaan dibuat, alamat ini sudah dipakai akun REKSA lain. Email akunmu tidak berubah. Pakai alamat lain dari halaman Akun.',
    },
    error: {
      title: 'Email belum berhasil diganti',
      intro: 'Server REKSA tidak bisa dihubungi. Buka lagi tautan dari email beberapa saat lagi.',
    },
  };

  return (
    <AuthCardLayout title={copy[state].title} intro={copy[state].intro}>
      <ButtonLink to={signedIn ? '/akun' : '/masuk'} variant="primary" size="lg">
        {signedIn ? 'Buka halaman Akun' : 'Masuk'}
      </ButtonLink>
    </AuthCardLayout>
  );
}
