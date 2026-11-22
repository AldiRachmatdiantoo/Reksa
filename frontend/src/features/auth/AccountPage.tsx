import { motion } from 'motion/react';
import { startTransition, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/core/apiClient';
import { pageTransition } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { TextField } from '@/shared/ui/TextField';
import { outbox } from '@/shared/offline/outbox';
import { LedgerPdfSection } from '@/features/governance/LedgerPdfExport';
import { InstitutionJoinSection } from '@/features/institution/InstitutionJoinSection';
import { DataSection, PlanSection } from './AccountDataSections';
import { useAuth } from './AuthProvider';
import { authApi, isEffectivePro, ROLE_LABEL, type AuthUser } from './authApi';
import { isStrongPassword, PasswordRules } from './PasswordRules';
import { VerifyEmailNotice } from './VerifyEmailNotice';

/** Profil dan kata sandi (FR-14), paket Pro (FR-11), unduh dan hapus data (FR-13). */
export function AccountPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Akun · REKSA';
  }, []);

  if (auth.status !== 'authenticated') return null;

  return (
    <>
      <AppHeader subtitle="Akun" />
      <motion.main {...pageTransition} className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">Akun</h1>
        <ProfileSection user={auth.user} onSaved={auth.updateUser} />
        <PlanSection user={auth.user} onChanged={auth.updateUser} />
        {auth.user.role === 'STUDENT' && <LedgerPdfSection isPro={isEffectivePro(auth.user)} />}
        {auth.user.role === 'EDUCATOR' && <InstitutionJoinSection />}
        <EmailSection currentEmail={auth.user.email} />
        <PasswordSection onChanged={auth.updateUser} />
        <DataSection
          user={auth.user}
          onDeleted={() => {
            // Cookie sesi sudah dihapus server. Sisa state sesi belajar dan antrean offline ikut dibuang.
            try {
              sessionStorage.clear();
            } catch {
              /* diabaikan */
            }
            void outbox.clear().catch(() => undefined);
            // Satu transition: react-router menjalankan navigasi sebagai transition, jadi recheck di luar
            // transition akan tampil lebih dulu dan halaman Akun yang masih aktif membelokkan ke /masuk.
            startTransition(() => {
              navigate('/', { replace: true });
              auth.recheck();
            });
          }}
        />
      </motion.main>
    </>
  );
}

function ProfileSection({ user, onSaved }: { user: AuthUser; onSaved: (user: AuthUser) => void }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) {
      setError('Nama tidak boleh kosong.');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      onSaved(await authApi.updateProfile(trimmed));
      setSaved(true);
    } catch {
      setError('Nama gagal disimpan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="profile-title" className="flex flex-col gap-5 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
      <h2 id="profile-title" className="font-title text-title-lg text-ink">
        Profil
      </h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-label-lg text-ink-muted">Email</dt>
          <dd className="flex flex-wrap items-center gap-2 text-body-lg text-ink">
            <span className="[overflow-wrap:anywhere]">{user.email}</span>
            {user.emailVerified ? (
              <span className="inline-flex items-center gap-1 text-body-sm text-teal">
                <Icon name="verified" fill className="text-[18px]" />
                Terverifikasi
              </span>
            ) : (
              <span className="text-body-sm text-ink-muted">Belum terverifikasi</span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label-lg text-ink-muted">Peran</dt>
          <dd className="text-body-lg text-ink">{ROLE_LABEL[user.role]}</dd>
        </div>
      </dl>
      <VerifyEmailNotice
        reason={
          user.role === 'STUDENT'
            ? 'Verifikasi email dibutuhkan untuk bergabung ke kelas.'
            : 'Verifikasi untuk memastikan email ini milikmu.'
        }
      />
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          id="account-name"
          label="Nama lengkap"
          autoComplete="name"
          maxLength={100}
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            setSaved(false);
          }}
          error={error || undefined}
          hint={saved ? 'Nama tersimpan.' : undefined}
          className="flex-1"
        />
        <Button type="submit" variant="primary" disabled={saving || fullName.trim() === user.fullName} className="sm:mt-7">
          {saving ? 'Menyimpan...' : 'Simpan nama'}
        </Button>
      </form>
    </section>
  );
}

