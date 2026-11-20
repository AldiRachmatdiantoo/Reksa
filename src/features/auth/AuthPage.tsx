import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/core/apiClient';
import { Brand } from '@/shared/ui/Brand';
import { Button } from '@/shared/ui/Button';
import { EASE_OUT, pageTransition } from '@/shared/motion';
import { Icon } from '@/shared/ui/Icon';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { TextField } from '@/shared/ui/TextField';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { useAuth } from './AuthProvider';
import { homePathFor, PASSWORD_RULES } from './authApi';

type Mode = 'masuk' | 'daftar';
type SignupRole = 'STUDENT' | 'EDUCATOR';
type FieldErrors = Partial<Record<'fullName' | 'email' | 'password', string>>;

const ROLE_OPTIONS: { value: SignupRole; label: string; icon: string; note: string }[] = [
  { value: 'STUDENT', label: 'Pelajar', icon: 'edit_note', note: 'Latihan menulis dan cek catatan' },
  { value: 'EDUCATOR', label: 'Guru / Dosen', icon: 'school', note: 'Lihat bukti belajar kelasmu' },
];

function messageFor(err: unknown, mode: Mode): string {
  if (!(err instanceof ApiError)) return 'Terjadi kesalahan. Coba lagi.';
  if (err.code === 'NETWORK_ERROR') return 'Server REKSA tidak bisa dihubungi. Periksa koneksimu lalu coba lagi.';
  if (err.status === 429) return 'Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.';
  if (err.status === 401 && mode === 'masuk') return 'Email atau kata sandi salah.';
  if (err.status === 409) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (err.status >= 500) return 'Server sedang bermasalah. Coba lagi beberapa saat lagi.';
  return err.message;
}

