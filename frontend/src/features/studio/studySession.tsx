import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '@/core/apiClient';
import { useAuth } from '@/features/auth/AuthProvider';
import { STUDY_SESSION_STORAGE_KEY } from './storageKey';
import { scansApi } from '@/features/scanner/scansApi';
import { outbox as defaultOutbox, outboxId, type OutboxStore } from '@/shared/offline/outbox';
import { flushOutbox } from './offlineSync';
import { activeSessionIdOf, minutesOf, sessionsApi, type ServerSession, type SessionStatus } from './sessionsApi';

/**
 * Progres satu sesi belajar di sisi klien (tidak ada token di sini).
 *
 * Sumber kebenarannya server (`/sessions`, PRD FR-02): waktu mulai, durasi fokus, tebakan JOL, dan
 * status sesi dihitung di backend. State ini cache tampilan yang disimpan di sessionStorage supaya
 * refresh tidak mengosongkan layar; saat dimuat, cache disinkronkan lagi dengan server.
 */
export type StudySession = {
  /** UUID materi dari GET /materials. */
  materialId: string;
  /** Disalin dari materi supaya halaman berikutnya tidak perlu memuat ulang. */
  materialTitle: string;
  /**
   * Kelas pemilik materi. Dikirim saat mulai sesi supaya sesi ini masuk ledger dan peta blind spot
   * kelas itu (FR-07, FR-08). null untuk materi pribadi. Opsional karena cache lama belum punya.
   */
  classId?: string | null;
  /** F3 interleaving: materi kedua yang dicampur dalam sesi ini. Opsional karena cache lama belum punya. */
  secondMaterial?: { id: string; title: string } | null;
  presetMinutes: number;
  /** Id sesi di server; null sebelum waktu fokus dimulai. */
  serverId: string | null;
  /** Status terakhir dari server. */
  status: SessionStatus | null;
  /** Epoch ms waktu mulai menurut server; null = belum mulai. */
  startedAt: number | null;
  /** Detik fokus: dari jam browser saat Selesai ditekan, lalu diganti angka server setelah tebakan tersimpan. */
  focusSeconds: number | null;
  /** Judgement of Learning 0..100, terkunci setelah disimpan di server. */
  jolScore: number | null;
  validity: 'VALID' | 'SHORT_FOCUS' | null;
  /** Batas unggah foto (ISO) dari server. */
  scanDeadlineAt: string | null;
  /** Id hasil cek setelah foto terkirim. */
  submissionId: string | null;
  photo: { name: string; sizeBytes: number } | null;
  /** SPACED_REVIEW = latihan ulang H+3/H+7 (FR-06): 5 menit, tanpa memotong jatah cek. Opsional untuk cache lama. */
  sessionType?: 'INITIAL_BLURTING' | 'SPACED_REVIEW';
  /** Konsep yang dilatih ulang, disalin dari kartu jadwal (hanya tampilan). */
  reviewConcepts?: string[];
  /**
   * F2: kiriman yang menunggu koneksi (tersimpan di IndexedDB, lihat shared/offline/outbox.ts). Selama tebakan
   * menunggu, status AWAITING_SCAN di cache ini baru keadaan lokal; server belum menerimanya.
   */
  pendingSync?: { jol?: boolean; photo?: boolean };
};

const STORAGE_KEY = STUDY_SESSION_STORAGE_KEY;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const emptySession = (materialId: string, materialTitle: string, presetMinutes = 25, classId: string | null = null): StudySession => ({
  materialId,
  materialTitle,
  classId,
  presetMinutes,
  serverId: null,
  status: null,
  startedAt: null,
  focusSeconds: null,
  jolScore: null,
  validity: null,
  scanDeadlineAt: null,
  submissionId: null,
  photo: null,
});

/** Koneksi putus atau server tidak terjangkau: kiriman boleh disimpan dulu di perangkat. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

/**
 * Seperti fromServer, tetapi kiriman yang masih menunggu koneksi tidak ditimpa keadaan server yang belum
 * menerimanya: tebakan yang menunggu tetap terkunci di layar dan langkah foto tetap terbuka.
 */
export function mergeServer(s: ServerSession, previous?: StudySession | null): StudySession {
  const next = fromServer(s, previous);
  const pending = previous?.serverId === s.id ? previous.pendingSync : undefined;
  if (!pending) return next;
  const jolWaiting = pending.jol === true && (s.status === 'FOCUS_ACTIVE' || s.status === 'AWAITING_JOL');
  const photoWaiting = pending.photo === true && !s.submissionId && s.status !== 'EXPIRED' && s.status !== 'COMPLETED';
  if (jolWaiting) {
    next.status = 'AWAITING_SCAN';
    next.jolScore = previous!.jolScore;
    next.focusSeconds = previous!.focusSeconds;
  }
  next.pendingSync = jolWaiting || photoWaiting ? { jol: jolWaiting || undefined, photo: photoWaiting || undefined } : undefined;
  return next;
}