/** F1: email akun berganti setelah tautan di alamat baru dibuka, jadi di sini hanya mengirim permintaan. */
function EmailSection({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const [sentTo, setSentTo] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const target = newEmail.trim().toLowerCase();
    const found: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) found.email = 'Tulis alamat email yang lengkap, misalnya nama@kampus.ac.id.';
    else if (target === currentEmail.toLowerCase()) found.email = 'Itu sudah email akunmu sekarang.';
    if (!password) found.password = 'Tulis kata sandimu untuk memastikan ini kamu.';
    setErrors(found);
    setSentTo('');
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      await authApi.requestEmailChange(target, password);
      setSentTo(target);
      setNewEmail('');
      setPassword('');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CURRENT_PASSWORD') setErrors({ password: 'Kata sandi salah.' });
      else if (err instanceof ApiError && err.code === 'SAME_EMAIL') setErrors({ email: 'Itu sudah email akunmu sekarang.' });
      else if (err instanceof ApiError && err.status === 429) setErrors({ form: 'Sudah 5 kali dalam satu jam terakhir. Coba lagi nanti.' });
      else setErrors({ form: 'Permintaan gagal dikirim. Coba lagi.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="email-title" className="flex flex-col gap-5 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="email-title" className="font-title text-title-lg text-ink">
          Ganti email
        </h2>
        <p className="text-body-md text-ink-muted">
          Kami kirim tautan ke alamat baru. Emailmu baru berganti setelah tautan itu dibuka, dan alamat lama dapat pemberitahuan.
        </p>
      </div>
      <form noValidate onSubmit={onSubmit} aria-busy={saving} className="flex flex-col gap-5">
        <TextField
          id="new-email"
          label="Email baru"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          error={errors.email}
        />
        <TextField
          id="email-change-password"
          label="Kata sandi akun"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        {errors.form && (
          <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
            {errors.form}
          </p>
        )}
        {sentTo && (
          <p role="status" className="flex items-start gap-2 rounded-md bg-teal-wash px-4 py-3 text-body-md text-ink">
            <Icon name="mark_email_read" className="mt-px text-[20px] text-teal" />
            <span>
              Cek kotak masuk <span className="font-semibold [overflow-wrap:anywhere]">{sentTo}</span> dan buka tautannya dalam 24 jam.
              Sampai saat itu, masuk tetap pakai email yang sekarang. Tidak ada email? Cek folder spam.
            </span>
          </p>
        )}
        <Button type="submit" variant="primary" disabled={saving} className="self-start">
          {saving ? 'Mengirim...' : 'Kirim tautan konfirmasi'}
        </Button>
      </form>
    </section>
  );
}

function PasswordSection({ onChanged }: { onChanged: (user: AuthUser) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (!current) found.current = 'Tulis kata sandi yang sekarang.';
    if (!isStrongPassword(next)) found.next = 'Kata sandi baru belum memenuhi semua syarat di bawah.';
    else if (next === current) found.next = 'Kata sandi baru harus berbeda dari yang sekarang.';
    setErrors(found);
    setDone(false);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      onChanged(await authApi.changePassword(current, next));
      setCurrent('');
      setNext('');
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CURRENT_PASSWORD') setErrors({ current: 'Kata sandi yang sekarang salah.' });
      else if (err instanceof ApiError && err.status === 429) setErrors({ form: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
      else setErrors({ form: 'Kata sandi gagal diganti. Coba lagi.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="password-title" className="flex flex-col gap-5 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="password-title" className="font-title text-title-lg text-ink">
          Ganti kata sandi
        </h2>
        <p className="text-body-md text-ink-muted">Setelah diganti, perangkat lain yang masuk ke akunmu akan dikeluarkan.</p>
      </div>
      <form noValidate onSubmit={onSubmit} aria-busy={saving} className="flex flex-col gap-5">
        <TextField
          id="current-password"
          label="Kata sandi sekarang"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current}
        />
        <TextField
          id="next-password"
          label="Kata sandi baru"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={errors.next}
          hint={<PasswordRules value={next} />}
        />
        {errors.form && (
          <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
            {errors.form}
          </p>
        )}
        {done && (
          <p role="status" className="flex items-start gap-2 rounded-md bg-teal-wash px-4 py-3 text-body-md text-ink">
            <Icon name="task_alt" className="mt-px text-[20px] text-teal" />
            Kata sandi sudah diganti. Perangkat lain sudah dikeluarkan.
          </p>
        )}
        <Button type="submit" variant="primary" disabled={saving} className="self-start">
          {saving ? 'Menyimpan...' : 'Ganti kata sandi'}
        </Button>
      </form>
    </section>
  );
}
