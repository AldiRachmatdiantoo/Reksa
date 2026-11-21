import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/core/apiClient';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { TextField } from '@/shared/ui/TextField';
import { governanceApi } from './governanceApi';

function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return 'PDF gagal dibuat. Coba lagi.';
  if (err.code === 'PRO_REQUIRED') return 'Ekspor PDF hanya untuk paket Pro.';
  if (err.code === 'TOO_MANY_SUBMISSIONS') return 'Satu PDF paling banyak 50 catatan. Persempit rentang tanggalnya.';
  if (err.status === 404) return 'Tidak ada catatan yang sudah dicek di pilihan ini.';
  if (err.status === 429) return 'Batas 5 PDF per jam tercapai. Coba lagi nanti.';
  if (err.status === 400) return err.message;
  return 'PDF gagal dibuat. Coba lagi.';
}

async function download(body: Parameters<typeof governanceApi.exportPdf>[0]) {
  const result = await governanceApi.exportPdf(body);
  // Tautan hanya berlaku 5 menit, jadi unduhan langsung dimulai.
  window.location.assign(result.url);
  return result;
}

/** Tombol PDF satu catatan di halaman Hasil (FR-12). Hanya tampil untuk akun Pro. */
export function LedgerPdfButton({ submissionId }: { submissionId: string }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const onClick = async () => {
    setWorking(true);
    setError('');
    try {
      await download({ submissionIds: [submissionId] });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" onClick={() => void onClick()} disabled={working}>
        <Icon name="picture_as_pdf" />
        {working ? 'Membuat PDF...' : 'Unduh PDF bukti belajar'}
      </Button>
      {error && (
        <p role="alert" className="text-body-sm text-on-danger-wash">
          {error}
        </p>
      )}
    </div>
  );
}

function isoDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

/** Bagian halaman Akun: PDF untuk rentang tanggal (FR-12). */
export function LedgerPdfSection({ isPro }: { isPro: boolean }) {
  const today = new Date();
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 29 * 86_400_000)));
  const [to, setTo] = useState(isoDay(today));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setDone('');
    if (!from || !to || from > to) {
      setError('Tanggal awal harus sebelum atau sama dengan tanggal akhir.');
      return;
    }
    setWorking(true);
    try {
      const result = await download({ from, to });
      setDone(`PDF berisi ${result.count} catatan sedang diunduh.`);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section aria-labelledby="pdf-title" className="flex flex-col gap-5 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="pdf-title" className="font-title text-title-lg text-ink">
          PDF bukti belajar
        </h2>
        <p className="text-body-md text-ink-muted">
          Untuk dilampirkan ke tugas atau portofolio. Isinya waktu sesi, lama fokus, tebakan nilai vs skor, konsep yang
          tepat dan terlewat, foto catatan, dan kode bukti. Penerima bisa mengecek keasliannya di{' '}
          <Link to="/cek-bukti" className="text-teal underline underline-offset-2">
            halaman cek bukti
          </Link>
          . Paling banyak 50 catatan per PDF.
        </p>
      </div>
      {isPro ? (
        <form noValidate onSubmit={onSubmit} aria-busy={working} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <TextField id="pdf-from" label="Dari tanggal" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <TextField id="pdf-to" label="Sampai tanggal" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          <Button type="submit" variant="primary" disabled={working} className="sm:mt-7">
            <Icon name="picture_as_pdf" />
            {working ? 'Membuat PDF...' : 'Unduh PDF'}
          </Button>
        </form>
      ) : (
        <p className="rounded-md bg-wash px-4 py-3 text-body-md text-ink">Fitur ini khusus paket Pro. Pakai kode aktivasi di bagian Paket.</p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
          {error}
        </p>
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
