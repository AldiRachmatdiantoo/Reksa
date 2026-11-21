import { useState } from 'react';
import { ApiError } from '@/core/apiClient';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { useAuth } from './AuthProvider';
import { authApi } from './authApi';

type Status = 'idle' | 'sending' | 'sent' | 'error';

/** Pemberitahuan untuk akun yang belum verifikasi email, dengan tombol kirim ulang. Tidak tampil bila sudah terverifikasi. */
export function VerifyEmailNotice({ reason }: { reason: string }) {
  const auth = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  if (auth.status !== 'authenticated' || auth.user.emailVerified) return null;
  const { user } = auth;

  const resend = async () => {
    setStatus('sending');
    setError('');
    try {
      await authApi.resendVerification();
      setStatus('sent');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Sudah terverifikasi di tab lain.
        auth.updateUser({ ...user, emailVerified: true });
        return;
      }
      setStatus('error');
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Sudah 3 kali dikirim dalam satu jam terakhir. Cek folder spam, atau coba lagi nanti.'
          : 'Tautan gagal dikirim. Coba lagi.',
      );
    }
  };

  return (
    <div role="status" className="flex flex-col gap-3 rounded-md border border-line-soft bg-wash p-4">
      <p className="flex items-start gap-2 text-body-md text-ink">
        <Icon name="mark_email_unread" className="mt-px text-[20px] text-teal" />
        <span>
          {reason} Cek kotak masuk <strong className="[overflow-wrap:anywhere]">{user.email}</strong>. Kalau tautannya tidak ada, kirim
          tautan baru.
        </span>
      </p>
      {status === 'sent' ? (
        <p className="text-body-sm text-ink-muted">Tautan baru sudah dikirim. Tautan lama tidak berlaku lagi.</p>
      ) : (
        <Button variant="outline" onClick={resend} disabled={status === 'sending'} className="self-start">
          <Icon name="send" />
          {status === 'sending' ? 'Mengirim...' : 'Kirim tautan baru'}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-body-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