/** Menyalin keadaan server ke cache. Judul materi lama dipakai bila server tidak bisa membacanya lagi. */
export function fromServer(s: ServerSession, previous?: StudySession | null): StudySession {
  const awaitingOrLater = s.status !== 'FOCUS_ACTIVE';
  return {
    materialId: s.materialId,
    materialTitle: s.materialTitle ?? previous?.materialTitle ?? 'Materi',
    classId: s.classId,
    secondMaterial: s.secondMaterialId
      ? { id: s.secondMaterialId, title: s.secondMaterialTitle ?? previous?.secondMaterial?.title ?? 'Materi kedua' }
      : null,
    presetMinutes: minutesOf(s),
    serverId: s.id,
    status: s.status,
    startedAt: Date.parse(s.startedAt),
    focusSeconds: s.actualDurationSec ?? (awaitingOrLater ? null : (previous?.focusSeconds ?? null)),
    jolScore: s.predictedJolScore,
    validity: s.validity,
    scanDeadlineAt: s.scanDeadlineAt,
    submissionId: s.submissionId,
    photo: previous?.serverId === s.id ? previous.photo : null,
    sessionType: s.sessionType,
    reviewConcepts: previous?.serverId === s.id ? previous.reviewConcepts : undefined,
  };
}

/**
 * Cache dibaca hanya kalau pemiliknya akun yang sedang login. Tanpa ini, materi yang dipilih akun lain di tab yang
 * sama (keluar lalu masuk akun lain) ikut terbawa dan tampil sebagai "Materi ini sudah dihapus".
 */
function load(userId: string | null): StudySession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { ownerId, ...parsed } = JSON.parse(raw) as Partial<StudySession> & { ownerId?: unknown };
    if (!userId || ownerId !== userId) return null;
    // Cache lama (materi contoh, atau format sebelum /sessions) dibuang.
    if (
      typeof parsed.materialId !== 'string' ||
      !UUID_RE.test(parsed.materialId) ||
      typeof parsed.materialTitle !== 'string' ||
      !('serverId' in parsed)
    ) {
      return null;
    }
    return parsed as StudySession;
  } catch {
    return null;
  }
}

/** Masih ada sesi aktif di server (409). UI menawarkan melanjutkan atau membatalkannya. */
export class ActiveSessionConflict extends Error {
  constructor(readonly activeSessionId: string) {
    super('Masih ada sesi aktif');
    this.name = 'ActiveSessionConflict';
  }
}

type Ctx = {
  session: StudySession | null;
  /** true selama cache disinkronkan dengan server saat halaman dibuka. */
  syncing: boolean;
  /** URL objek pratinjau foto. Hilang saat reload (file tidak disimpan di browser). */
  photoUrl: string | null;
  /** File foto yang dipilih (hanya di memori). */
  photoFile: File | null;
  /** Pilih materi untuk sesi baru (belum dikirim ke server). */
  selectMaterial: (materialId: string, materialTitle: string, classId?: string | null) => void;
  /** Mulai waktu fokus di server. Melempar ActiveSessionConflict bila masih ada sesi aktif. */
  start: () => Promise<void>;
  /** Lanjutkan sesi yang sudah ada di server (mis. dari perangkat lain). */
  resume: (sessionId: string) => Promise<void>;
  /** Pakai sesi latihan ulang yang baru dibuat server (POST /spaced/:id/start). */
  beginReview: (s: ServerSession, concepts: string[]) => void;
  /** Batalkan sesi aktif lain lalu mulai sesi baru. */
  replaceActive: (sessionId: string) => Promise<void>;
  setPreset: (minutes: number) => void;
  /** F3: campur materi kedua sebelum waktu fokus dimulai; null = kembali ke satu materi. */
  setSecondMaterial: (material: { id: string; title: string } | null) => void;
  finishFocus: (seconds: number) => void;
  /** Batalkan sesi di server dan buka bacaan lagi; materi tetap terpilih. */
  resetTimer: () => Promise<void>;
  /** Simpan tebakan di server; ini juga mengakhiri waktu fokus menurut server. */
  saveJol: (score: number) => Promise<void>;
  setPhoto: (file: File | null) => void;
  setSubmission: (submissionId: string) => void;
  /** Muat ulang keadaan sesi dari server. */
  refresh: () => Promise<void>;
  /** F2: simpan foto di perangkat dan kirim otomatis saat koneksi kembali. */
  queuePhoto: (file: File) => Promise<void>;
  /** F2: kirim antrean sekarang (juga berjalan otomatis saat online dan tiap 30 detik). */
  syncNow: () => Promise<void>;
  /** F2: alasan kiriman tertunda yang ditolak server, untuk ditampilkan sekali. */
  syncNotice: string | null;
  dismissSyncNotice: () => void;
  /** Tutup sesi: sesi yang masih aktif di server dibatalkan dulu. */
  clear: () => Promise<void>;
};

