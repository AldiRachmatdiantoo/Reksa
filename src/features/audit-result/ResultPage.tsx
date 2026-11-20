import NumberFlow from '@number-flow/react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpeech } from '@/shared/hooks/useSpeech';
import { EASE_OUT, FillBar, pageTransition, Stagger, StaggerItem } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Icon } from '@/shared/ui/Icon';
import { StateBlock } from '@/shared/ui/StateBlock';
import { SAMPLE_MATERIAL } from '@/features/studio/sampleMaterial';
import { StepIndicator } from '@/features/studio/StepIndicator';
import { useStudySession } from '@/features/studio/studySession';
import { SAMPLE_AUDIT, type ImportanceLevel } from './sampleAudit';

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

function reviewDate(daysFromNow: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function ResultPage() {
  const navigate = useNavigate();
  const { session, photoUrl, clear } = useStudySession();
  const { state: speech, toggle: toggleSpeech } = useSpeech();
  const audit = SAMPLE_AUDIT;
  // Angka skor berangkat dari 0 lalu bergulir ke nilai asli setelah halaman tampil.
  const [revealed, setRevealed] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), 350);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    document.title = 'Hasil Cek Catatan · REKSA';
  }, []);

  if (!session || session.jolScore == null || session.photo == null) {
    return (
      <>
        <AppHeader subtitle="Hasil Cek Catatan" />
        <motion.main {...pageTransition} className="px-4 py-16">
          <StateBlock
            icon="fact_check"
            title="Belum ada catatan yang dicek"
            action={<ButtonLink to="/belajar" variant="accent">Mulai sesi belajar</ButtonLink>}
          >
            Hasil muncul setelah kamu selesai waktu fokus, menyimpan tebakan nilai, dan memilih foto catatan.
          </StateBlock>
        </motion.main>
      </>
    );
  }

  const guess = session.jolScore;
  const diff = Math.abs(guess - audit.actualScore);
  const message = calibrationMessage(guess, audit.actualScore);
  const spokenText = `Nilai catatanmu ${audit.actualScore} persen. Tebakanmu ${guess} persen. ${audit.encouragingSummary} Yang masih terlewat: ${audit.blindSpots
    .map((b) => b.concept)
    .join(', ')}.`;

  const startOver = () => {
    clear();
    navigate('/belajar');
  };

  return (
    <>
      <AppHeader subtitle="Hasil Cek Catatan" />
      <motion.main
        {...pageTransition}
        className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8"
      >
        <StepIndicator current={3} />

        <p role="note" className="flex items-start gap-2.5 rounded-md border border-line bg-wash px-4 py-3 text-body-md text-ink">
          <Icon name="science" className="mt-px text-teal" />
          <span>
            <strong>Hasil contoh.</strong> Nilai dan catatan di bawah memakai data contoh yang sama dengan backend, bukan hasil membaca fotomu.
            Pengecekan foto asli aktif setelah modul pindai selesai.
          </span>
        </p>

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
            <p className="text-body-md opacity-90">{SAMPLE_MATERIAL.title}</p>
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
                    <span className="text-body-md text-ink">{reviewDate(day)}</span>
                  </StaggerItem>
                ))}
              </Stagger>
              <p className="text-body-sm text-ink-muted">Pengingat otomatis aktif setelah modul jadwal ulang selesai.</p>
            </section>

            {photoUrl && (
              <figure className="overflow-hidden rounded-lg border border-line-soft bg-card">
                <img src={photoUrl} alt="Foto catatan yang kamu pilih untuk sesi ini" className="max-h-64 w-full bg-wash object-contain" />
                <figcaption className="px-4 py-2.5 text-body-sm text-ink-muted">Foto catatanmu (hanya tersimpan di perangkat ini)</figcaption>
              </figure>
            )}

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
        onConfirm={startOver}
      >
        Hasil ini, tebakan nilaimu, dan foto catatan akan dihapus dari perangkat ini. Jadwal latihan ulang belum tersimpan di server.
      </ConfirmDialog>
    </>
  );
}
