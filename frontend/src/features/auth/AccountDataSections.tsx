import { useState, type FormEvent } from 'react';
import { ApiError } from '@/core/apiClient';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Icon } from '@/shared/ui/Icon';
import { TextField } from '@/shared/ui/TextField';
import { authApi, type AuthUser } from './authApi';

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const sectionClass = 'flex flex-col gap-5 rounded-lg border border-line-soft bg-card p-5 sm:p-6';

/** Paket Gratis/Pro dan form kode aktivasi (FR-11). */
export function PlanSection({ user, onChanged }: { user: AuthUser; onChanged: (user: AuthUser) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');

  const expires = user.proExpiresAt ? new Date(user.proExpiresAt) : null;
  const activeUntil = expires && expires.getTime() > Date.now() ? expires : null;
  // tier PRO tanpa masa aktif berarti diberikan langsung di basis data, tanpa batas waktu.
  const permanentPro = user.tier === 'PRO' && !activeUntil;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setDone('');
    if (code.replace(/[\s-]/g, '').length < 16) {
      setError('Kode aktivasi terdiri dari 16 huruf dan angka.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const pro = await authApi.activatePro(code.trim());
      onChanged({ ...user, tier: pro.tier, proExpiresAt: pro.proExpiresAt });
      setCode('');
      setDone(pro.proExpiresAt ? `Pro aktif sampai ${dateFormat.format(new Date(pro.proExpiresAt))}.` : 'Pro aktif.');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') setError('Verifikasi emailmu dulu sebelum memakai kode.');
      else if (err instanceof ApiError && err.status === 404) setError('Kode aktivasi tidak valid atau sudah tidak berlaku.');
      else if (err instanceof ApiError && err.status === 409) setError('Kode ini sudah pernah kamu pakai.');
      else if (err instanceof ApiError && err.status === 429) setError('Terlalu banyak percobaan. Coba lagi dalam satu jam.');
      else setError('Kode gagal dipakai. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="plan-title" className={sectionClass}>
      <div className="flex flex-col gap-1">
        <h2 id="plan-title" className="font-title text-title-lg text-ink">
          Paket
        </h2>
        <p className="text-body-lg text-ink">
          {permanentPro
            ? 'Pro, tanpa batas waktu.'
            : activeUntil
              ? `Pro, aktif sampai ${dateFormat.format(activeUntil)}.`
              : 'Gratis, 3 foto catatan per hari.'}
        </p>
        {!permanentPro && (
          <p className="text-body-md text-ink-muted">
            Pro membuka batas foto harian. Kode aktivasi kamu dapat dari sekolah atau tim REKSA. Kalau Pro masih aktif,
            kode baru menambah masa aktifnya.
          </p>
        )}
      </div>
      {!permanentPro && (
        <form noValidate onSubmit={onSubmit} aria-busy={saving} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <TextField
            id="pro-code"
            label="Kode aktivasi"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            maxLength={32}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError('');
            }}
            error={error || undefined}
            className="flex-1"
          />
          <Button type="submit" variant="primary" disabled={saving || !code.trim()} className="sm:mt-7">
            {saving ? 'Memeriksa...' : 'Pakai kode'}
          </Button>
        </form>
      )}
      {done && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-teal-wash px-4 py-3 text-body-md text-ink">
          <Icon name="task_alt" className="mt-px text-[20px] text-teal" />
          {done}
        </p>
      )}
    </section>
  );
}

/** Unduh data saya dan hapus akun (FR-13). */
export function DataSection({ user, onDeleted }: { user: AuthUser; onDeleted: () => void }) {
  return (
    <section aria-labelledby="data-title" className={sectionClass}>
      <div className="flex flex-col gap-1">
        <h2 id="data-title" className="font-title text-title-lg text-ink">
          Data pribadi
        </h2>
        <p className="text-body-md text-ink-muted">
          Apa saja yang disimpan dan siapa yang bisa melihatnya ada di{' '}
          <a href="/privasi" target="_blank" className="text-teal underline underline-offset-2">
            Kebijakan Privasi
          </a>
          .
        </p>
      </div>
      <ExportBlock />
      <DeleteBlock user={user} onDeleted={onDeleted} />
    </section>
  );
}

