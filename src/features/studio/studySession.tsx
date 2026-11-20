import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Progres satu sesi belajar di sisi klien (tidak ada token di sini).
 * Disimpan di sessionStorage supaya refresh halaman tidak menghapus timer
 * atau tebakan. Saat endpoint /sessions siap, `startedAt` dan durasi divalidasi
 * server (PRD FR-02) dan state ini menjadi cache tampilan saja.
 */
export type StudySession = {
  materialId: string;
  presetMinutes: number;
  /** Epoch ms saat timer mulai; null = belum mulai. */
  startedAt: number | null;
  /** Detik fokus yang tercatat saat siswa menekan Selesai. */
  focusSeconds: number | null;
  /** Judgement of Learning 0..100, terkunci setelah disimpan. */
  jolScore: number | null;
  photo: { name: string; sizeBytes: number } | null;
};

const STORAGE_KEY = 'reksa-study-session';

const emptySession = (materialId: string): StudySession => ({
  materialId,
  presetMinutes: 25,
  startedAt: null,
  focusSeconds: null,
  jolScore: null,
  photo: null,
});

function load(): StudySession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StudySession) : null;
  } catch {
    return null;
  }
}

type Ctx = {
  session: StudySession | null;
  /** URL objek pratinjau foto. Hilang saat reload (file tidak disimpan di browser). */
  photoUrl: string | null;
  start: (materialId: string, presetMinutes: number) => void;
  setPreset: (materialId: string, minutes: number) => void;
  finishFocus: (seconds: number) => void;
  resetTimer: () => void;
  saveJol: (score: number) => void;
  setPhoto: (file: File | null) => void;
  clear: () => void;
};

const StudySessionContext = createContext<Ctx | null>(null);

export function StudySessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StudySession | null>(load);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

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

  const update = useCallback((fn: (s: StudySession) => StudySession, materialId?: string) => {
    setSession((prev) => fn(prev ?? emptySession(materialId ?? '')));
  }, []);

  const value: Ctx = {
    session,
    photoUrl,
    start: (materialId, presetMinutes) =>
      setSession({ ...emptySession(materialId), presetMinutes, startedAt: Date.now() }),
    setPreset: (materialId, minutes) => update((s) => ({ ...s, materialId, presetMinutes: minutes }), materialId),
    finishFocus: (seconds) => update((s) => ({ ...s, focusSeconds: seconds })),
    resetTimer: () => update((s) => ({ ...s, startedAt: null, focusSeconds: null })),
    saveJol: (score) => update((s) => ({ ...s, jolScore: score })),
    setPhoto: (file) => {
      setPhotoUrl(file ? URL.createObjectURL(file) : null);
      update((s) => ({ ...s, photo: file ? { name: file.name, sizeBytes: file.size } : null }));
    },
    clear: () => {
      setPhotoUrl(null);
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
