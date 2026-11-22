import { useEffect, useState } from 'react';
import { useClasses } from '@/features/classes/classesApi';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { formatMinutes, formatSessionWindow, governanceApi, jolDeltaLabel, type LedgerEntry } from './governanceApi';

type LedgerState =
  | { status: 'loading' }
  | { status: 'ready'; entries: LedgerEntry[]; nextCursor: string | null; loadingMore: boolean; moreError: boolean }
  | { status: 'error' };

/** Bukti belajar per pengumpulan untuk satu kelas (FR-07). */
export function LedgerSection() {
  const classes = useClasses();
  const owned = classes.state.status === 'ready' ? classes.state.data.filter((c) => c.access === 'OWNER') : [];
  const [classId, setClassId] = useState<string | null>(null);
  const selected = classId ?? owned[0]?.id ?? null;

  return (
    <section aria-labelledby="ledger-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="ledger-title" className="font-headline text-headline-md text-ink">
          Bukti belajar siswa
        </h2>
        <p className="max-w-prose text-body-md text-ink-muted text-pretty">
          Setiap catatan yang sudah dicek: kapan sesinya, berapa lama fokus, tebakan nilai siswa dibanding skor, dan foto
          aslinya. Datanya dikunci dengan hash, jadi perubahan setelah dicek akan ketahuan.
        </p>
      </div>

      {classes.state.status === 'loading' && <p className="text-body-md text-ink-muted">Memuat kelas...</p>}
      {classes.state.status === 'error' && (
        <p role="alert" className="text-body-md text-on-danger-wash">
          Daftar kelas gagal dimuat.{' '}
          <button type="button" onClick={classes.reload} className="min-h-11 text-teal underline underline-offset-2">
            Coba lagi
          </button>
        </p>
      )}
      {classes.state.status === 'ready' && owned.length === 0 && (
        <p className="rounded-lg border border-line-soft bg-card px-5 py-4 text-body-md text-ink-muted">
          Buat kelas dulu. Bukti belajar muncul setelah siswa di kelas itu menyelesaikan sesi dengan materi kelas.
        </p>
      )}
      {owned.length > 0 && selected && (
        <>
          {owned.length > 1 && (
            <div className="flex flex-col gap-1.5 sm:max-w-sm">
              <label htmlFor="ledger-class" className="text-label-lg text-ink">
                Kelas
              </label>
              <select
                id="ledger-class"
                value={selected}
                onChange={(e) => setClassId(e.target.value)}
                className="min-h-12 rounded-[12px] border border-line bg-card px-4 text-body-lg text-ink"
              >
                {owned.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <LedgerList key={selected} classId={selected} />
        </>
      )}
    </section>
  );
}

function LedgerList({ classId }: { classId: string }) {
  const [state, setState] = useState<LedgerState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    governanceApi
      .ledger(classId, null, controller.signal)
      .then((page) => setState({ status: 'ready', ...page, loadingMore: false, moreError: false }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [classId, attempt]);

  const loadMore = async () => {
    if (state.status !== 'ready' || !state.nextCursor) return;
    setState({ ...state, loadingMore: true, moreError: false });
    try {
      const page = await governanceApi.ledger(classId, state.nextCursor);
      setState({ status: 'ready', entries: [...state.entries, ...page.entries], nextCursor: page.nextCursor, loadingMore: false, moreError: false });
    } catch {
      setState({ ...state, loadingMore: false, moreError: true });
    }
  };

  if (state.status === 'loading') return <p className="text-body-md text-ink-muted">Memuat bukti belajar...</p>;
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-body-md text-on-danger-wash">
        Bukti belajar gagal dimuat.{' '}
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="min-h-11 text-teal underline underline-offset-2">
          Coba lagi
        </button>
      </p>
    );
  }
  if (state.entries.length === 0) {
    return (
      <p className="rounded-lg border border-line-soft bg-card px-5 py-4 text-body-md text-ink-muted">
        Belum ada catatan yang dicek di kelas ini. Yang masuk hanya sesi siswa dengan materi yang kamu bagikan ke kelas.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {state.entries.map((entry) => (
          <li key={entry.submissionId}>
            <LedgerCard entry={entry} />
          </li>
        ))}
      </ul>
      {state.moreError && (
        <p role="alert" className="text-body-md text-on-danger-wash">
          Gagal memuat lagi. Coba sekali lagi.
        </p>
      )}
      {state.nextCursor && (
        <Button variant="outline" onClick={() => void loadMore()} disabled={state.loadingMore} className="self-start">
          {state.loadingMore ? 'Memuat...' : 'Tampilkan lebih banyak'}
        </Button>
      )}
    </div>
  );
}

function LedgerCard({ entry }: { entry: LedgerEntry }) {
  const shortFocus = entry.session.validity === 'SHORT_FOCUS';
  return (
    <article className="grid gap-4 rounded-lg border border-line-soft bg-card p-5 sm:grid-cols-[minmax(0,1fr)_10rem] sm:p-6">
      <div className="flex min-w-0 flex-col gap-3">
        <header className="flex flex-col gap-0.5">
          <h3 className="text-title-md text-ink [overflow-wrap:anywhere]">{entry.student.fullName}</h3>
          <p className="text-body-sm text-ink-muted [overflow-wrap:anywhere]">
            {entry.material.title ?? 'Materi pribadi siswa'} · {formatSessionWindow(entry.session.startedAt, entry.session.focusEndedAt)}
          </p>
        </header>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-md sm:grid-cols-3">
          <div className="flex flex-col">
            <dt className="text-label-sm text-ink-muted">Fokus</dt>
            <dd className="text-ink">
              {formatMinutes(entry.session.actualDurationSec)}{' '}
              <span className="text-ink-muted">dari {formatMinutes(entry.session.plannedDurationSec)}</span>
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-label-sm text-ink-muted">Tebakan vs skor</dt>
            <dd className="text-ink tabular-nums">
              {entry.predictedJolScore} vs {entry.actualScore}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-label-sm text-ink-muted">Konsep terlewat</dt>
            <dd className="text-ink tabular-nums">{entry.blindSpotCount}</dd>
          </div>
        </dl>
        <p className="text-body-sm text-ink-muted">Kalibrasi: {jolDeltaLabel(entry.jolDelta)}.</p>
        <div className="flex flex-wrap gap-2 text-body-sm">
          {shortFocus ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-danger-wash px-2 py-1 text-on-danger-wash">
              <Icon name="timer_off" className="text-[18px]" />
              Fokus kurang dari separuh waktu
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-teal-wash px-2 py-1 text-ink">
              <Icon name="timer" className="text-[18px] text-teal" />
              Sesi sah
            </span>
          )}
          {entry.hashValid ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-wash px-2 py-1 text-ink">
              <Icon name="verified" className="text-[18px] text-teal" />
              Hash cocok
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-danger-wash px-2 py-1 text-on-danger-wash">
              <Icon name="gpp_bad" className="text-[18px]" />
              Data berubah setelah dicek
            </span>
          )}
        </div>
        <LedgerProof hash={entry.ledgerHash} />
      </div>
      {entry.photoUrl ? (
        <a href={entry.photoUrl} target="_blank" rel="noreferrer" className="block self-start overflow-hidden rounded-md border border-line-soft">
          <img
            src={entry.photoUrl}
            alt={`Foto catatan tulisan tangan ${entry.student.fullName}`}
            loading="lazy"
            className="aspect-[3/4] w-full bg-wash object-contain"
          />
        </a>
      ) : (
        <p className="self-start rounded-md bg-wash px-3 py-4 text-center text-body-sm text-ink-muted">Foto belum bisa dimuat</p>
      )}
    </article>
  );
}

/**
 * Kode bukti lengkap. Guru bisa mencocokkannya dengan kode di PDF siswa atau mengeceknya di /cek-bukti;
 * potongan 10 karakter saja tidak cukup untuk keduanya.
 */
function LedgerProof({ hash }: { hash: string }) {
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopy('done');
    } catch {
      setCopy('failed');
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-label-sm text-ink-muted">Kode bukti</p>
      <code className="rounded-md bg-wash px-2 py-1.5 font-mono text-body-sm text-ink [overflow-wrap:anywhere]">{hash}</code>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" onClick={() => void copyHash()} className="px-3">
          <Icon name={copy === 'done' ? 'check' : 'content_copy'} />
          {copy === 'done' ? 'Tersalin' : 'Salin'}
        </Button>
        <ButtonLink to={`/cek-bukti/${hash}`} target="_blank" rel="noreferrer" variant="ghost" className="px-3">
          <Icon name="open_in_new" />
          Cek keaslian
        </ButtonLink>
      </div>
      {/* Sukses cukup terlihat dari tombol "Tersalin"; kalimatnya untuk pembaca layar saja. */}
      <p role="status" className={copy === 'failed' ? 'text-body-sm text-on-danger-wash' : 'sr-only'}>
        {copy === 'done' ? 'Kode bukti tersalin.' : copy === 'failed' ? 'Kode tidak bisa disalin otomatis. Salin manual dari kotak di atas.' : ''}
      </p>
    </div>
  );
}
