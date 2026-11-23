import NumberFlow, { NumberFlowGroup } from '@number-flow/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useCelebrate } from '@/shared/mascot/celebration';
import { focusDonePraise } from '@/shared/mascot/praise';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '@/core/apiClient';
import { formatMaterialDate, openMaterialPdf, useMaterial, useMaterials, type Material } from '@/features/materials/materialsApi';
import { useNow } from '@/shared/hooks/useNow';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { EASE_OUT, pageTransition, Reveal, Stagger, StaggerItem } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock, StateBlock } from '@/shared/ui/StateBlock';
import { StepIndicator } from './StepIndicator';
import { sessionErrorMessage } from './sessionsApi';
import { ActiveSessionConflict, formatDuration, useStudySession, type StudySession } from './studySession';

const PRESETS = [
  { minutes: 25, label: 'Biasa' },
  { minutes: 45, label: 'Lama' },
  { minutes: 15, label: 'Cepat' },
];

const TWO_DIGITS = { minimumIntegerDigits: 2 } as const;
const SELECT_CLASS = 'min-h-12 w-full rounded-[12px] border border-line bg-card px-4 text-body-lg text-ink';

export function StudioPage() {
  const { session, clear, syncing } = useStudySession();
  const { state } = useMaterial(session?.materialId ?? null);

  useEffect(() => {
    document.title = 'Ruang Belajar · REKSA';
  }, []);

  // Tahap fokus sudah lewat menurut server: lanjutkan di halaman yang tepat.
  if (session?.submissionId) return <Navigate to="/belajar/hasil" replace />;
  if (session?.status === 'AWAITING_SCAN') return <Navigate to="/belajar/foto" replace />;

  let body: ReactNode = null;
  if (syncing) {
    body = <LoadingBlock label="Memeriksa sesi belajarmu..." />;
  } else if (session?.status === 'EXPIRED' || session?.status === 'COMPLETED') {
    const expired = session.status === 'EXPIRED';
    body = (
      <StateBlock
        icon={expired ? 'timer_off' : 'task_alt'}
        title={expired ? 'Sesi sebelumnya sudah kedaluwarsa' : 'Sesi sebelumnya sudah selesai'}
        action={
          <Button variant="accent" onClick={() => void clear()}>
            Mulai sesi baru
          </Button>
        }
      >
        {expired
          ? 'Waktu fokus tidak diakhiri dalam batas waktunya, atau foto tidak dikirim dalam 2 jam. Tidak apa-apa, mulai lagi saja.'
          : 'Pilih materi untuk sesi berikutnya.'}
      </StateBlock>
    );
  } else if (!session) {
    body = <MaterialPicker />;
  } else if (state.status === 'loading') {
    body = <LoadingBlock label="Memuat materi..." />;
  } else if (state.status === 'error') {
    const gone = state.error instanceof ApiError && state.error.status === 404;
    body = (
      <StateBlock
        icon={gone ? 'folder_off' : 'cloud_off'}
        tone="danger"
        title={gone ? 'Materi ini sudah dihapus' : 'Materi gagal dimuat'}
        action={
          gone ? (
            <Button variant="accent" onClick={clear}>
              Pilih materi lain
            </Button>
          ) : (
            <Button variant="outline" onClick={() => window.location.reload()}>
              Muat ulang
            </Button>
          )
        }
      >
        {gone ? `"${session.materialTitle}" tidak ada lagi di daftar materimu.` : 'Periksa koneksimu, lalu muat ulang halaman.'}
      </StateBlock>
    );
  } else if (state.data) {
    body = <FocusSession material={state.data} />;
  }

  return (
    <>
      <AppHeader subtitle="Ruang Belajar" />
      <motion.main {...pageTransition} className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <StepIndicator current={1} />
        {body}
      </motion.main>
    </>
  );
}

