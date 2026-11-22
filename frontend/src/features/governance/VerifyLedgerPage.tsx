import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/core/apiClient';
import { AuthCardLayout } from '@/features/auth/AuthCardLayout';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { TextField } from '@/shared/ui/TextField';
import { governanceApi, type LedgerVerification } from './governanceApi';

const HASH_RE = /^[0-9a-f]{64}$/;

type State =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; result: LedgerVerification }
  | { status: 'error'; message: string };

const sessionDay = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Halaman publik /cek-bukti/:hash (FR-07, dipakai tautan di PDF FR-12). Tidak menampilkan data pribadi. */
export function VerifyLedgerPage() {
  const params = useParams();
  const navigate = useNavigate();
  const fromUrl = (params.hash ?? '').toLowerCase();
  const [input, setInput] = useState(fromUrl);
  const [inputError, setInputError] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    document.title = 'Cek bukti belajar · REKSA';
  }, []);

  useEffect(() => {
    if (!HASH_RE.test(fromUrl)) return;
    let cancelled = false;
    setState({ status: 'checking' });
    governanceApi.verify(fromUrl).then(
      (result) => !cancelled && setState({ status: 'done', result }),
      (err: unknown) =>
        !cancelled &&
        setState({
          status: 'error',
          message:
            err instanceof ApiError && err.status === 429
              ? 'Terlalu banyak pengecekan. Tunggu satu menit.'
              : 'Pengecekan gagal. Coba lagi.',
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [fromUrl]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const hash = input.trim().toLowerCase();
    if (!HASH_RE.test(hash)) {
      setInputError('Kode bukti terdiri dari 64 huruf a sampai f dan angka.');
      return;
    }
    setInputError('');
    navigate(`/cek-bukti/${hash}`, { replace: true });
  };

  return (
    <AuthCardLayout
      title="Cek bukti belajar"
      intro="Masukkan kode bukti dari dokumen REKSA untuk memastikan dokumen itu asli dan datanya tidak diubah."
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          id="ledger-hash"
          label="Kode bukti"
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          error={inputError || undefined}
          className="font-mono"
        />
        <Button type="submit" variant="primary" disabled={state.status === 'checking'}>
          {state.status === 'checking' ? 'Memeriksa...' : 'Cek'}
        </Button>
      </form>

      {state.status === 'done' && state.result.valid && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-teal-wash px-4 py-3 text-body-md text-ink">
          <Icon name="verified" className="mt-px text-[20px] text-teal" />
          Asli. Bukti ini tercatat di REKSA untuk sesi belajar tanggal {sessionDay.format(new Date(state.result.sessionDate))}, dan datanya
          belum berubah sejak dicek.
        </p>
      )}
      {state.status === 'done' && !state.result.valid && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
          <Icon name="gpp_bad" className="mt-px text-[20px]" />
          Tidak cocok. Kode ini tidak tercatat di REKSA, atau datanya sudah berubah setelah dicek.
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
          {state.message}
        </p>
      )}
      <p className="text-body-sm text-ink-muted">Halaman ini tidak menampilkan nama, nilai, atau foto siswa.</p>
    </AuthCardLayout>
  );
}
