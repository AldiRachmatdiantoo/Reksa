import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/core/apiClient';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { TextField } from '@/shared/ui/TextField';
import { AuthCardLayout } from './AuthCardLayout';
import { useAuth } from './AuthProvider';
import { authApi } from './authApi';
import { isStrongPassword, PasswordRules } from './PasswordRules';
import { readTokenFromUrl } from './tokenFromUrl';

/** Tujuan tautan di email reset: /atur-ulang-password?token=... */
export function ResetPasswordPage() {
  const auth = useAuth();
  const [token] = useState(readTokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<'form' | 'done' | 'invalid'>(token ? 'form' : 'invalid');

  useEffect(() => {
    document.title = 'Atur Ulang Kata Sandi · REKSA';
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isStrongPassword(password)) next.password = 'Kata sandi belum memenuhi semua syarat di bawah.';
    if (confirm !== password) next.confirm = 'Ketik ulang kata sandi yang sama.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !token) return;

    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      // Semua sesi dicabut di server; sesi di tab ini juga sudah tidak berlaku.
      if (auth.status === 'authenticated') await auth.logout().catch(() => undefined);
      setState('done');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_TOKEN') setState('invalid');
      else if (err instanceof ApiError && err.status === 429) setErrors({ form: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
      else setErrors({ form: 'Kata sandi gagal diganti. Coba lagi.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'done') {
    return (
      <AuthCardLayout
        title="Kata sandi sudah diganti"
        intro="Semua perangkat yang tadinya masuk sudah dikeluarkan. Masuk lagi dengan kata sandi baru."
      >
        <ButtonLink to="/masuk" variant="primary" size="lg">
          Masuk
        </ButtonLink>
      </AuthCardLayout>
    );
  }

  if (state === 'invalid') {
    return (
      <AuthCardLayout
        title="Tautan tidak bisa dipakai"
        intro="Tautan ini sudah dipakai, sudah lewat 30 menit, atau tidak lengkap. Minta tautan baru."
      >
        <ButtonLink to="/lupa-password" variant="primary" size="lg">
          Minta tautan baru
        </ButtonLink>
      </AuthCardLayout>
    );
  }

  const toggle = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
      aria-pressed={show}
      className="inline-flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-wash hover:text-ink"
    >
      <Icon name={show ? 'visibility_off' : 'visibility'} />
    </button>
  );

  return (
    <AuthCardLayout title="Buat kata sandi baru">
      <form noValidate onSubmit={onSubmit} aria-busy={submitting} className="flex flex-col gap-5">
        <TextField
          id="new-password"
          label="Kata sandi baru"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          trailing={toggle}
          hint={<PasswordRules value={password} />}
        />
        <TextField
          id="confirm-password"
          label="Ketik ulang kata sandi baru"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        {errors.form && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
            <Icon name="error" className="mt-px text-[20px]" />
            {errors.form}
          </p>
        )}
        <Button type="submit" variant="accent" size="lg" disabled={submitting}>
          {submitting ? 'Menyimpan...' : 'Simpan kata sandi baru'}
        </Button>
      </form>
    </AuthCardLayout>
  );
}
