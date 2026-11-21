import NumberFlow from '@number-flow/react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '@/core/apiClient';
import { auditFailureText, scansApi, uploadErrorMessage, type Scan } from '@/features/scanner/scansApi';
import { useSpeech } from '@/shared/hooks/useSpeech';
import { EASE_OUT, FillBar, pageTransition, Stagger, StaggerItem } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock, StateBlock } from '@/shared/ui/StateBlock';
import { StepIndicator } from '@/features/studio/StepIndicator';
import { useStudySession } from '@/features/studio/studySession';
import type { ImportanceLevel } from './sampleAudit';

/** PRD FR-05: cek status tiap 2 detik, paling lama 90 detik. */
const POLL_MS = 2000;
const POLL_LIMIT_MS = 90_000;

const IMPORTANCE: Record<ImportanceLevel, { label: string; className: string }> = {
  HIGH: { label: 'Penting', className: 'bg-danger-wash text-on-danger-wash' },
  MEDIUM: { label: 'Ingat lagi', className: 'bg-wash-strong text-ember-ink' },
  LOW: { label: 'Tambahan', className: 'bg-wash-strong text-ink-muted' },
};

function calibrationMessage(guess: number, actual: number) {
  const diff = guess - actual;
  if (Math.abs(diff) <= 10) return { title: 'Tebakanmu cukup tepat', body: 'Kamu sudah bisa mengukur pemahamanmu sendiri.' };
  if (diff > 0)
    return {
      title: 'Kamu merasa lebih paham dari hasilnya',
      body: 'Ini wajar. Bagian di bawah menunjukkan konsep yang terasa sudah hafal tapi belum tertulis.',
    };
  return { title: 'Kamu lebih paham dari yang kamu kira', body: 'Pemahamanmu lebih kuat dari tebakanmu. Percaya diri saja.' };
}

function reviewDate(fromIso: string, days: number) {
  const d = new Date(fromIso);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
}

type Poll = { scan: Scan | null; error: ApiError | Error | null; slow: boolean };

/** Memantau satu hasil cek sampai DONE/FAILED. Setelah 90 detik berhenti sendiri (`slow`); `restart` memulai lagi. */
function useScanPolling(submissionId: string | null) {
  const [poll, setPoll] = useState<Poll>({ scan: null, error: null, slow: false });
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!submissionId) return;
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: number | undefined;
    setPoll((p) => ({ ...p, error: null, slow: false }));

    const tick = async () => {
      try {
        const scan = await scansApi.get(submissionId, controller.signal);
        setPoll({ scan, error: null, slow: false });
        if (scan.auditStatus === 'DONE' || scan.auditStatus === 'FAILED') return;
      } catch (err) {
        if (controller.signal.aborted) return;
        setPoll((p) => ({ ...p, error: err instanceof Error ? err : new Error(String(err)) }));
        if (err instanceof ApiError && err.status === 404) return;
      }
      if (Date.now() - startedAt >= POLL_LIMIT_MS) {
        setPoll((p) => ({ ...p, slow: true }));
        return;
      }
      timer = window.setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [submissionId, round]);

  const restart = useCallback(() => setRound((r) => r + 1), []);
  return { ...poll, restart };
}