/** Belum ada sesi: pilih materi tersimpan, atau tambah materi baru. */
function MaterialPicker() {
  const { selectMaterial } = useStudySession();
  const { state, reload } = useMaterials();

  return (
    <section aria-labelledby="picker-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 id="picker-title" className="font-headline text-headline-lg-mobile text-ink sm:text-headline-md">
            Mau belajar materi apa?
          </h1>
          <p className="text-body-lg text-ink-muted text-pretty">Pilih satu materi. Baca dulu, lalu tulis ulang dari ingatan di kertas.</p>
        </div>
        <ButtonLink to="/belajar/materi" variant="outline">
          <Icon name="add" />
          Tambah materi
        </ButtonLink>
      </div>

      {state.status === 'loading' && <LoadingBlock label="Memuat materi..." />}
      {state.status === 'error' && (
        <StateBlock
          icon="cloud_off"
          tone="danger"
          title="Daftar materi gagal dimuat"
          action={
            <Button variant="outline" onClick={reload}>
              Coba lagi
            </Button>
          }
        >
          Periksa koneksimu, lalu coba lagi.
        </StateBlock>
      )}
      {state.status === 'ready' && state.data.length === 0 && (
        <StateBlock
          icon="menu_book"
          title="Belum ada materi"
          action={
            <ButtonLink to="/belajar/materi" variant="accent">
              Tambah materi pertama
            </ButtonLink>
          }
        >
          Tempel teks atau unggah PDF bab yang mau kamu pelajari. REKSA menyusun konsep kuncinya untukmu.
        </StateBlock>
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <Stagger as="ul" trigger="mount" gap={0.05} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.data.map((m) => (
            <StaggerItem as="li" key={m.id}>
              <button
                type="button"
                onClick={() => selectMaterial(m.id, m.title, m.classId)}
                className="group flex h-full w-full flex-col gap-2 rounded-md border border-line-soft bg-card p-4 text-left transition-colors hover:border-teal"
              >
                <span className="flex items-center gap-2 text-body-sm text-ink-muted">
                  <Icon name={m.source === 'PDF' ? 'picture_as_pdf' : 'notes'} className="text-[18px] text-teal" />
                  {m.conceptCount} konsep · {formatMaterialDate(m.createdAt)}
                </span>
                <span className="text-title-md text-ink">{m.title}</span>
                <span className="mt-auto inline-flex items-center gap-1 pt-1 text-label-lg text-teal">
                  Pakai materi ini
                  <Icon
                    name="arrow_forward"
                    className="text-[18px] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                </span>
              </button>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}

function FocusSession({ material }: { material: Material }) {
  const navigate = useNavigate();
  const { session, start, resume, replaceActive, setPreset, finishFocus, resetTimer, clear } = useStudySession();
  const [confirm, setConfirm] = useState<'reset' | 'new' | null>(null);
  const [conflictId, setConflictId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const online = useOnlineStatus();

  /** Menjalankan aksi server dengan status sibuk dan pesan error yang ramah. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      if (err instanceof ActiveSessionConflict) setConflictId(err.activeSessionId);
      else setError(sessionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const preset = session?.presetMinutes ?? 25;
  const running = session?.startedAt != null && session.focusSeconds == null && session.status === 'FOCUS_ACTIVE';
  const finished = session?.focusSeconds != null;
  const now = useNow(running);

  const totalSeconds = preset * 60;
  const elapsed = running && session?.startedAt ? Math.min(totalSeconds, Math.floor((now - session.startedAt) / 1000)) : 0;
  const remaining = totalSeconds - elapsed;
  const timeUp = running && remaining === 0;
  const celebrate = useCelebrate();
  // Sekali per sesi, tepat saat timer menyentuh nol (bukan saat membuka lagi sesi yang waktunya sudah habis).
  const sawCountdown = useRef(false);
  useEffect(() => {
    if (running && remaining > 0) sawCountdown.current = true;
    if (timeUp && sawCountdown.current) {
      sawCountdown.current = false;
      celebrate(focusDonePraise(preset));
    }
  }, [running, remaining, timeUp, preset, celebrate]);

  const onFinish = () => {
    finishFocus(Math.max(elapsed, 1));
    navigate('/belajar/foto');
  };

  const isReview = session?.sessionType === 'SPACED_REVIEW';
  const concepts = session?.reviewConcepts ?? [];
  const status = timeUp ? 'Waktu fokus habis. Kerja bagus!' : running ? 'Waktunya menulis di kertas' : 'Siap mulai catat di kertas';

  return (
    <>
      {finished ? (
        <Reveal className="ruled-sheet flex flex-col gap-4 rounded-lg border border-line-soft p-6 pl-12 sm:p-8 sm:pl-14">
          <h1 className="font-headline text-headline-md text-ink">Waktu fokus sudah tercatat</h1>
          <p className="text-body-lg text-ink-muted">
            Kamu fokus menulis <MaterialNames material={material} second={session?.secondMaterial} /> selama{' '}
            <strong className="text-ink">{formatDuration(session!.focusSeconds!)}</strong>. Lanjutkan dengan menebak nilaimu lalu memotret
            catatan.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="accent" size="lg" onClick={() => navigate('/belajar/foto')}>
              Lanjut tebak nilai
            </Button>
            <Button variant="outline" size="lg" onClick={() => setConfirm('new')}>
              Mulai sesi baru
            </Button>
          </div>
        </Reveal>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <section aria-labelledby="material-title" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 id="material-title" className="font-headline text-headline-lg-mobile text-ink sm:text-headline-md">
                {isReview ? 'Latihan ulang' : 'Bahan bacaanmu'}
              </h1>
              {!running && (
                <ButtonLink to="/belajar/materi" variant="ghost" className="px-3">
                  <Icon name="swap_horiz" />
                  Ganti materi
                </ButtonLink>
              )}
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
                  <Icon name={isReview ? 'event_repeat' : 'lock'} className="text-[36px] text-teal" />
                  <h2 className="font-title text-title-lg text-ink">
                    {isReview ? 'Tulis ulang dari ingatan' : 'Bacaan ditutup sementara'}
                  </h2>
                  {isReview ? (
                    <>
                      <p className="max-w-sm text-body-md text-ink-muted">
                        Jelaskan konsep {concepts.length > 0 ? 'berikut' : 'yang terlewat'} dari{' '}
                        <strong className="text-ink">{material.title}</strong> dengan kata-katamu sendiri. Hanya konsep ini yang dicek.
                      </p>
                      {concepts.length > 0 && (
                        <ul className="flex flex-wrap justify-center gap-2">
                          {concepts.map((c) => (
                            <li key={c} className="rounded-md bg-card px-3 py-1.5 text-body-md text-ink">
                              {c}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="max-w-sm text-body-md text-ink-muted">
                      Tulis semua yang kamu ingat tentang <MaterialNames material={material} second={session?.secondMaterial} /> di kertas.{' '}
                      {session?.secondMaterial ? 'Tulis bergantian atau campur, asal jelas konsep mana milik materi mana. ' : ''}
                      Bacaan terbuka lagi kalau kamu menekan Ulangi.
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="open"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-4"
                >
                  <MaterialArticle material={material} />
                  {!isReview && session && <InterleavePicker session={session} />}
                </motion.div>
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
                          onChange={() => setPreset(p.minutes)}
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

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
                <Icon name="error" className="mt-px text-[20px]" />
                {error}
              </p>
            )}

            {running ? (
              <div className="flex flex-col gap-2">
                <Button variant="accent" size="lg" onClick={onFinish}>
                  Selesai, lanjut tebak nilai
                </Button>
                {isReview ? (
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirm('new')}>
                    <Icon name="close" />
                    Batalkan latihan
                  </Button>
                ) : (
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirm('reset')}>
                    <Icon name="restart_alt" />
                    Ulangi dan buka bacaan
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  variant="accent"
                  size="lg"
                  disabled={busy || !online}
                  aria-describedby={online ? undefined : 'start-offline-hint'}
                  onClick={() => void run(start)}
                >
                  <Icon name="play_arrow" fill />
                  {busy ? 'Menyiapkan sesi...' : 'Mulai waktu fokus'}
                </Button>
                {!online && (
                  <p id="start-offline-hint" className="text-body-sm text-ink-muted">
                    Mulai sesi butuh koneksi karena waktu mulainya dicatat server. Setelah mulai, timer, tebakan, dan foto tetap jalan walau
                    koneksi putus.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'reset'}
        icon="restart_alt"
        title="Ulangi waktu fokus?"
        confirmLabel="Ya, ulangi"
        cancelLabel="Lanjut fokus"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void run(resetTimer);
        }}
      >
        Waktu yang sudah berjalan ({formatDuration(elapsed)}) akan dihapus dan bacaan dibuka lagi. Catatan di kertasmu tidak terpengaruh.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'new'}
        icon="note_add"
        title="Mulai sesi baru?"
        confirmLabel="Ya, mulai baru"
        cancelLabel="Batal"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void run(async () => {
            await clear();
            if (isReview) navigate('/belajar/ulang');
          });
        }}
      >
        {isReview
          ? 'Latihan ini dibatalkan dan jadwalnya tetap terbuka di menu Ulang. Satu jadwal bisa dicoba paling banyak 3 kali.'
          : 'Sesi ini dibatalkan dan waktu fokus yang tercatat tidak dipakai. Kamu bisa memilih materi lagi setelahnya.'}
      </ConfirmDialog>
      <ConfirmDialog
        open={conflictId !== null}
        icon="pending_actions"
        title="Masih ada sesi yang belum selesai"
        confirmLabel="Batalkan sesi itu, mulai baru"
        cancelLabel="Lanjutkan sesi itu"
        onCancel={() => {
          const id = conflictId!;
          setConflictId(null);
          void run(() => resume(id));
        }}
        onConfirm={() => {
          const id = conflictId!;
          setConflictId(null);
          void run(() => replaceActive(id));
        }}
      >
        Kamu punya sesi belajar lain yang masih berjalan, mungkin dari tab atau perangkat lain. Satu akun hanya boleh punya satu sesi aktif.
      </ConfirmDialog>
    </>
  );
}

/** "A" atau "A dan B" dengan penekanan, untuk kalimat di layar fokus. */
function MaterialNames({ material, second }: { material: Material; second?: StudySession['secondMaterial'] }) {
  return (
    <>
      <strong className="text-ink">{material.title}</strong>
      {second && (
        <>
          {' '}
          dan <strong className="text-ink">{second.title}</strong>
        </>
      )}
    </>
  );
}

function MaterialArticle({ material }: { material: Material }) {
  return (
    <article className="flex flex-col gap-5 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-title text-title-lg text-ink">{material.title}</h2>
          {material.source === 'PDF' && <OpenPdfButton materialId={material.id} />}
        </div>
        <p className="text-body-md text-ink-muted text-pretty">{material.rubric.summary}</p>
      </header>
      <Stagger
        as="dl"
        trigger="mount"
        gap={0.06}
        delay={0.15}
        className="flex flex-col divide-y divide-line-soft border-t border-line-soft"
      >
        {material.rubric.keyConcepts.map((c) => (
          <StaggerItem key={c.id} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-title-md text-teal">{c.concept}</dt>
            <dd className="text-body-md text-ink">{c.definition}</dd>
          </StaggerItem>
        ))}
      </Stagger>
    </article>
  );
}

/**
 * PDF asli untuk dibaca utuh. Hanya muncul saat bacaan terbuka: selama waktu fokus berjalan MaterialArticle tidak
 * dirender, jadi tombol ini ikut tersembunyi dan latihan tulis dari ingatan tetap jujur.
 */
function OpenPdfButton({ materialId }: { materialId: string }) {
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    setFailed(false);
    setOpening(true);
    setFailed(!(await openMaterialPdf(materialId)));
    setOpening(false);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={open} disabled={opening} aria-busy={opening}>
        <Icon name="picture_as_pdf" />
        {opening ? 'Membuka PDF...' : 'Buka PDF asli'}
      </Button>
      {failed && (
        <p role="alert" className="text-body-sm text-danger">
          PDF gagal dibuka. Coba lagi.
        </p>
      )}
    </div>
  );
}

/**
 * F3 interleaving: sebelum waktu fokus dimulai, pelajar boleh mencampur satu materi lain. Bacaan kedua tampil
 * di bawah bacaan pertama, keduanya ditutup bersama, dan hasil cek menilai konsep dari kedua materi.
 */
function InterleavePicker({ session }: { session: StudySession }) {
  const { setSecondMaterial } = useStudySession();
  const { state } = useMaterials();
  const secondId = session.secondMaterial?.id ?? null;
  const second = useMaterial(secondId);
  const others = state.status === 'ready' ? state.data.filter((m) => m.id !== session.materialId) : [];

  // Materi kedua yang sudah dihapus atau tidak terbaca lagi dilepas, supaya sesi tetap bisa dimulai.
  const secondGone = second.state.status === 'error';
  useEffect(() => {
    if (secondGone) setSecondMaterial(null);
  }, [secondGone, setSecondMaterial]);

  if (state.status !== 'ready' || others.length === 0) return null;

  return (
    <>
      <section aria-labelledby="interleave-title" className="flex flex-col gap-3 rounded-lg border border-line-soft bg-wash p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="interleave-title" className="font-title text-title-md text-ink">
            Campur dengan materi lain
          </h2>
          <p className="text-body-md text-ink-muted text-pretty">
            Belajar dua topik sekaligus melatihmu membedakan konsep yang mirip. Catatanmu dicek terhadap konsep kedua materi, dan bagian
            yang terlewat dijadwalkan ulang di materinya masing-masing.
          </p>
        </div>
        <label htmlFor="second-material" className="text-label-lg text-ink">
          Materi kedua
        </label>
        <select
          id="second-material"
          value={secondId ?? ''}
          onChange={(e) => {
            const picked = others.find((m) => m.id === e.target.value);
            setSecondMaterial(picked ? { id: picked.id, title: picked.title } : null);
          }}
          className={SELECT_CLASS}
        >
          <option value="">Tidak, satu materi saja</option>
          {others.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </section>
      {secondId && second.state.status === 'loading' && <LoadingBlock label="Memuat materi kedua..." />}
      {second.state.status === 'ready' && second.state.data && <MaterialArticle material={second.state.data} />}
    </>
  );
}
