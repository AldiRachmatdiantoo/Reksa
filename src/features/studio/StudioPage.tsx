import NumberFlow, { NumberFlowGroup } from '@number-flow/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNow } from '@/shared/hooks/useNow';
import { EASE_OUT, pageTransition, Reveal, Stagger, StaggerItem } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { SAMPLE_MATERIAL } from './sampleMaterial';
import { StepIndicator } from './StepIndicator';
import { formatDuration, useStudySession } from './studySession';

const PRESETS = [
  { minutes: 25, label: 'Biasa' },
  { minutes: 45, label: 'Lama' },
  { minutes: 15, label: 'Cepat' },
];

const TWO_DIGITS = { minimumIntegerDigits: 2 } as const;

export function StudioPage() {
  const navigate = useNavigate();
  const { session, start, setPreset, finishFocus, resetTimer, clear } = useStudySession();
  const material = SAMPLE_MATERIAL;

  const preset = session?.presetMinutes ?? 25;
  const running = session?.startedAt != null && session.focusSeconds == null;
  const finished = session?.focusSeconds != null;
  const now = useNow(running);

  const totalSeconds = preset * 60;
  const elapsed = running && session?.startedAt ? Math.min(totalSeconds, Math.floor((now - session.startedAt) / 1000)) : 0;
  const remaining = totalSeconds - elapsed;
  const timeUp = running && remaining === 0;

  useEffect(() => {
    document.title = 'Ruang Belajar · REKSA';
  }, []);

  const onFinish = () => {
    finishFocus(Math.max(elapsed, 1));
    navigate('/belajar/foto');
  };

  const status = timeUp
    ? 'Waktu fokus habis. Kerja bagus!'
    : running
      ? 'Waktunya menulis di kertas'
      : 'Siap mulai catat di kertas';

  return (
    <>
      <AppHeader subtitle="Ruang Belajar" />
      <motion.main
        {...pageTransition}
        className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8"
      >
        <StepIndicator current={1} />

        {finished ? (
          <Reveal className="ruled-sheet flex flex-col gap-4 rounded-lg border border-line-soft p-6 pl-12 sm:p-8 sm:pl-14">
            <h1 className="font-headline text-headline-md text-ink">Waktu fokus sudah tercatat</h1>
            <p className="text-body-lg text-ink-muted">
              Kamu fokus menulis selama <strong className="text-ink">{formatDuration(session!.focusSeconds!)}</strong>. Lanjutkan
              dengan menebak nilaimu lalu memotret catatan.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="accent" size="lg" onClick={() => navigate('/belajar/foto')}>
                Lanjut tebak nilai
              </Button>
              <Button variant="outline" size="lg" onClick={clear}>
                Mulai sesi baru
              </Button>
            </div>
          </Reveal>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <section aria-labelledby="material-title" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 id="material-title" className="font-headline text-headline-lg-mobile text-ink sm:text-headline-md">
                  Bahan bacaanmu
                </h1>
                {/* Status nyata: materi ini contoh, bukan unggahan user. */}
                <span className="rounded-full bg-wash-strong px-3 py-1 text-label-md text-ink-muted">Materi contoh</span>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {running ? (
                  <motion.div
                    key="locked"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-line bg-wash px-6 py-14 text-center"
                  >
                    <Icon name="lock" className="text-[36px] text-teal" />
                    <h2 className="font-title text-title-lg text-ink">Bacaan ditutup sementara</h2>
                    <p className="max-w-sm text-body-md text-ink-muted">
                      Tulis semua yang kamu ingat tentang <strong className="text-ink">{material.title}</strong> di kertas. Bacaan
                      terbuka lagi kalau kamu menekan Ulangi.
                    </p>
                  </motion.div>
                ) : (
                  <motion.article
                    key="open"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-5 rounded-lg border border-line-soft bg-card p-5 sm:p-6"
                  >
                    <header className="flex flex-col gap-2">
                      <h2 className="font-title text-title-lg text-ink">{material.title}</h2>
                      <p className="text-body-md text-ink-muted text-pretty">{material.summary}</p>
                    </header>
                    <Stagger as="dl" trigger="mount" gap={0.06} delay={0.15} className="flex flex-col divide-y divide-line-soft border-t border-line-soft">
                      {material.keyConcepts.map((c) => (
                        <StaggerItem key={c.id} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                          <dt className="text-title-md text-teal">{c.concept}</dt>
                          <dd className="text-body-md text-ink">{c.definition}</dd>
                        </StaggerItem>
                      ))}
                    </Stagger>
                    <p className="text-body-sm text-ink-muted">
                      Unggah PDF materimu sendiri akan tersedia setelah modul materi selesai.
                    </p>
                  </motion.article>
                )}
              </AnimatePresence>
            </section>

            <section
              aria-labelledby="timer-status"
              className="ruled-sheet flex flex-col gap-5 rounded-lg border border-line-soft p-5 pl-12 sm:p-6 sm:pl-14 lg:sticky lg:top-24"
            >
              <h2 id="timer-status" className="font-title text-title-lg text-ink" aria-live="polite">
                {status}
              </h2>

              {!running && (
                <fieldset>
                  <legend className="mb-2 text-label-lg text-ink">Pilih lama fokus</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESETS.map((p) => {
                      const checked = preset === p.minutes;
                      return (
                        <label
                          key={p.minutes}
                          className={`relative flex min-h-14 flex-col items-center justify-center rounded-md border-2 px-2 py-2 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal ${
                            checked ? 'border-transparent text-teal' : 'border-line-soft bg-card text-ink hover:border-line'
                          }`}
                        >
                          {checked && (
                            <motion.span
                              layoutId="preset-indicator"
                              aria-hidden="true"
                              className="absolute -inset-0.5 rounded-md border-2 border-teal bg-teal-wash"
                              transition={{ type: 'spring', stiffness: 210, damping: 18 }}
                            />
                          )}
                          <input
                            type="radio"
                            name="preset"
                            value={p.minutes}
                            checked={checked}
                            onChange={() => setPreset(material.id, p.minutes)}
                            className="sr-only"
                          />
                          <span className="relative font-mono text-mono-md tabular-nums">{p.minutes} mnt</span>
                          <span className="relative text-label-sm text-ink-muted">{p.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <div role="timer" aria-label={`Sisa waktu ${Math.ceil(remaining / 60)} menit`} className="py-2 text-center">
                <NumberFlowGroup>
                  <div
                    aria-hidden="true"
                    className={`font-mono text-[64px] leading-none tabular-nums sm:text-[80px] ${timeUp ? 'text-ember-ink' : 'text-ink'}`}
                  >
                    <NumberFlow value={Math.floor(remaining / 60)} format={TWO_DIGITS} trend={-1} />
                    <span className="px-1 text-ink-muted">:</span>
                    <NumberFlow value={remaining % 60} format={TWO_DIGITS} trend={-1} digits={{ 1: { max: 5 } }} />
                  </div>
                </NumberFlowGroup>
                <AnimatePresence initial={false}>
                  {running && (
                    <motion.div
                      initial={{ opacity: 0, scaleX: 0.6 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: EASE_OUT }}
                      aria-hidden="true"
                      className="mt-5 h-1.5 overflow-hidden rounded-full bg-wash-strong"
                    >
                      <motion.div
                        className={`h-full rounded-full ${timeUp ? 'bg-ember' : 'bg-teal'}`}
                        initial={false}
                        animate={{ width: `${(elapsed / totalSeconds) * 100}%` }}
                        transition={{ duration: 1, ease: 'linear' }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <p className="text-body-md text-ink-muted text-pretty">
                {running
                  ? 'Boleh pakai singkatan, panah, atau coretan bebas. Yang dinilai idemu, bukan kerapian tulisan.'
                  : 'Siapkan kertas dan pulpen. Saat waktu mulai, bacaan ditutup supaya kamu berlatih mengingat sendiri.'}
              </p>

              {running ? (
                <div className="flex flex-col gap-2">
                  <Button variant="accent" size="lg" onClick={onFinish}>
                    Selesai, lanjut tebak nilai
                  </Button>
                  <Button variant="ghost" onClick={resetTimer}>
                    <Icon name="restart_alt" />
                    Ulangi dan buka bacaan
                  </Button>
                </div>
              ) : (
                <Button variant="accent" size="lg" onClick={() => start(material.id, preset)}>
                  <Icon name="play_arrow" fill />
                  Mulai waktu fokus
                </Button>
              )}
            </section>
          </div>
        )}
      </motion.main>
    </>
  );
}