export function ResultPage() {
  const navigate = useNavigate();
  const { session, syncing, clear } = useStudySession();
  const submissionId = session?.submissionId ?? null;
  const { scan, error, slow, restart } = useScanPolling(submissionId);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');

  useEffect(() => {
    document.title = 'Hasil Cek Catatan · REKSA';
  }, []);

  const leave = async () => {
    await clear();
    navigate('/belajar');
  };

  // Tanpa sesi, penanda langkah disembunyikan supaya langkah 1 dan 2 tidak tampil "selesai".
  const shell = (content: ReactNode, showSteps = true) => (
    <>
      <AppHeader subtitle="Hasil Cek Catatan" />
      <motion.main {...pageTransition} className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {showSteps && <StepIndicator current={3} />}
        {content}
      </motion.main>
    </>
  );

  if (syncing) return shell(<LoadingBlock label="Memeriksa sesi belajarmu..." />);

  if (!submissionId) {
    return shell(
      <StateBlock
        icon="fact_check"
        title="Belum ada catatan yang dicek"
        action={<ButtonLink to="/belajar" variant="accent">Mulai sesi belajar</ButtonLink>}
      >
        Hasil muncul setelah kamu selesai waktu fokus, menyimpan tebakan nilai, dan mengirim foto catatan.
      </StateBlock>,
      false,
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    return shell(
      <StateBlock
        icon="search_off"
        title="Hasil cek ini tidak ditemukan"
        action={
          <Button variant="accent" onClick={() => void leave()}>
            Kembali ke ruang belajar
          </Button>
        }
      >
        Mungkin kamu masuk dengan akun lain. Mulai sesi baru dari ruang belajar.
      </StateBlock>,
    );
  }

  if (scan?.auditStatus === 'FAILED') {
    const onRetry = async () => {
      setRetrying(true);
      setRetryError('');
      try {
        await scansApi.retry(scan.id);
        restart();
      } catch (err) {
        setRetryError(uploadErrorMessage(err));
      } finally {
        setRetrying(false);
      }
    };
    return shell(
      <StateBlock
        icon="report"
        tone="danger"
        title="Catatanmu belum berhasil dicek"
        action={
          <div className="flex flex-col items-stretch gap-2 sm:flex-row">
            {scan.retriesLeft > 0 && (
              <Button variant="accent" disabled={retrying} onClick={() => void onRetry()}>
                <Icon name="refresh" />
                {retrying ? 'Mengirim ulang...' : `Cek ulang (sisa ${scan.retriesLeft})`}
              </Button>
            )}
            <Button variant="outline" onClick={() => void leave()}>
              Tinggalkan sesi ini
            </Button>
          </div>
        }
      >
        <p>{auditFailureText(scan.errorCode)} Jatah cek hari ini sudah dikembalikan.</p>
        {scan.retriesLeft > 0 ? (
          <p className="mt-2">Foto yang sama bisa dicek ulang tanpa memotret lagi.</p>
        ) : (
          <p className="mt-2">Batas cek ulang untuk foto ini sudah habis. Mulai sesi baru untuk mencoba lagi.</p>
        )}
        {retryError && (
          <p role="alert" className="mt-2 text-on-danger-wash">
            {retryError}
          </p>
        )}
      </StateBlock>,
    );
  }

  if (!scan || scan.auditStatus !== 'DONE' || !scan.result) {
    return shell(
      <StateBlock
        icon={slow ? 'hourglass_top' : 'fact_check'}
        title={slow ? 'Pengecekan lebih lama dari biasanya' : 'Catatanmu sedang dicek'}
        action={
          slow ? (
            <Button variant="outline" onClick={restart}>
              <Icon name="refresh" />
              Periksa lagi
            </Button>
          ) : undefined
        }
      >
        <span aria-live="polite">
          {slow
            ? 'Hasilnya tetap tersimpan. Kamu boleh menutup halaman ini; buka lagi Ruang Belajar nanti untuk melihat hasilnya.'
            : error
              ? 'Koneksi sempat terputus. REKSA terus mencoba memeriksa hasilmu.'
              : 'Pemeriksa membaca tulisan, panah, dan coretanmu. Biasanya selesai dalam beberapa detik.'}
        </span>
        {!slow && (
          <span className="mx-auto mt-4 block size-8 animate-spin rounded-full border-[3px] border-line-soft border-t-teal motion-reduce:animate-none" aria-hidden="true" />
        )}
      </StateBlock>,
    );
  }

  return <AuditResult scan={scan} materialTitle={session?.materialTitle ?? ''} onStartOver={leave} />;
}

function AuditResult({ scan, materialTitle, onStartOver }: { scan: Scan; materialTitle: string; onStartOver: () => Promise<void> }) {
  const { state: speech, toggle: toggleSpeech } = useSpeech();
  const audit = scan.result!;
  // Angka skor berangkat dari 0 lalu bergulir ke nilai asli setelah halaman tampil.
  const [revealed, setRevealed] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const revealTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    revealTimer.current = window.setTimeout(() => setRevealed(true), 350);
    return () => window.clearTimeout(revealTimer.current);
  }, []);

  const guess = scan.predictedJolScore;
  const diff = audit.jolDelta;
  const message = calibrationMessage(guess, audit.actualScore);
  const spokenText = `Nilai catatanmu ${audit.actualScore} persen. Tebakanmu ${guess} persen. ${audit.encouragingSummary} Yang masih terlewat: ${audit.blindSpots
    .map((b) => b.concept)
    .join(', ')}.`;

  const auditedAt = scan.auditedAt ?? scan.createdAt;

  return (
    <>
      <AppHeader subtitle="Hasil Cek Catatan" />
      <motion.main
        {...pageTransition}
        className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8"
      >
        <StepIndicator current={3} />

        <motion.section
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: EASE_OUT }}
          aria-labelledby="calibration-title"
          className="grid gap-6 rounded-lg bg-teal p-6 text-on-teal sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] dark:border dark:border-line dark:bg-teal-wash dark:text-ink">
          <div className="flex flex-col gap-3">
            <h1 id="calibration-title" className="font-display text-headline-lg-mobile sm:text-headline-lg text-balance">
              {message.title}
            </h1>
            <p className="text-body-lg opacity-90 text-pretty">{message.body}</p>
            <p className="text-body-md opacity-90">{materialTitle}</p>
            {/* Visual pembanding; angkanya sudah ada di daftar sebelah, jadi disembunyikan dari pembaca layar. */}
            <div aria-hidden="true" className="flex flex-col gap-2.5 pt-2">
              {[
                { label: 'Tebakan', value: guess, bar: 'bg-on-teal/60 dark:bg-ink-muted' },
                { label: 'Nilai asli', value: audit.actualScore, bar: 'bg-card dark:bg-teal' },
              ].map((row, i) => (
                <div key={row.label} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-label-md">
                  <span className="opacity-90">{row.label}</span>
                  <span className="block h-2.5 overflow-hidden rounded-full bg-on-teal/15 dark:bg-wash-strong">
                    <FillBar value={row.value} className={row.bar} delay={0.4 + i * 0.15} />
                  </span>
                </div>
              ))}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-3 self-center">
            {[
              { label: 'Nilai asli', value: audit.actualScore, big: true },
              { label: 'Tebakanmu', value: guess, big: false },
              { label: 'Selisih', value: diff, big: false },
            ].map((item) => (
              <div key={item.label} className={`flex flex-col gap-1 rounded-md p-4 ${item.big ? 'bg-card text-ink' : 'bg-on-teal/10 dark:bg-card/60'}`}>
                <dt className="text-label-md opacity-90">{item.label}</dt>
                <dd className={`font-mono leading-none tabular-nums ${item.big ? 'text-[44px] text-teal' : 'text-[32px]'}`}>
                  <NumberFlow value={revealed ? item.value : 0} suffix="%" />
                </dd>
              </div>
            ))}
          </dl>
        </motion.section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="flex flex-col gap-6">
            <section aria-labelledby="summary-title" className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="summary-title" className="font-title text-title-lg text-ink">
                  Ringkasan untukmu
                </h2>
                {speech !== 'unsupported' && (
                  <Button variant="outline" onClick={() => toggleSpeech(spokenText)} aria-pressed={speech === 'speaking'}>
                    <Icon name={speech === 'speaking' ? 'stop_circle' : 'volume_up'} />
                    {speech === 'speaking' ? 'Hentikan suara' : 'Bacakan hasil'}
                  </Button>
                )}
              </div>
              <p className="text-body-lg text-ink text-pretty">{audit.encouragingSummary}</p>
              {speech === 'unsupported' && (
                <p className="text-body-sm text-ink-muted">Browser ini belum bisa membacakan teks. Ringkasan tetap bisa dibaca di atas.</p>
              )}
              {speech === 'error' && (
                <p role="alert" className="text-body-sm text-danger">
                  Suara gagal diputar. Pilih suara Bahasa Indonesia di pengaturan perangkat, lalu coba lagi.
                </p>
              )}
            </section>

            {audit.blindSpots.length > 0 && (
            <section aria-labelledby="blindspots-title" className="flex flex-col gap-3">
              <h2 id="blindspots-title" className="font-headline text-headline-md text-ink">
                Yang masih terlewat ({audit.blindSpots.length})
              </h2>
              <Stagger as="ul" className="flex flex-col gap-3">
                {audit.blindSpots.map((spot) => (
                  <StaggerItem as="li" key={spot.concept} className="flex flex-col gap-2 rounded-md border border-line-soft bg-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-title text-title-md text-ink">{spot.concept}</h3>
                      <span className={`rounded-full px-2.5 py-0.5 text-label-md ${IMPORTANCE[spot.importanceLevel].className}`}>
                        {IMPORTANCE[spot.importanceLevel].label}
                      </span>
                    </div>
                    <p className="text-body-md text-ink-muted text-pretty">{spot.explanation}</p>
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
            )}

            {audit.accurateConcepts.length > 0 && (
            <section aria-labelledby="accurate-title" className="flex flex-col gap-3">
              <h2 id="accurate-title" className="font-headline text-headline-md text-ink">
                Yang sudah tepat
              </h2>
              <Stagger as="ul" className="flex flex-col gap-3">
                {audit.accurateConcepts.map((c) => (
                  <StaggerItem as="li" key={c.concept} className="flex flex-col gap-2 rounded-md border border-line-soft bg-card p-5">
                    <h3 className="flex items-center gap-2 font-title text-title-md text-ink">
                      <Icon name="check_circle" fill className="text-teal" />
                      {c.concept}
                    </h3>
                    <blockquote className="ruled-sheet rounded-sm border border-line-soft py-1 pr-4 pl-12 text-body-md leading-7 text-ink">
                      <span className="sr-only">Di catatanmu: </span>
                      {c.evidenceFromHandwriting}
                    </blockquote>
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
            )}

            {audit.logicCorrections.length > 0 && (
              <section aria-labelledby="corrections-title" className="flex flex-col gap-3">
                <h2 id="corrections-title" className="font-headline text-headline-md text-ink">
                  Perlu diluruskan
                </h2>
                <Stagger as="ul" className="flex flex-col gap-3">
                  {audit.logicCorrections.map((c) => (
                    <StaggerItem as="li" key={c.studentStatement} className="grid gap-3 rounded-md border border-line-soft bg-card p-5 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-label-md text-ink-muted">Kamu menulis</span>
                        <p className="text-body-md text-ink line-through decoration-danger/60">{c.studentStatement}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-label-md text-teal">Seharusnya</span>
                        <p className="text-body-md text-ink">{c.correction}</p>
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
              </section>
            )}
          </div>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-24">
            {audit.blindSpots.length > 0 ? (
              <section aria-labelledby="schedule-title" className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
                <h2 id="schedule-title" className="flex items-center gap-2 font-title text-title-lg text-ink">
                  <Icon name="event_repeat" className="text-teal" />
                  Rencana latihan ulang
                </h2>
                <p className="text-body-md text-ink-muted">Latihan singkat 3 sampai 5 menit khusus untuk bagian yang terlewat.</p>
                <Stagger as="ol" className="flex flex-col gap-3">
                  {[3, 7].map((day) => (
                    <StaggerItem as="li" key={day} className="flex items-center gap-4 rounded-md bg-wash px-4 py-3">
                      <span className="font-mono text-mono-md text-teal tabular-nums">H+{day}</span>
                      <span className="text-body-md text-ink">{reviewDate(auditedAt, day)}</span>
                    </StaggerItem>
                  ))}
                </Stagger>
                <p className="text-body-sm text-ink-muted">
                  Jadwal ini sudah tersimpan. Saat jatuh tempo, latihannya muncul di menu{' '}
                  <Link to="/belajar/ulang" className="text-teal underline underline-offset-2">
                    Ulang
                  </Link>
                  .
                </p>
              </section>
            ) : (
              <section className="flex items-start gap-3 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
                <Icon name="celebration" className="text-teal" />
                <p className="text-body-md text-ink">Tidak ada konsep yang terlewat, jadi tidak perlu latihan ulang untuk materi ini.</p>
              </section>
            )}

            <figure className="overflow-hidden rounded-lg border border-line-soft bg-card">
              <img src={scan.imageUrl} alt="Foto catatan yang dicek untuk sesi ini" className="max-h-64 w-full bg-wash object-contain" />
              <figcaption className="px-4 py-2.5 text-body-sm text-ink-muted">Foto catatanmu, tanpa info lokasi dan kamera</figcaption>
            </figure>

            <Button variant="accent" size="lg" onClick={() => setConfirmNew(true)}>
              Mulai sesi belajar baru
            </Button>
          </aside>
        </div>
      </motion.main>

      <ConfirmDialog
        open={confirmNew}
        icon="note_add"
        title="Mulai sesi belajar baru?"
        confirmLabel="Ya, mulai baru"
        cancelLabel="Tetap di hasil"
        onCancel={() => setConfirmNew(false)}
        onConfirm={() => void onStartOver()}
      >
        Hasil ini tetap tersimpan di akunmu, termasuk jadwal latihan ulang. Layar ini akan kembali ke pemilihan materi.
      </ConfirmDialog>
    </>
  );
}
