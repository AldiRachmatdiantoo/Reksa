import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/core/apiClient';
import { useStudySession } from '@/features/studio/studySession';
import { EASE_OUT, pageTransition, Stagger, StaggerItem } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock, StateBlock } from '@/shared/ui/StateBlock';
import {
  formatMaterialDate,
  materialsApi,
  openMaterialPdf,
  useMaterials,
  type CreateMaterialResult,
  type MaterialSummary,
} from './materialsApi';
import { RubricPreview } from './RubricPreview';
import { UploadMaterialForm } from './UploadMaterialForm';

export function MaterialsPage() {
  const navigate = useNavigate();
  const { session, selectMaterial } = useStudySession();
  const { state, reload } = useMaterials();
  const [created, setCreated] = useState<CreateMaterialResult | null>(null);
  const [toDelete, setToDelete] = useState<MaterialSummary | null>(null);
  const [listError, setListError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Materi Belajar · REKSA';
  }, []);

  const studyWith = (id: string, title: string) => {
    // Materi yang sama: sesi berjalan dilanjutkan. Materi lain: sesi baru (progres lama dibuang).
    if (session?.materialId !== id) selectMaterial(id, title);
    navigate('/belajar');
  };

  const onCreated = (result: CreateMaterialResult) => {
    setCreated(result);
    reload();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openPdf = async (m: MaterialSummary) => {
    setListError('');
    setOpeningId(m.id);
    if (!(await openMaterialPdf(m.id))) setListError('PDF gagal dibuka. Coba lagi.');
    setOpeningId(null);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    setListError('');
    try {
      await materialsApi.remove(target.id);
      if (created?.material.id === target.id) setCreated(null);
      reload();
    } catch (err) {
      setListError(
        err instanceof ApiError && err.status === 409
          ? `"${target.title}" sudah dipakai di sesi belajar, jadi tidak bisa dihapus.`
          : 'Materi gagal dihapus. Coba lagi.',
      );
    }
  };

  return (
    <>
      <AppHeader subtitle="Materi Belajar" />
      <motion.main {...pageTransition} className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">Materi belajarmu</h1>
          <p className="max-w-prose text-body-lg text-ink-muted text-pretty">
            REKSA menyusun konsep kunci dari materimu. Konsep inilah yang jadi patokan saat foto catatanmu dicek nanti.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <section aria-labelledby="add-title" className="flex flex-col gap-5 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
            <AnimatePresence mode="wait" initial={false}>
              {created ? (
                <motion.div
                  key="created"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: EASE_OUT }}
                  className="flex flex-col gap-5"
                >
                  <div className="flex items-start gap-3">
                    <motion.span
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.1 }}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-wash text-teal"
                    >
                      <Icon name="task_alt" fill />
                    </motion.span>
                    <div className="flex flex-col gap-1">
                      <h2 id="add-title" className="font-headline text-headline-md text-ink text-balance">
                        {created.material.title}
                      </h2>
                      <p className="text-body-sm text-ink-muted">
                        {created.rubricCached
                          ? 'Materi yang sama pernah diunggah, jadi konsep kuncinya langsung diambil dari simpanan.'
                          : 'Konsep kunci selesai disusun.'}
                      </p>
                    </div>
                  </div>
                  <RubricPreview rubric={created.material.rubric} />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="accent" size="lg" onClick={() => studyWith(created.material.id, created.material.title)}>
                      <Icon name="play_arrow" fill />
                      Belajar dengan materi ini
                    </Button>
                    <Button variant="outline" size="lg" onClick={() => setCreated(null)}>
                      Tambah materi lain
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  className="flex flex-col gap-5"
                >
                  <h2 id="add-title" className="font-title text-title-lg text-ink">
                    Tambah materi
                  </h2>
                  <UploadMaterialForm onCreated={onCreated} />
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <section aria-labelledby="list-title" className="flex flex-col gap-3 lg:sticky lg:top-24">
            <h2 id="list-title" className="font-title text-title-lg text-ink">
              Materi tersimpan
            </h2>

            <AnimatePresence>
              {listError && (
                <motion.p
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash"
                >
                  {listError}
                </motion.p>
              )}
            </AnimatePresence>

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
              <p className="rounded-md border border-dashed border-line bg-wash px-5 py-6 text-body-md text-ink-muted">
                Belum ada materi. Materi yang kamu tambahkan dan materi dari kelasmu muncul di sini.
              </p>
            )}
            {state.status === 'ready' && state.data.length > 0 && (
              <Stagger as="ul" trigger="mount" gap={0.05} className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {state.data.map((m) => {
                    const active = session?.materialId === m.id;
                    return (
                      <StaggerItem
                        as="li"
                        key={m.id}
                        layout
                        exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
                        className={`flex flex-col gap-3 rounded-md border p-4 ${active ? 'border-teal bg-teal-wash' : 'border-line-soft bg-card'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-col gap-1">
                            <h3 className="truncate text-title-md text-ink">{m.title}</h3>
                            <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-ink-muted">
                              <span className="inline-flex items-center gap-1">
                                <Icon name={m.source === 'PDF' ? 'picture_as_pdf' : 'notes'} className="text-[16px]" />
                                {m.source === 'PDF' ? 'PDF' : 'Teks'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{m.conceptCount} konsep</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatMaterialDate(m.createdAt)}</span>
                            </p>
                            {!m.isOwner && m.className && (
                              <p className="inline-flex items-center gap-1 text-body-sm text-teal">
                                <Icon name="groups" className="text-[16px]" />
                                Dari kelas {m.className}
                              </p>
                            )}
                          </div>
                          {active && (
                            <span className="shrink-0 rounded-full bg-teal px-2.5 py-0.5 text-label-sm text-on-teal">Dipakai</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant={active ? 'primary' : 'outline'} onClick={() => studyWith(m.id, m.title)}>
                            {active ? 'Lanjut belajar' : 'Pakai materi ini'}
                          </Button>
                          {m.source === 'PDF' && (
                            <Button variant="ghost" onClick={() => openPdf(m)} disabled={openingId === m.id}>
                              <Icon name="open_in_new" />
                              {openingId === m.id ? 'Membuka...' : 'Buka PDF'}
                            </Button>
                          )}
                          {m.isOwner && (
                            <Button variant="ghost" onClick={() => setToDelete(m)} aria-label={`Hapus materi ${m.title}`} className="px-3">
                              <Icon name="delete" />
                            </Button>
                          )}
                        </div>
                      </StaggerItem>
                    );
                  })}
                </AnimatePresence>
              </Stagger>
            )}
          </section>
        </div>
      </motion.main>

      <ConfirmDialog
        open={toDelete !== null}
        icon="delete"
        title="Hapus materi ini?"
        confirmLabel="Ya, hapus"
        cancelLabel="Batal"
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      >
        <strong className="text-ink">{toDelete?.title}</strong> dan file PDF-nya akan dihapus permanen. Materi yang sudah dipakai di sesi
        belajar tidak bisa dihapus.
      </ConfirmDialog>
    </>
  );
}
