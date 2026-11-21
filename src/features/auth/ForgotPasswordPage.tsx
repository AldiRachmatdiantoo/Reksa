import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/core/apiClient';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { TextField } from '@/shared/ui/TextField';
import { AuthCardLayout } from './AuthCardLayout';
import { authApi } from './authApi';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentMessage, setSentMessage] = useState('');

  useEffect(() => {
    document.title = 'Lupa Kata Sandi · REKSA';
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Tulis email yang kamu pakai untuk mendaftar.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { message } = await authApi.forgotPassword(email.trim());
      setSentMessage(message);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Terlalu banyak permintaan. Cek kotak masuk dan folder spam, atau coba lagi dalam satu jam.'
          : 'Permintaan gagal dikirim. Coba lagi.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (sentMessage) {
    return (
      <AuthCardLayout title="Cek emailmu" intro={sentMessage}>
        <p className="text-body-md text-ink-muted">Tautannya berlaku 30 menit dan hanya bisa dipakai sekali.</p>
        <ButtonLink to="/masuk" variant="outline" size="lg">
          Kembali ke halaman masuk
        </ButtonLink>
      </AuthCardLayout>
    );
  }

  return (
    <AuthCardLayout title="Lupa kata sandi" intro="Tulis email akunmu. Kami kirim tautan untuk membuat kata sandi baru.">
      <form noValidate onSubmit={onSubmit} aria-busy={submitting} className="flex flex-col gap-5">
        <TextField
          id="forgot-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="nama@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError('');
          }}
          error={error || undefined}
        />
        <Button type="submit" variant="accent" size="lg" disabled={submitting}>
          <Icon name="send" />
          {submitting ? 'Mengirim...' : 'Kirim tautan'}
        </Button>
      </form>
    </AuthCardLayout>
  );
}
