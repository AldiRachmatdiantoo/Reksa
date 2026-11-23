import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '@/core/apiClient';
import { Mascot } from '@/shared/mascot/Mascot';
import { EASE_OUT } from '@/shared/motion';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { TextField } from '@/shared/ui/TextField';
import {
  MATERIAL_MAX_PDF_BYTES,
  MATERIAL_MAX_TEXT_CHARS,
  formatResetTime,
  materialsApi,
  uploadErrorMessage,
  useMaterialQuota,
  type CreateMaterialResult,
  type MaterialQuota,
} from './materialsApi';

type Mode = 'teks' | 'pdf';

function formatBytes(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * Unggah materi: tempel teks atau PDF. Hasilnya diserahkan ke parent untuk ditampilkan.
 * `classId` dipakai portal guru untuk membagikan materi ke satu kelas.
 */
export function UploadMaterialForm({
  onCreated,
  classId,
  submitLabel = 'Susun konsep kunci',
}: {
  onCreated: (result: CreateMaterialResult) => void;
  classId?: string;
  submitLabel?: string;
}) {
  const [mode, setMode] = useState<Mode>('teks');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; content?: string; file?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { state: quotaState, reload: reloadQuota } = useMaterialQuota();
  const quota = quotaState.status === 'ready' ? quotaState.data : null;
  const storageFull = quota !== null && quota.stored >= quota.storedLimit;

  const pickFile = (picked: File | undefined) => {
    if (!picked) return;
    const looksPdf = picked.type === 'application/pdf' || picked.name.toLowerCase().endsWith('.pdf');
    if (!looksPdf) {
      setErrors((e) => ({ ...e, file: 'Pilih file berformat PDF.' }));
      return;
    }
    if (picked.size > MATERIAL_MAX_PDF_BYTES) {
      setErrors((e) => ({ ...e, file: `Ukuran file ${formatBytes(picked.size)}. Maksimal 10 MB, unggah per bab.` }));
      return;
    }
    setErrors((e) => ({ ...e, file: undefined, form: undefined }));
    setFile(picked);
    // Judul diisi dari nama file kalau masih kosong, tetap bisa diubah.
    if (!title.trim())
      setTitle(
        picked.name
          .replace(/\.pdf$/i, '')
          .replace(/[_-]+/g, ' ')
          .slice(0, 200),
      );
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files[0]);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'Beri judul materi, misalnya "Bab 3 Homeostasis".';
    if (mode === 'teks' && !content.trim()) next.content = 'Tempel isi materi yang mau kamu pelajari.';
    if (mode === 'pdf' && !file) next.file = 'Pilih file PDF materimu.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const result =
        mode === 'teks'
          ? await materialsApi.createText(title.trim(), content, classId)
          : await materialsApi.createPdf(title.trim(), file!, classId);
      setTitle('');
      setContent('');
      setFile(null);
      onCreated(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const fieldErrors: typeof errors = {};
        for (const issue of err.issues) {
          if (issue.path === 'title') fieldErrors.title = 'Judul 1 sampai 200 karakter.';
          if (issue.path === 'content')
            fieldErrors.content = `Isi materi maksimal ${MATERIAL_MAX_TEXT_CHARS.toLocaleString('id-ID')} karakter.`;
        }
        setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: 'Periksa lagi isian formulir.' });
      } else {
        setErrors({ form: uploadErrorMessage(err) });
      }
    } finally {
      setSubmitting(false);
      reloadQuota();
    }
  };

  const count = content.length;
  const overLimit = count > MATERIAL_MAX_TEXT_CHARS;

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={submitting} className="flex flex-col gap-5">
      <SegmentedTabs
        label="Cara menambah materi"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setErrors({});
        }}
        options={[
          { value: 'teks', label: 'Tempel teks', panelId: 'material-panel' },
          { value: 'pdf', label: 'Unggah PDF', panelId: 'material-panel' },
        ]}
        className="w-full"
      />

      <TextField
        id="material-title"
        label="Judul materi"
        placeholder="Bab 3 Homeostasis"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
      />

      <div id="material-panel" role="tabpanel">
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'teks' ? (
            <motion.div
              key="teks"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="flex flex-col gap-1.5"
            >
              <label htmlFor="material-content" className="text-label-lg text-ink">
                Isi materi
              </label>
              <textarea
                id="material-content"
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Tempel teks dari buku, catatan guru, atau rangkuman bab di sini."
                aria-invalid={errors.content || overLimit ? true : undefined}
                aria-describedby="material-content-count material-content-error"
                className={`ruled-sheet min-h-56 w-full resize-y rounded-[12px] border py-2 pr-4 pl-12 text-body-lg leading-7 text-ink placeholder:text-ink-muted/70 focus-visible:outline-offset-1 ${
                  errors.content || overLimit ? 'border-danger' : 'border-line hover:border-ink-muted'
                }`}
              />
              <div className="flex items-start justify-between gap-3">
                <p id="material-content-error" className="text-body-sm font-medium text-danger">
                  {errors.content ?? (overLimit ? 'Terlalu panjang. Pecah jadi beberapa materi.' : '')}
                </p>
                <span
                  id="material-content-count"
                  className={`shrink-0 font-mono text-mono-sm tabular-nums ${overLimit ? 'text-danger' : 'text-ink-muted'}`}
                >
                  {count.toLocaleString('id-ID')} / {MATERIAL_MAX_TEXT_CHARS.toLocaleString('id-ID')}
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="pdf"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="flex flex-col gap-1.5"
            >
              <span id="material-file-label" className="text-label-lg text-ink">
                File PDF
              </span>
              <input
                ref={fileRef}
                id="material-file"
                type="file"
                accept="application/pdf,.pdf"
                className="peer sr-only"
                aria-labelledby="material-file-label"
                aria-describedby="material-file-hint material-file-error"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <label
                htmlFor="material-file"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal ${
                  dragging
                    ? 'border-teal bg-teal-wash'
                    : errors.file
                      ? 'border-danger bg-danger-wash/40'
                      : 'border-line bg-wash hover:border-teal'
                }`}
              >
                <motion.span
                  animate={{ y: dragging ? -4 : 0, scale: dragging ? 1.1 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="flex"
                >
                  <Icon name={file ? 'picture_as_pdf' : 'upload_file'} className="text-[40px] text-teal" />
                </motion.span>
                {file ? (
                  <>
                    <span className="max-w-full truncate text-title-md text-ink">{file.name}</span>
                    <span className="text-body-sm text-ink-muted">{formatBytes(file.size)} · klik untuk ganti file</span>
                  </>
                ) : (
                  <>
                    <span className="text-title-md text-ink">Pilih PDF atau tarik ke sini</span>
                    <span id="material-file-hint" className="text-body-sm text-ink-muted">
                      Maksimal 10 MB. PDF hasil scan foto belum bisa dibaca.
                    </span>
                  </>
                )}
              </label>
              <p id="material-file-error" className="text-body-sm font-medium text-danger">
                {errors.file}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {errors.form && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 overflow-hidden rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash"
          >
            <Icon name="error" className="mt-px text-[20px]" />
            {errors.form}
          </motion.p>
        )}
      </AnimatePresence>

      {quota && <QuotaNote quota={quota} />}

      <Button type="submit" variant="accent" size="lg" disabled={submitting || overLimit || storageFull}>
        {submitting ? (
          <>
            <motion.span className="flex" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
              <Icon name="progress_activity" />
            </motion.span>
            Menyusun konsep kunci...
          </>
        ) : (
          <>
            <Icon name="auto_stories" />
            {submitLabel}
          </>
        )}
      </Button>
    </form>
  );
}

/**
 * Sisa kuota materi baru hari ini. Kuota habis tidak mengunci form karena materi yang rubriknya sudah pernah
 * disusun tetap bisa ditambahkan; penyimpanan penuh mengunci tombol kirim.
 */
function QuotaNote({ quota }: { quota: MaterialQuota }) {
  if (quota.stored >= quota.storedLimit) {
    return (
      <MascotNote mood="think">
        Penyimpananmu penuh: {quota.stored} dari {quota.storedLimit} materi. Hapus materi yang tidak dipakai lagi dari daftar, lalu
        tambahkan yang baru.
      </MascotNote>
    );
  }
  if (quota.remaining === 0) {
    return (
      <MascotNote mood="sleep">
        Jatah {quota.limit} materi baru hari ini sudah terpakai. Terisi lagi pukul {formatResetTime(quota.resetAt)}. Materi yang isinya sama
        persis dengan yang pernah diproses tetap bisa ditambahkan.
      </MascotNote>
    );
  }
  return (
    <p className="text-body-sm text-ink-muted text-pretty">
      <span className="font-semibold text-ink">
        Sisa {quota.remaining} dari {quota.limit} materi baru hari ini.
      </span>{' '}
      Materi yang isinya sama persis dengan yang pernah diproses tidak dihitung.
    </p>
  );
}

function MascotNote({ mood, children }: { mood: 'think' | 'sleep'; children: ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-md bg-teal-wash px-3 py-3">
      <Mascot name="risu" mood={mood} className="h-14 w-auto shrink-0" />
      <p className="text-body-md text-ink text-pretty">{children}</p>
    </div>
  );
}
