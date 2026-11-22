import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/core/apiClient';
import { pageTransition, Stagger, StaggerItem } from '@/shared/motion';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock, StateBlock } from '@/shared/ui/StateBlock';
import { TextField } from '@/shared/ui/TextField';
import { VerifyEmailNotice } from '@/features/auth/VerifyEmailNotice';
import { classesApi, formatJoinDate, joinErrorMessage, useClasses, type ClassInfo } from './classesApi';

/** Kelas yang diikuti siswa: gabung lewat kode dari guru, lihat daftar, keluar. */
export function StudentClassesPage() {
  const auth = useAuth();
  const userId = auth.status === 'authenticated' ? auth.user.id : '';
  // Backend menolak gabung kelas sebelum email terverifikasi (403 EMAIL_NOT_VERIFIED). Penjelasannya
  // sudah ada di VerifyEmailNotice, jadi tombolnya dimatikan dan tidak ada pesan error kedua.
  const verified = auth.status === 'authenticated' && auth.user.emailVerified;
  const { state, reload } = useClasses();
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<ClassInfo | null>(null);
  const [toLeave, setToLeave] = useState<ClassInfo | null>(null);
  const [listError, setListError] = useState('');

  useEffect(() => {
    document.title = 'Kelas · REKSA';
  }, []);

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!verified) return;
    if (!code.trim()) {
      setJoinError('Masukkan kode kelas dari gurumu.');
      return;
    }
    setJoining(true);
    setJoinError('');
    setJoined(null);
    try {
      const cls = await classesApi.join(code);
      setJoined(cls);
      setCode('');
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED' && auth.status === 'authenticated') {
        // Status verifikasi di tab ini kedaluwarsa: tampilkan pemberitahuan verifikasi, bukan error kedua.
        auth.updateUser({ ...auth.user, emailVerified: false });
      } else {
        setJoinError(joinErrorMessage(err));
      }
    } finally {
      setJoining(false);
    }
  };

  const confirmLeave = async () => {
    if (!toLeave) return;
    const target = toLeave;
    setToLeave(null);
    setListError('');
    try {
      await classesApi.removeMember(target.id, userId);
      if (joined?.id === target.id) setJoined(null);
      reload();
    } catch {
      setListError(`Gagal keluar dari ${target.name}. Coba lagi.`);
    }
  };

  return (
    <>
      <AppHeader subtitle="Kelas" />
      <motion.main {...pageTransition} className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">Kelasmu</h1>
          <p className="max-w-prose text-body-lg text-ink-muted text-pretty">
            Gabung ke kelas dengan kode dari gurumu. Materi yang dibagikan guru akan muncul di halaman Materi.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section aria-labelledby="join-title" className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
            <h2 id="join-title" className="font-title text-title-lg text-ink">
              Gabung ke kelas
            </h2>
            <VerifyEmailNotice id="join-verify-notice" reason="Verifikasi emailmu dulu supaya bisa bergabung ke kelas." />
            <form noValidate onSubmit={onJoin} aria-busy={joining} className="flex flex-col gap-4">
              <TextField
                id="class-code"
                label="Kode kelas"
                placeholder="ABCD EFGH"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={12}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setJoinError('');
                }}
                hint="8 karakter, huruf dan angka. Spasi atau tanda hubung boleh."
                error={joinError || undefined}
                className="[&_input]:font-mono [&_input]:tracking-[0.2em]"
              />
              <Button
                type="submit"
                variant="accent"
                size="lg"
                disabled={joining || !verified}
                aria-describedby={verified ? undefined : 'join-verify-notice'}
              >
                <Icon name="login" />
                {joining ? 'Memeriksa kode...' : 'Gabung'}
              </Button>
            </form>
            <AnimatePresence>
              {joined && (
                <motion.p
                  role="status"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2 overflow-hidden rounded-md bg-teal-wash px-4 py-3 text-body-md text-ink"
                >
                  <Icon name="task_alt" className="mt-px text-[20px] text-teal" />
                  <span>
                    Kamu sudah masuk ke <strong>{joined.name}</strong>.{' '}
                    <Link to="/belajar/materi" className="font-semibold text-teal underline underline-offset-2">
                      Lihat materinya
                    </Link>
                  </span>
                </motion.p>
              )}
            </AnimatePresence>
          </section>

          <section aria-labelledby="classes-title" className="flex flex-col gap-3">
            <h2 id="classes-title" className="font-title text-title-lg text-ink">
              Kelas yang kamu ikuti
            </h2>
            {listError && (
              <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
                {listError}
              </p>
            )}
            {state.status === 'loading' && <LoadingBlock label="Memuat kelas..." />}
            {state.status === 'error' && (
              <StateBlock
                icon="cloud_off"
                tone="danger"
                title="Daftar kelas gagal dimuat"
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
              <p className="rounded-md border border-dashed border-line bg-wash px-5 py-6 text-body-md text-ink-muted">
                Belum ikut kelas mana pun. Kamu tetap bisa belajar sendiri dengan materimu.
              </p>
            )}
            {state.status === 'ready' && state.data.length > 0 && (
              <Stagger as="ul" trigger="mount" gap={0.05} className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {state.data.map((c) => (
                    <StaggerItem
                      as="li"
                      key={c.id}
                      layout
                      exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
                      className="flex items-start justify-between gap-3 rounded-md border border-line-soft bg-card p-4"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <h3 className="truncate text-title-md text-ink">{c.name}</h3>
                        <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-ink-muted">
                          <span>{c.educatorName}</span>
                          <span aria-hidden="true">·</span>
                          <span>{c.memberCount} siswa</span>
                        </p>
                        {c.joinedAt && <p className="text-body-sm text-ink-muted">Bergabung {formatJoinDate(c.joinedAt)}</p>}
                      </div>
                      <Button variant="ghost" onClick={() => setToLeave(c)} className="shrink-0 px-3">
                        Keluar
                      </Button>
                    </StaggerItem>
                  ))}
                </AnimatePresence>
              </Stagger>
            )}
          </section>
        </div>
      </motion.main>

      <ConfirmDialog
        open={toLeave !== null}
        icon="logout"
        title="Keluar dari kelas ini?"
        confirmLabel="Ya, keluar"
        cancelLabel="Batal"
        onCancel={() => setToLeave(null)}
        onConfirm={confirmLeave}
      >
        Materi <strong className="text-ink">{toLeave?.name}</strong> tidak akan terlihat lagi. Catatan dan sesi belajarmu tetap tersimpan,
        tapi gurumu tidak bisa melihatnya lagi. Untuk masuk lagi, minta kode kelas ke guru.
      </ConfirmDialog>
    </>
  );
}
