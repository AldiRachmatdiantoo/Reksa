import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/core/apiClient';
import { formatMaterialDate, useMaterials } from '@/features/materials/materialsApi';
import { UploadMaterialForm } from '@/features/materials/UploadMaterialForm';
import { EASE_OUT } from '@/shared/motion';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock, StateBlock } from '@/shared/ui/StateBlock';
import { TextField } from '@/shared/ui/TextField';
import {
  CLASS_NAME_MAX,
  classesApi,
  formatClassCode,
  formatJoinDate,
  useClasses,
  useClassMembers,
  type ClassInfo,
  type ClassMember,
} from './classesApi';

/** Portal guru: buat kelas, bagikan kode, kelola anggota, bagikan materi ke kelas (FR-09). */
export function TeacherClasses() {
  const { state, reload, setState } = useClasses();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const classes = state.status === 'ready' ? state.data : [];
  const selected = classes.find((c) => c.id === selectedId) ?? classes[0] ?? null;

  const replaceClass = (updated: ClassInfo) =>
    setState((s) => (s.status === 'ready' ? { ...s, data: s.data.map((c) => (c.id === updated.id ? updated : c)) } : s));

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setCreateError('Beri nama kelas, misalnya "Biologi XI IPA 2".');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const created = await classesApi.create(name.trim());
      setName('');
      setState((s) => (s.status === 'ready' ? { ...s, data: [created, ...s.data] } : s));
      setSelectedId(created.id);
    } catch {
      setCreateError('Kelas gagal dibuat. Coba lagi.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <section aria-labelledby="classes-title" className="flex flex-col gap-4">
        <h2 id="classes-title" className="font-headline text-headline-md text-ink">
          Kelasmu
        </h2>
        <form
          noValidate
          onSubmit={onCreate}
          aria-busy={creating}
          className="flex flex-col gap-3 rounded-lg border border-line-soft bg-card p-4"
        >
          <TextField
            id="new-class-name"
            label="Nama kelas baru"
            placeholder="Biologi XI IPA 2"
            maxLength={CLASS_NAME_MAX}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setCreateError('');
            }}
            error={createError || undefined}
          />
          <Button type="submit" variant="primary" disabled={creating}>
            <Icon name="add" />
            {creating ? 'Membuat...' : 'Buat kelas'}
          </Button>
        </form>

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
        {state.status === 'ready' && classes.length === 0 && (
          <p className="rounded-md border border-dashed border-line bg-wash px-5 py-6 text-body-md text-ink-muted">
            Belum ada kelas. Buat satu, lalu bagikan kodenya ke siswa.
          </p>
        )}
        {classes.length > 0 && (
          <ul className="flex flex-col gap-1.5" aria-label="Daftar kelas">
            {classes.map((c) => {
              const active = c.id === selected?.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition-colors ${
                      active ? 'border-teal bg-teal-wash' : 'border-line-soft bg-card hover:border-line'
                    }`}
                  >
                    <span className="min-w-0 truncate text-title-md text-ink">{c.name}</span>
                    <span className="shrink-0 text-body-sm text-ink-muted">{c.memberCount} siswa</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AnimatePresence mode="wait" initial={false}>
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <ClassDetail
              cls={selected}
              onChanged={replaceClass}
              onDeleted={() => {
                setSelectedId(null);
                reload();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type DetailProps = {
  cls: ClassInfo;
  onChanged: (cls: ClassInfo) => void;
  onDeleted: () => void;
};

function ClassDetail({ cls, onChanged, onDeleted }: DetailProps) {
  const members = useClassMembers(cls.id);
  const materials = useMaterials();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(cls.name);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<'rotate' | 'delete' | null>(null);
  const [toRemove, setToRemove] = useState<ClassMember | null>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const classMaterials = materials.state.status === 'ready' ? materials.state.data.filter((m) => m.classId === cls.id) : [];
  const code = cls.classCode ?? '';

  const run = async (action: () => Promise<void>, failMessage: string) => {
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? err.message : failMessage);
    }
  };

  const onRename = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || trimmed === cls.name) {
      setRenaming(false);
      return;
    }
    void run(async () => {
      onChanged(await classesApi.rename(cls.id, trimmed));
      setRenaming(false);
    }, 'Nama kelas gagal diganti. Coba lagi.');
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError('Kode tidak bisa disalin otomatis. Salin manual dari layar.');
    }
  };

  const onConfirm = () => {
    const action = confirm;
    setConfirm(null);
    if (action === 'rotate') {
      void run(async () => onChanged(await classesApi.rotateCode(cls.id)), 'Kode baru gagal dibuat. Coba lagi.');
    } else if (action === 'delete') {
      void run(async () => {
        await classesApi.remove(cls.id);
        onDeleted();
      }, 'Kelas gagal dihapus. Coba lagi.');
    }
  };

  const confirmRemove = () => {
    const target = toRemove;
    setToRemove(null);
    if (!target) return;
    void run(async () => {
      await classesApi.removeMember(cls.id, target.studentId);
      members.reload();
      // Perbarui hitungan di tempat: memuat ulang daftar kelas membuat panel ini berkedip.
      onChanged({ ...cls, memberCount: Math.max(0, cls.memberCount - 1) });
    }, `${target.fullName} gagal dikeluarkan. Coba lagi.`);
  };

  return (
    <section aria-labelledby="class-detail-title" className="flex flex-col gap-6 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-3">
        {renaming ? (
          <form onSubmit={onRename} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <TextField
              id="rename-class"
              label="Nama kelas"
              maxLength={CLASS_NAME_MAX}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1"
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="submit" variant="primary">
                Simpan
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRenaming(false);
                  setNewName(cls.name);
                }}
              >
                Batal
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <h2 id="class-detail-title" className="font-headline text-headline-md text-ink text-balance">
              {cls.name}
            </h2>
            <Button
              variant="ghost"
              onClick={() => {
                setNewName(cls.name);
                setRenaming(true);
              }}
              aria-label={`Ganti nama kelas ${cls.name}`}
              className="shrink-0 px-3"
            >
              <Icon name="edit" />
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-md bg-wash p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-label-lg text-ink-muted">Kode kelas</span>
          <span
            className="font-mono text-[28px] leading-none font-semibold tracking-[0.18em] text-ink tabular-nums"
            aria-label={code.split('').join(' ')}
          >
            {formatClassCode(code)}
          </span>
          <span className="text-body-sm text-ink-muted">Siswa memasukkan kode ini di menu Kelas.</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyCode}>
            <Icon name={copied ? 'check' : 'content_copy'} />
            <span aria-live="polite">{copied ? 'Tersalin' : 'Salin'}</span>
          </Button>
          <Button variant="ghost" onClick={() => setConfirm('rotate')}>
            <Icon name="autorenew" />
            Kode baru
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-title text-title-lg text-ink">Siswa ({cls.memberCount})</h3>
        {members.state.status === 'loading' && <LoadingBlock label="Memuat siswa..." />}
        {members.state.status === 'error' && (
          <StateBlock
            icon="cloud_off"
            tone="danger"
            title="Daftar siswa gagal dimuat"
            action={
              <Button variant="outline" onClick={members.reload}>
                Coba lagi
              </Button>
            }
          >
            Periksa koneksimu, lalu coba lagi.
          </StateBlock>
        )}
        {members.state.status === 'ready' && members.state.data.length === 0 && (
          <p className="rounded-md border border-dashed border-line px-4 py-5 text-body-md text-ink-muted">
            Belum ada siswa. Bagikan kode kelas di atas.
          </p>
        )}
        {members.state.status === 'ready' && members.state.data.length > 0 && (
          <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line-soft">
            {members.state.data.map((m) => (
              <li key={m.studentId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-body-lg text-ink">{m.fullName}</span>
                  <span className="text-body-sm text-ink-muted">Bergabung {formatJoinDate(m.joinedAt)}</span>
                </div>
                <Button variant="ghost" onClick={() => setToRemove(m)} className="shrink-0 px-3">
                  Keluarkan
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-title text-title-lg text-ink">Materi kelas</h3>
          {!sharing && (
            <Button variant="outline" onClick={() => setSharing(true)}>
              <Icon name="upload" />
              Bagikan materi
            </Button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {sharing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3 rounded-md border border-line-soft p-4">
                <p className="text-body-md text-ink-muted">
                  Semua siswa di kelas ini bisa membaca materinya, tapi tidak bisa mengubah atau menghapus.
                </p>
                <UploadMaterialForm
                  classId={cls.id}
                  submitLabel="Bagikan ke kelas"
                  onCreated={() => {
                    setSharing(false);
                    materials.reload();
                  }}
                />
                <Button variant="ghost" onClick={() => setSharing(false)}>
                  Batal
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {materials.state.status === 'loading' && <LoadingBlock label="Memuat materi..." />}
        {materials.state.status === 'ready' && classMaterials.length === 0 && !sharing && (
          <p className="rounded-md border border-dashed border-line px-4 py-5 text-body-md text-ink-muted">
            Belum ada materi untuk kelas ini.
          </p>
        )}
        {classMaterials.length > 0 && (
          <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line-soft">
            {classMaterials.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon name={m.source === 'PDF' ? 'picture_as_pdf' : 'notes'} className="text-[20px] text-ink-muted" />
                  <span className="truncate text-body-lg text-ink">{m.title}</span>
                </span>
                <span className="shrink-0 text-body-sm text-ink-muted">
                  {m.conceptCount} konsep · {formatMaterialDate(m.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line-soft pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-sm text-ink-muted">
          {cls.memberCount > 0
            ? 'Kelas bisa dihapus setelah semua siswa dikeluarkan.'
            : 'Menghapus kelas tidak menghapus materinya; materi kembali jadi milikmu saja.'}
        </p>
        <Button variant="ghost" onClick={() => setConfirm('delete')} disabled={cls.memberCount > 0} className="shrink-0">
          <Icon name="delete" />
          Hapus kelas
        </Button>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        icon={confirm === 'delete' ? 'delete' : 'autorenew'}
        title={confirm === 'delete' ? 'Hapus kelas ini?' : 'Buat kode kelas baru?'}
        confirmLabel={confirm === 'delete' ? 'Ya, hapus' : 'Ya, buat kode baru'}
        cancelLabel="Batal"
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirm}
      >
        {confirm === 'delete' ? (
          <>
            <strong className="text-ink">{cls.name}</strong> akan dihapus permanen.
          </>
        ) : (
          <>
            Kode <strong className="font-mono text-ink">{formatClassCode(code)}</strong> langsung tidak berlaku. Siswa yang sudah bergabung
            tetap di kelas.
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={toRemove !== null}
        icon="person_remove"
        title="Keluarkan siswa ini?"
        confirmLabel="Ya, keluarkan"
        cancelLabel="Batal"
        onCancel={() => setToRemove(null)}
        onConfirm={confirmRemove}
      >
        <strong className="text-ink">{toRemove?.fullName}</strong> tidak bisa lagi membaca materi kelas, dan catatannya tidak lagi terlihat
        di portal ini. Data belajarnya tetap miliknya.
      </ConfirmDialog>
    </section>
  );
}
