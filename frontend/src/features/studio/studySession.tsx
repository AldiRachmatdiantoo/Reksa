import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '@/core/apiClient';
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
};

const STORAGE_KEY = 'reksa-study-session';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const emptySession = (materialId: string, materialTitle: string, presetMinutes = 25): StudySession => ({
  materialId,
  materialTitle,
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

/** Menyalin keadaan server ke cache. Judul materi lama dipakai bila server tidak bisa membacanya lagi. */
export function fromServer(s: ServerSession, previous?: StudySession | null): StudySession {
  const awaitingOrLater = s.status !== 'FOCUS_ACTIVE';
  return {
    materialId: s.materialId,
    materialTitle: s.materialTitle ?? previous?.materialTitle ?? 'Materi',
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
  };
}

function load(): StudySession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudySession>;
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
  selectMaterial: (materialId: string, materialTitle: string) => void;
  /** Mulai waktu fokus di server. Melempar ActiveSessionConflict bila masih ada sesi aktif. */
  start: () => Promise<void>;
  /** Lanjutkan sesi yang sudah ada di server (mis. dari perangkat lain). */
  resume: (sessionId: string) => Promise<void>;
  /** Batalkan sesi aktif lain lalu mulai sesi baru. */
  replaceActive: (sessionId: string) => Promise<void>;
  setPreset: (minutes: number) => void;
  finishFocus: (seconds: number) => void;
  /** Batalkan sesi di server dan buka bacaan lagi; materi tetap terpilih. */
  resetTimer: () => Promise<void>;
  /** Simpan tebakan di server; ini juga mengakhiri waktu fokus menurut server. */
  saveJol: (score: number) => Promise<void>;
  setPhoto: (file: File | null) => void;
  setSubmission: (submissionId: string) => void;
  /** Muat ulang keadaan sesi dari server. */
  refresh: () => Promise<void>;
  /** Tutup sesi: sesi yang masih aktif di server dibatalkan dulu. */
  clear: () => Promise<void>;
};

const StudySessionContext = createContext<Ctx | null>(null);

export function StudySessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StudySession | null>(load);
  const [syncing, setSyncing] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    try {
      if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // sessionStorage diblokir: sesi tetap jalan di memori.
    }
  }, [session]);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const adopt = useCallback((s: ServerSession) => setSession((prev) => fromServer(s, prev)), []);

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

  useEffect(() => {
    let cancelled = false;
    void refresh().finally(() => {
      if (!cancelled) setSyncing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

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
      const s = await sessionsApi.start(current.materialId, current.presetMinutes);
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
    selectMaterial: (materialId, materialTitle) => {
      resetPhoto();
      setSession((prev) => emptySession(materialId, materialTitle, prev?.presetMinutes));
    },
    start,
    resume: async (sessionId) => {
      resetPhoto();
      setSession(fromServer(await sessionsApi.get(sessionId)));
    },
    replaceActive: async (sessionId) => {
      await sessionsApi.cancel(sessionId);
      await start();
    },
    setPreset: (minutes) => update((s) => ({ ...s, presetMinutes: minutes })),
    finishFocus: (seconds) => update((s) => ({ ...s, focusSeconds: seconds })),
    resetTimer: async () => {
      const current = sessionRef.current;
      if (current?.serverId) await sessionsApi.cancel(current.serverId);
      update((s) => ({ ...emptySession(s.materialId, s.materialTitle, s.presetMinutes) }));
    },
    saveJol: async (score) => {
      const current = sessionRef.current;
      if (!current?.serverId) return;
      adopt(await sessionsApi.submitJol(current.serverId, score));
    },
    setPhoto: (file) => {
      setPhotoFile(file);
      setPhotoUrl(file ? URL.createObjectURL(file) : null);
      update((s) => ({ ...s, photo: file ? { name: file.name, sizeBytes: file.size } : null }));
    },
    setSubmission: (submissionId) => update((s) => ({ ...s, submissionId })),
    refresh,
    clear: async () => {
      const current = sessionRef.current;
      const active = current?.status === 'FOCUS_ACTIVE' || (current?.status === 'AWAITING_SCAN' && !current.submissionId);
      if (current?.serverId && active) {
        // Gagal membatalkan (mis. offline) tidak menahan pelajar; server menutupnya sendiri saat kedaluwarsa.
        await sessionsApi.cancel(current.serverId).catch(() => undefined);
      }
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

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return s === 0 ? `${m} menit` : `${m} menit ${s} detik`;
}
