import { useState, type FormEvent } from 'react';
import { ApiError } from '@/core/apiClient';
import { useLoad } from '@/shared/hooks/useLoad';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { institutionApi } from './institutionApi';

const CODE_RE = /^[A-Za-z0-9_-]{43}$/;

function joinMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Gagal bergabung. Coba lagi.';
  if (err.code === 'ALREADY_IN_INSTITUTION') return err.message;
  if (err.status === 404) return err.message;
  if (err.status === 429) return 'Terlalu banyak percobaan. Coba lagi satu jam lagi.';
  return 'Gagal bergabung. Coba lagi.';
}

/** Halaman Akun pengajar (FR-10): institusi tempat terhubung, atau form kode undangan dari admin. */
export function InstitutionJoinSection() {
  const mine = useLoad((signal) => institutionApi.mine(signal), []);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = code.trim();
    if (!CODE_RE.test(trimmed)) {
      setError('Kode undangan terdiri dari 43 huruf, angka, garis bawah, atau tanda minus. Salin utuh dari admin.');
      return;
    }
    setSaving(true);
    try {
      const institution = await institutionApi.join(trimmed);
      mine.setState({ status: 'ready', data: institution });
      setCode('');
    } catch (err) {
      setError(joinMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="institution-title" className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="institution-title" className="font-title text-title-lg text-ink">
          Institusi
        </h2>
        <p className="text-body-md text-ink-muted">
          Kalau sekolah atau kampusmu memakai REKSA, admin bisa memberimu kode undangan. Kelas yang kamu buat setelah bergabung tercatat di
          institusi. Admin hanya melihat angka gabungan, bukan data siswa satu per satu.
        </p>
      </div>
      {mine.state.status === 'loading' && <p className="text-body-md text-ink-muted">Memuat...</p>}
      {mine.state.status === 'error' && (
        <p role="alert" className="text-body-md text-on-danger-wash">
          Data institusi gagal dimuat.{' '}
          <button type="button" onClick={mine.reload} className="min-h-11 text-teal underline underline-offset-2">
            Coba lagi
          </button>
        </p>
      )}
      {mine.state.status === 'ready' && mine.state.data && (
        <p role="status" className="rounded-md bg-teal-wash px-4 py-3 text-body-md text-ink">
          Terhubung ke <strong className="font-semibold">{mine.state.data.name}</strong>.
        </p>
      )}
      {mine.state.status === 'ready' && !mine.state.data && (
        <form noValidate onSubmit={onSubmit} aria-busy={saving} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <TextField
            id="institution-code"
            label="Kode undangan"
            value={code}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            className="sm:flex-1"
          />
          <Button type="submit" variant="primary" disabled={saving} className="sm:mt-7">
            {saving ? 'Memeriksa...' : 'Gabung'}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
          {error}
        </p>
      )}
    </section>
  );
}
