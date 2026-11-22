import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { sessionErrorMessage } from '@/features/studio/sessionsApi';
import { useLoad } from '@/shared/hooks/useLoad';
import { pageTransition, Stagger, StaggerItem } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { StateBlock } from '@/shared/ui/StateBlock';
import { StepIndicator } from '@/features/studio/StepIndicator';
import { formatDuration, useStudySession } from '@/features/studio/studySession';
import { QrBridgePanel } from './QrBridgePanel';
import { PHOTO_PRIVACY_TIP, photoProblem, quotaText, SCAN_ACCEPT, scansApi, uploadErrorMessage } from './scansApi';

function confidenceLabel(v: number) {
  if (v < 40) return 'Masih ragu';
  if (v < 70) return 'Lumayan paham';
  return 'Cukup yakin';
}

function formatBytes(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function CalibratePage() {
  const navigate = useNavigate();
  const { session, syncing, photoUrl, photoFile, saveJol, setPhoto, setSubmission, clear } = useStudySession();
  const [guess, setGuess] = useState(session?.jolScore ?? 50);
  const [photoError, setPhotoError] = useState('');
  const [jolError, setJolError] = useState('');
  const [savingJol, setSavingJol] = useState(false);
  const [sending, setSending] = useState(false);
  const [useQr, setUseQr] = useState(false);
  const { state: quota } = useLoad((signal) => scansApi.quota(signal), []);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [coarsePointer] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);

  useEffect(() => {
    document.title = 'Tebak & Foto · REKSA';
  }, []);

  if (session?.submissionId) return <Navigate to="/belajar/hasil" replace />;

  if (syncing) {
    return (
      <>
        <AppHeader subtitle="Tebak & Foto" />
        <motion.main {...pageTransition} className="px-4 py-16">
          <StateBlock icon="sync" title="Memeriksa sesi belajarmu...">
            Sebentar, ya.
          </StateBlock>
        </motion.main>
      </>
    );
  }

  if (session?.status === 'EXPIRED') {
    return (
      <>
        <AppHeader subtitle="Tebak & Foto" />
        <motion.main {...pageTransition} className="px-4 py-16">
          <StateBlock
            icon="timer_off"
            title="Sesi ini sudah kedaluwarsa"
            action={
              <Button variant="accent" onClick={() => void clear().then(() => navigate('/belajar'))}>
                Mulai sesi baru
              </Button>
            }
          >
            Waktu fokus tidak diakhiri dalam batas waktunya, atau foto tidak dikirim dalam 2 jam setelah tebakan disimpan.
          </StateBlock>
        </motion.main>
      </>
    );
  }

  if (!session || (session.focusSeconds == null && session.status !== 'AWAITING_SCAN')) {
    return (
      <>
        <AppHeader subtitle="Tebak & Foto" />
        <motion.main {...pageTransition} className="px-4 py-16">
          <StateBlock
            icon="timer"
            title="Mulai dari waktu fokus dulu"
            action={
              <ButtonLink to="/belajar" variant="accent">
                Buka ruang belajar
              </ButtonLink>
            }
          >
            Tebakan nilai dan foto catatan dibuat setelah kamu menulis di kertas selama waktu fokus.
          </StateBlock>
        </motion.main>
      </>
    );
  }

  const jolLocked = session.jolScore != null && session.status === 'AWAITING_SCAN';
  const quotaEmpty = quota.status === 'ready' && quota.data.remaining === 0;
  const canSubmit = jolLocked && photoFile != null && !quotaEmpty && !sending;

  const onSaveJol = async () => {
    setSavingJol(true);
    setJolError('');
    try {
      await saveJol(guess);
    } catch (err) {
      setJolError(sessionErrorMessage(err));
    } finally {
      setSavingJol(false);
    }
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = photoProblem(file);
    if (problem) {
      setPhotoError(problem);
      return;
    }
    setPhotoError('');
    setPhoto(file);
  };

  const goToResult = (submissionId: string) => {
    setSubmission(submissionId);
    navigate('/belajar/hasil');
  };

  const onSubmit = async () => {
    if (!photoFile || !session.serverId) return;
    setSending(true);
    setPhotoError('');
    try {
      const { submissionId } = await scansApi.upload(photoFile, { sessionId: session.serverId });
      goToResult(submissionId);
    } catch (err) {
      setPhotoError(uploadErrorMessage(err));
      setSending(false);
    }
  };

  return (
    <>
      <AppHeader subtitle="Tebak & Foto" />
      <motion.main {...pageTransition} className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <StepIndicator current={2} />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-line-soft bg-card px-5 py-4">
          <span className="flex items-center gap-2 text-body-md text-ink">
            <Icon name="menu_book" className="text-teal" />
            {session.materialTitle}
          </span>
          {session.focusSeconds != null && (
            <span className="flex items-center gap-2 text-body-md text-ink-muted">
              <Icon name="timer" className="text-teal" />
              Fokus {formatDuration(session.focusSeconds)}
            </span>
          )}
        </div>

        <Stagger trigger="mount" gap={0.12} delay={0.1} className="grid items-start gap-6 lg:grid-cols-2">
          <StaggerItem>
            <section aria-labelledby="jol-title" className="flex flex-col gap-5 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
              <header className="flex flex-col gap-2">
                <h1 id="jol-title" className="font-headline text-headline-lg-mobile text-ink sm:text-headline-md">
                  Menurutmu, berapa nilai catatanmu?
                </h1>
                <p className="text-body-md text-ink-muted text-pretty">
                  Tebak dulu sebelum catatanmu dicek. Selisih tebakan dan hasil asli melatihmu mengenali kapan kamu benar-benar paham.
                </p>
              </header>

              <div className="flex items-end justify-between gap-4">
                <label htmlFor="jol" className="text-label-lg text-ink">
                  Tebakan nilaimu
                  <span className="block text-body-md font-normal text-ink-muted">{confidenceLabel(guess)}</span>
                </label>
                <span aria-hidden="true" className="font-mono text-[44px] leading-none text-teal tabular-nums">
                  <NumberFlow value={guess} suffix="%" />
                </span>
              </div>
              <input
                id="jol"
                type="range"
                min={0}
                max={100}
                step={5}
                value={guess}
                disabled={jolLocked}
                aria-valuetext={`${guess} persen, ${confidenceLabel(guess)}`}
                onChange={(e) => setGuess(Number(e.target.value))}
                className="h-11 w-full accent-[var(--teal)]"
              />
              <div className="flex justify-between text-label-sm text-ink-muted" aria-hidden="true">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {jolLocked ? (
                  <motion.p
                    key="saved"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 rounded-md bg-teal-wash px-4 py-3 text-body-md text-teal"
                  >
                    <motion.span
                      className="flex"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.1 }}
                    >
                      <Icon name="check_circle" fill />
                    </motion.span>
                    Tebakan {session.jolScore}% tersimpan. Tebakan tidak bisa diubah setelah disimpan.
                  </motion.p>
                ) : (
                  <motion.div key="save" exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.15 }} className="flex flex-col">
                    <Button variant="primary" size="lg" disabled={savingJol} onClick={() => void onSaveJol()}>
                      {savingJol ? 'Menyimpan...' : 'Simpan tebakan'}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              {jolError && (
                <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
                  <Icon name="error" className="mt-px text-[20px]" />
                  {jolError}
                </p>
              )}
              {jolLocked && session.validity === 'SHORT_FOCUS' && (
                <p className="flex items-start gap-2 text-body-sm text-ink-muted">
                  <Icon name="info" className="text-[18px]" />
                  Waktu fokusmu kurang dari separuh durasi pilihan. Hasil tetap dicek, tapi sesi ini ditandai fokus singkat di catatan guru.
                </p>
              )}
            </section>
          </StaggerItem>

          <StaggerItem>
            <motion.section
              layout
              animate={{ opacity: jolLocked ? 1 : 0.85 }}
              transition={{ duration: 0.3 }}
              aria-labelledby="photo-title"
              aria-disabled={!jolLocked}
              className={`flex flex-col gap-5 rounded-lg border p-5 sm:p-6 ${jolLocked ? 'border-line-soft bg-card' : 'border-dashed border-line bg-wash'}`}
            >
              <header className="flex flex-col gap-2">
                <h2 id="photo-title" className="font-headline text-headline-lg-mobile text-ink sm:text-headline-md">
                  Foto catatan kertasmu
                </h2>
                <p className="text-body-md text-ink-muted text-pretty">
                  {jolLocked
                    ? 'Pastikan seluruh tulisan dan panahmu terlihat jelas dalam satu foto.'
                    : 'Simpan tebakan nilaimu dulu. Foto dibuka setelah itu supaya tebakan tidak dipengaruhi hasil.'}
                </p>
                {jolLocked && (
                  <p className="flex items-start gap-2 text-body-sm text-ink-muted">
                    <Icon name="person_off" className="text-[18px]" />
                    {PHOTO_PRIVACY_TIP}
                  </p>
                )}
              </header>

              <input
                ref={cameraRef}
                type="file"
                accept={SCAN_ACCEPT.join(',')}
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                onChange={onPick}
                aria-hidden="true"
              />
              <input
                ref={galleryRef}
                type="file"
                accept={SCAN_ACCEPT.join(',')}
                className="sr-only"
                tabIndex={-1}
                onChange={onPick}
                aria-hidden="true"
              />

              {jolLocked && quota.status === 'ready' && (
                <p className={`flex items-center gap-2 text-body-md ${quotaEmpty ? 'text-on-danger-wash' : 'text-ink-muted'}`}>
                  <Icon name="confirmation_number" className="text-[20px] text-teal" />
                  {quotaEmpty ? 'Jatah cek catatan hari ini sudah habis. Terisi lagi pukul 00.00 WIB.' : quotaText(quota.data)}
                </p>
              )}

              {jolLocked && useQr && session.serverId && <QrBridgePanel sessionId={session.serverId} onUploaded={goToResult} />}

              <AnimatePresence initial={false}>
                {photoUrl && session.photo && (
                  <motion.figure
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden rounded-md border border-line-soft bg-wash"
                  >
                    <img src={photoUrl} alt="Pratinjau foto catatan yang kamu pilih" className="max-h-72 w-full object-contain" />
                    <figcaption className="flex items-center justify-between gap-3 border-t border-line-soft px-4 py-2.5 text-body-sm text-ink-muted">
                      <span className="truncate">{session.photo.name}</span>
                      <span className="shrink-0 tabular-nums">{formatBytes(session.photo.sizeBytes)}</span>
                    </figcaption>
                  </motion.figure>
                )}
              </AnimatePresence>

              {session.photo && !photoUrl && !useQr && (
                <p className="text-body-md text-ink-muted">Halaman dimuat ulang, jadi foto perlu dipilih lagi.</p>
              )}

              {photoError && (
                <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
                  <Icon name="error" className="mt-px text-[20px]" />
                  {photoError}
                </p>
              )}

              <div className={`flex flex-col gap-2 ${coarsePointer ? '' : 'sm:flex-row sm:flex-wrap'} ${useQr ? 'hidden' : ''}`}>
                {coarsePointer && (
                  <Button variant="primary" size="lg" disabled={!jolLocked} onClick={() => cameraRef.current?.click()}>
                    <Icon name="photo_camera" />
                    {photoUrl ? 'Foto ulang' : 'Buka kamera'}
                  </Button>
                )}
                <Button
                  variant={coarsePointer ? 'outline' : 'primary'}
                  size="lg"
                  disabled={!jolLocked}
                  onClick={() => galleryRef.current?.click()}
                >
                  <Icon name="image" />
                  {coarsePointer ? 'Pilih dari galeri' : photoUrl ? 'Ganti foto' : 'Pilih foto dari perangkat'}
                </Button>
                {!coarsePointer && (
                  <Button variant="outline" size="lg" disabled={!jolLocked || quotaEmpty} onClick={() => setUseQr(true)}>
                    <Icon name="qr_code_2" />
                    Pakai kamera HP
                  </Button>
                )}
              </div>
              {useQr && (
                <Button variant="ghost" onClick={() => setUseQr(false)}>
                  <Icon name="arrow_back" />
                  Pilih foto dari perangkat ini saja
                </Button>
              )}

              <p className="flex items-start gap-2 text-body-sm text-ink-muted">
                <Icon name="info" className="text-[18px]" />
                Foto dikirim ke server REKSA untuk dicek. Lokasi dan info kamera dihapus sebelum foto disimpan, dan hanya kamu serta guru
                kelasmu yang bisa melihatnya.
              </p>
            </motion.section>
          </StaggerItem>
        </Stagger>

        <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-line-soft pt-6 sm:flex-row sm:items-center">
          <ButtonLink to="/belajar" variant="ghost">
            <Icon name="arrow_back" />
            Kembali ke ruang belajar
          </ButtonLink>
          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
            <Button
              variant="accent"
              size="lg"
              disabled={!canSubmit}
              aria-describedby={canSubmit ? undefined : 'submit-hint'}
              onClick={() => void onSubmit()}
            >
              {sending ? 'Mengirim foto...' : 'Kirim dan cek catatan'}
            </Button>
            {!canSubmit && !sending && (
              <span id="submit-hint" className="text-body-sm text-ink-muted">
                {!jolLocked
                  ? 'Simpan tebakan dan pilih foto dulu.'
                  : quotaEmpty
                    ? 'Jatah cek hari ini sudah habis.'
                    : useQr
                      ? 'Kirim foto dari HP lewat kode QR di atas.'
                      : 'Pilih foto catatanmu dulu.'}
              </span>
            )}
          </div>
        </div>
      </motion.main>
    </>
  );
}