type ExportState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'ready'; url: string }
  | { kind: 'error'; message: string };

function ExportBlock() {
  const [state, setState] = useState<ExportState>({ kind: 'idle' });

  const onExport = async () => {
    setState({ kind: 'working' });
    try {
      const result = await authApi.exportData();
      setState({ kind: 'ready', url: result.url });
      // Tautannya hanya berlaku 5 menit, jadi unduhan langsung dimulai.
      window.location.assign(result.url);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EXPORT_LIMIT') {
        const retryAt = (err.details as { retryAt?: string } | undefined)?.retryAt;
        setState({
          kind: 'error',
          message: retryAt
            ? `Arsip hanya bisa dibuat sekali sehari. Coba lagi setelah ${dateTimeFormat.format(new Date(retryAt))}.`
            : 'Arsip hanya bisa dibuat sekali sehari.',
        });
      } else if (err instanceof ApiError && err.status === 429) {
        setState({ kind: 'error', message: 'Terlalu banyak percobaan. Coba lagi nanti.' });
      } else {
        setState({ kind: 'error', message: 'Arsip gagal dibuat. Coba lagi.' });
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-title-md text-ink">Unduh data saya</h3>
      <p className="text-body-md text-ink-muted">
        Satu file zip berisi data akun, materi, sesi belajar, hasil penilaian, dan foto catatanmu. Bisa dibuat sekali
        sehari. Filenya dihapus dari server 24 jam setelah dibuat.
      </p>
      <Button variant="outline" onClick={() => void onExport()} disabled={state.kind === 'working'} className="self-start">
        <Icon name="download" />
        {state.kind === 'working' ? 'Menyiapkan arsip...' : 'Unduh data saya'}
      </Button>
      {state.kind === 'ready' && (
        <p role="status" className="text-body-md text-ink">
          Unduhan dimulai. Kalau tidak,{' '}
          <a href={state.url} className="text-teal underline underline-offset-2">
            unduh lewat tautan ini
          </a>{' '}
          dalam 5 menit.
        </p>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
          {state.message}
        </p>
      )}
    </div>
  );
}

function DeleteBlock({ user, onDeleted }: { user: AuthUser; onDeleted: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Tulis kata sandimu untuk konfirmasi.');
      return;
    }
    setError('');
    setConfirming(true);
  };

  const onConfirm = async () => {
    setConfirming(false);
    setDeleting(true);
    try {
      await authApi.deleteAccount(password);
      onDeleted();
    } catch (err) {
      setDeleting(false);
      if (err instanceof ApiError && err.code === 'INVALID_CURRENT_PASSWORD') setError('Kata sandi salah.');
      else if (err instanceof ApiError && err.status === 409) setError(err.message);
      else if (err instanceof ApiError && err.status === 429) setError('Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
      else setError('Akun gagal dihapus. Coba lagi.');
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-line-soft pt-6">
      <h3 className="text-title-md text-ink">Hapus akun</h3>
      <p className="text-body-md text-ink-muted">
        {user.role === 'EDUCATOR'
          ? 'Akun, materi, dan kelas kosongmu ikut terhapus. Kelas yang masih punya siswa harus dikosongkan atau dihapus dulu.'
          : 'Akun, materi, sesi belajar, hasil penilaian, dan semua foto catatanmu ikut terhapus.'}{' '}
        Penghapusan ini permanen, jadi unduh datamu dulu kalau masih butuh.
      </p>
      <form noValidate onSubmit={onSubmit} aria-busy={deleting} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          id="delete-password"
          label="Kata sandi"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error || undefined}
          className="flex-1"
        />
        <Button type="submit" variant="danger" disabled={deleting} className="sm:mt-7">
          {deleting ? 'Menghapus...' : 'Hapus akun'}
        </Button>
      </form>
      <ConfirmDialog
        open={confirming}
        icon="delete_forever"
        title="Hapus akun secara permanen?"
        confirmLabel="Ya, hapus akunku"
        cancelLabel="Batal"
        onConfirm={() => void onConfirm()}
        onCancel={() => setConfirming(false)}
      >
        Semua data dan foto di akun {user.email} akan dihapus dan tidak bisa dikembalikan.
      </ConfirmDialog>
    </div>
  );
}