const StudySessionContext = createContext<Ctx | null>(null);

/** Jeda percobaan ulang antrean selama masih ada kiriman yang menunggu. */
export const OUTBOX_RETRY_MS = 30_000;

export function StudySessionProvider({ children, store = defaultOutbox }: { children: ReactNode; store?: OutboxStore }) {
  const auth = useAuth();
  const userId = auth.status === 'authenticated' ? auth.user.id : null;
  const [session, setSession] = useState<StudySession | null>(() => load(userId));
  const [syncing, setSyncing] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const flushing = useRef(false);

  useEffect(() => {
    try {
      if (session && userId) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, ownerId: userId }));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // sessionStorage diblokir: sesi tetap jalan di memori.
    }
  }, [session, userId]);

  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );

  const adopt = useCallback((s: ServerSession) => setSession((prev) => mergeServer(s, prev)), []);

  const refresh = useCallback(async () => {
    const current = sessionRef.current;
    try {
      if (current?.serverId) {
        adopt(await sessionsApi.get(current.serverId));
        return;
      }
      // Belum mulai di perangkat ini: pulihkan sesi aktif dari server (mis. tab lain atau perangkat lain).
      const active = await sessionsApi.active();
      if (active) adopt(active);
    } catch (err) {
      // Sesi di cache bukan milik akun ini lagi (mis. ganti akun): buang.
      if (err instanceof ApiError && err.status === 404) setSession(null);
    }
  }, [adopt]);

  /** F2: kirim antrean, lalu cocokkan hasilnya dengan sesi di layar. Sesi lain cukup terlihat di Riwayat. */
  const syncNow = useCallback(async () => {
    if (!userId || flushing.current) return;
    flushing.current = true;
    try {
      const { events } = await flushOutbox(
        store,
        { submitJol: sessionsApi.submitJol, upload: (photo, sessionId) => scansApi.upload(photo, { sessionId }) },
        userId,
      );
      let reload = false;
      for (const event of events) {
        if (sessionRef.current?.serverId !== event.sessionId) continue;
        if (event.kind === 'jol-sent') {
          adopt(event.session);
        } else if (event.kind === 'photo-sent') {
          setSession((prev) => (prev ? { ...prev, submissionId: event.submissionId, pendingSync: undefined } : prev));
        } else {
          if (event.kind === 'dropped') setSyncNotice(event.message);
          // Tebakan yang ditolak permanen ikut membuang foto sesi itu dari antrean.
          const clearsAll = event.kind === 'dropped' && event.what === 'jol';
          setSession((prev) => {
            if (!prev) return prev;
            const left = clearsAll ? {} : { ...prev.pendingSync, [event.what]: undefined };
            return { ...prev, pendingSync: left.jol || left.photo ? left : undefined };
          });
          reload = true;
        }
      }
      if (reload) await refresh();
    } catch {
      // IndexedDB tidak terbaca: antrean dicoba lagi pada giliran berikutnya.
    } finally {
      flushing.current = false;
    }
  }, [userId, store, adopt, refresh]);

  useEffect(() => {
    let cancelled = false;
    // Antrean dikirim dulu supaya keadaan server yang dimuat sesudahnya sudah memuat kiriman tertunda.
    void syncNow()
      .then(refresh)
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, syncNow]);

  const waiting = Boolean(session?.pendingSync);
  useEffect(() => {
    const run = () => void syncNow();
    window.addEventListener('online', run);
    const timer = waiting ? window.setInterval(run, OUTBOX_RETRY_MS) : undefined;
    return () => {
      window.removeEventListener('online', run);
      window.clearInterval(timer);
    };
  }, [syncNow, waiting]);

  /** Kiriman tertunda milik sesi yang ditutup atau dibatalkan tidak perlu dikirim lagi. */
  const dropQueued = async (sessionId: string | null | undefined) => {
    if (!sessionId) return;
    await Promise.all([store.remove(outboxId('jol', sessionId)), store.remove(outboxId('photo', sessionId))]).catch(() => undefined);
  };

  const update = useCallback((fn: (s: StudySession) => StudySession) => {
    setSession((prev) => (prev ? fn(prev) : prev));
  }, []);

  const resetPhoto = () => {
    setPhotoFile(null);
    setPhotoUrl(null);
  };

  const start = async () => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      const s = await sessionsApi.start(
        current.materialId,
        current.presetMinutes,
        current.classId ?? null,
        current.secondMaterial?.id ?? null,
      );
      resetPhoto();
      setSession({ ...fromServer(s, current), materialTitle: current.materialTitle, focusSeconds: null });
    } catch (err) {
      const activeId = activeSessionIdOf(err);
      if (activeId) throw new ActiveSessionConflict(activeId);
      throw err;
    }
  };

  const value: Ctx = {
    session,
    syncing,
    photoUrl,
    photoFile,
    selectMaterial: (materialId, materialTitle, classId = null) => {
      resetPhoto();
      setSession((prev) => emptySession(materialId, materialTitle, prev?.presetMinutes, classId));
    },
    start,
    resume: async (sessionId) => {
      resetPhoto();
      setSession(fromServer(await sessionsApi.get(sessionId)));
    },
    beginReview: (s, concepts) => {
      resetPhoto();
      setSession({ ...fromServer(s), reviewConcepts: concepts });
    },
    replaceActive: async (sessionId) => {
      await sessionsApi.cancel(sessionId);
      await start();
    },
    setPreset: (minutes) => update((s) => ({ ...s, presetMinutes: minutes })),
    setSecondMaterial: (material) => update((s) => (s.serverId ? s : { ...s, secondMaterial: material })),
    finishFocus: (seconds) => update((s) => ({ ...s, focusSeconds: seconds })),
    resetTimer: async () => {
      const current = sessionRef.current;
      if (current?.serverId) await sessionsApi.cancel(current.serverId);
      await dropQueued(current?.serverId);
      update((s) => ({
        ...emptySession(s.materialId, s.materialTitle, s.presetMinutes, s.classId ?? null),
        secondMaterial: s.secondMaterial ?? null,
      }));
    },
    saveJol: async (score) => {
      const current = sessionRef.current;
      if (!current?.serverId || !userId) return;
      try {
        adopt(await sessionsApi.submitJol(current.serverId, score));
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        // F2: koneksi putus. Tebakan disimpan di perangkat; server tetap menghitung waktu fokus saat tebakan tiba.
        const sessionId = current.serverId;
        await store.put({ id: outboxId('jol', sessionId), kind: 'jol', userId, sessionId, score, savedAt: Date.now() });
        update((s) =>
          s.serverId === sessionId
            ? {
                ...s,
                jolScore: score,
                status: 'AWAITING_SCAN',
                validity: null,
                scanDeadlineAt: null,
                pendingSync: { ...s.pendingSync, jol: true },
              }
            : s,
        );
      }
    },
    setPhoto: (file) => {
      setPhotoFile(file);
      setPhotoUrl(file ? URL.createObjectURL(file) : null);
      update((s) => ({ ...s, photo: file ? { name: file.name, sizeBytes: file.size } : null }));
    },
    setSubmission: (submissionId) => update((s) => ({ ...s, submissionId })),
    refresh,
    queuePhoto: async (file) => {
      const current = sessionRef.current;
      if (!current?.serverId || !userId) return;
      const sessionId = current.serverId;
      await store.put({
        id: outboxId('photo', sessionId),
        kind: 'photo',
        userId,
        sessionId,
        bytes: await file.arrayBuffer(),
        name: file.name,
        type: file.type,
        savedAt: Date.now(),
      });
      update((s) => (s.serverId === sessionId ? { ...s, pendingSync: { ...s.pendingSync, photo: true } } : s));
      void syncNow();
    },
    syncNow,
    syncNotice,
    dismissSyncNotice: () => setSyncNotice(null),
    clear: async () => {
      const current = sessionRef.current;
      const active = current?.status === 'FOCUS_ACTIVE' || (current?.status === 'AWAITING_SCAN' && !current.submissionId);
      if (current?.serverId && active) {
        // Gagal membatalkan (mis. offline) tidak menahan pelajar; server menutupnya sendiri saat kedaluwarsa.
        await sessionsApi.cancel(current.serverId).catch(() => undefined);
      }
      await dropQueued(current?.serverId);
      resetPhoto();
      setSession(null);
    },
  };

  return <StudySessionContext.Provider value={value}>{children}</StudySessionContext.Provider>;
}

export function useStudySession() {
  const ctx = useContext(StudySessionContext);
  if (!ctx) throw new Error('useStudySession harus di dalam StudySessionProvider');
  return ctx;
}

/** Judul sesi untuk tampilan: "A + B" untuk sesi interleaving (F3). */
export function sessionTitle(s: Pick<StudySession, 'materialTitle' | 'secondMaterial'>): string {
  return s.secondMaterial ? `${s.materialTitle} + ${s.secondMaterial.title}` : s.materialTitle;
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return s === 0 ? `${m} menit` : `${m} menit ${s} detik`;
}