export function AuthPage({ mode }: { mode: Mode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [role, setRole] = useState<SignupRole>('STUDENT');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === 'daftar';

  useEffect(() => {
    document.title = isRegister ? 'Daftar · REKSA' : 'Masuk · REKSA';
    setFieldErrors({});
    setFormError('');
  }, [isRegister]);

  if (auth.status === 'authenticated') {
    return <Navigate to={from ?? homePathFor(auth.user.role)} replace />;
  }

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (isRegister && !fullName.trim()) errors.fullName = 'Tulis nama lengkapmu.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = 'Tulis email yang valid, mis. nama@sekolah.sch.id.';
    if (!password) errors.password = 'Tulis kata sandimu.';
    else if (isRegister && !PASSWORD_RULES.every((r) => r.test(password)))
      errors.password = 'Kata sandi belum memenuhi semua syarat di bawah.';
    return errors;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const user = isRegister
        ? await auth.register({ fullName: fullName.trim(), email: email.trim(), password, role })
        : await auth.login({ email: email.trim(), password });
      navigate(from ?? homePathFor(user.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.issues.length > 0) {
        const mapped: FieldErrors = {};
        for (const issue of err.issues) {
          if (issue.path === 'fullName' || issue.path === 'email' || issue.path === 'password') mapped[issue.path] = issue.message;
        }
        setFieldErrors(mapped);
      }
      setFormError(messageFor(err, mode));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div {...pageTransition} className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between gap-10 border-r border-line-soft bg-teal-wash p-10 lg:flex">
        <Brand />
        <figure className="flex flex-col gap-6">
          <motion.img
            initial={{ opacity: 0, scale: 1.04, rotate: -1.5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease: EASE_OUT }}
            src="/assets/inclusive-learning.jpg"
            alt="Kertas berisi peta konsep dengan panah, pensil, dan HP yang memotret catatan itu"
            width={1024}
            height={1024}
            className="aspect-square w-full max-w-md rounded-lg border border-line-soft object-cover"
          />
          <figcaption className="max-w-md font-headline text-headline-md text-ink text-balance">
            Tulis apa yang kamu ingat di kertas. REKSA yang menunjukkan bagian yang terlewat.
          </figcaption>
        </figure>
        <p className="text-body-sm text-ink-muted">REKSA hanya memakai cookie login. Tidak ada cookie iklan atau pelacak.</p>
      </aside>

      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-full pr-3 text-label-lg text-ink-muted hover:text-teal">
            <Icon name="arrow_back" />
            Beranda
          </Link>
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-7 py-10">
          <div className="lg:hidden">
            <Brand />
          </div>
          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={isRegister ? 'daftar' : 'masuk'}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-2"
          >
            <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">
              {isRegister ? 'Buat akun REKSA' : 'Selamat datang kembali'}
            </h1>
            <p className="text-body-lg text-ink-muted text-pretty">
              {isRegister
                ? 'Gratis. Kamu cuma butuh kertas, pulpen, dan kamera HP.'
                : 'Masuk untuk lanjut latihan menulis dan cek pemahamanmu.'}
            </p>
          </motion.div>
          </AnimatePresence>

          <SegmentedTabs
            label="Pilih masuk atau daftar"
            value={mode}
            onChange={(next) => navigate(next === 'masuk' ? '/masuk' : '/daftar', { state: location.state, replace: true })}
            options={[
              { value: 'masuk', label: 'Masuk', panelId: 'auth-form' },
              { value: 'daftar', label: 'Daftar akun', panelId: 'auth-form' },
            ]}
            className="w-full"
          />

          <form id="auth-form" role="tabpanel" noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
            <AnimatePresence initial={false}>
            {isRegister && (
              <motion.fieldset key="role" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }} className="flex flex-col gap-2 overflow-hidden">
                <legend className="mb-2 text-label-lg text-ink">Daftar sebagai</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {ROLE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex min-h-11 items-start gap-3 rounded-md border-2 p-3.5 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal ${
                        role === opt.value ? 'border-teal bg-teal-wash' : 'border-line-soft bg-card hover:border-line'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={opt.value}
                        checked={role === opt.value}
                        onChange={() => setRole(opt.value)}
                        className="sr-only"
                      />
                      <Icon name={opt.icon} className={role === opt.value ? 'text-teal' : 'text-ink-muted'} />
                      <span className="flex flex-col">
                        <span className="text-title-md text-ink">{opt.label}</span>
                        <span className="text-body-sm text-ink-muted">{opt.note}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </motion.fieldset>
            )}
            {isRegister && (
              <motion.div key="name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }} className="overflow-hidden">
              <TextField
                id="fullName"
                label="Nama lengkap"
                autoComplete="name"
                placeholder="Nama sesuai absen kelas"
                value={fullName}
                maxLength={100}
                onChange={(e) => setFullName(e.target.value)}
                error={fieldErrors.fullName}
              />
              </motion.div>
            )}
            </AnimatePresence>

            <TextField
              id="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
            />

            <TextField
              id="password"
              label="Kata sandi"
              type={showPassword ? 'text' : 'password'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              maxLength={128}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  aria-pressed={showPassword}
                  className="inline-flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-wash hover:text-ink"
                >
                  <Icon name={showPassword ? 'visibility_off' : 'visibility'} />
                </button>
              }
              hint={
                isRegister ? (
                  <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1" aria-label="Syarat kata sandi">
                    {PASSWORD_RULES.map((rule) => {
                      const ok = rule.test(password);
                      return (
                        <li key={rule.id} className={`flex items-center gap-1.5 ${ok ? 'text-teal' : ''}`}>
                          <Icon name={ok ? 'check_circle' : 'radio_button_unchecked'} fill={ok} className="text-[18px]" />
                          {rule.label}
                          <span className="sr-only">{ok ? '(terpenuhi)' : '(belum)'}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : undefined
              }
            />

            {formError && (
              <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
                <Icon name="error" className="mt-px text-[20px]" />
                {formError}
              </p>
            )}

            <Button type="submit" variant="accent" size="lg" disabled={submitting} className="mt-1 w-full">
              {submitting ? 'Memproses...' : isRegister ? 'Buat akun' : 'Masuk'}
            </Button>
          </form>
        </div>
      </main>
    </motion.div>
  );
}
