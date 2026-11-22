import { ApiError, apiRequest } from '@/core/apiClient';

// Sama dengan backend/src/features/study-sessions/sessions.schema.ts (SessionView, preset).

export type PomodoroPreset = 'CLASSIC_25_5' | 'DEEP_45_10' | 'FOCUS_SPRINT_15_3';
export type SessionStatus = 'FOCUS_ACTIVE' | 'AWAITING_JOL' | 'AWAITING_SCAN' | 'COMPLETED' | 'EXPIRED';

export type ServerSession = {
  id: string;
  materialId: string;
  materialTitle: string | null;
  classId: string | null;
  sessionType: 'INITIAL_BLURTING' | 'SPACED_REVIEW';
  preset: PomodoroPreset | null;
  status: SessionStatus;
  validity: 'VALID' | 'SHORT_FOCUS' | null;
  plannedDurationSec: number;
  actualDurationSec: number | null;
  predictedJolScore: number | null;
  startedAt: string;
  focusEndsAt: string;
  focusDeadlineAt: string;
  focusEndedAt: string | null;
  scanDeadlineAt: string | null;
  hasSubmission: boolean;
  submissionId: string | null;
  completedAt: string | null;
};

/** Pilihan menit di UI ↔ preset backend. Durasi selalu ditentukan server dari preset. */
export const PRESET_BY_MINUTES: Record<number, PomodoroPreset> = {
  25: 'CLASSIC_25_5',
  45: 'DEEP_45_10',
  15: 'FOCUS_SPRINT_15_3',
};

export function minutesOf(session: Pick<ServerSession, 'plannedDurationSec'>): number {
  return Math.round(session.plannedDurationSec / 60);
}

const path = (id: string) => `/sessions/${encodeURIComponent(id)}`;

export const sessionsApi = {
  /** classId untuk materi kelas: tanpa itu sesi tidak terlihat di ledger guru (FR-07). */
  start: (materialId: string, minutes: number, classId: string | null = null) =>
    apiRequest<{ session: ServerSession }>('/sessions', {
      method: 'POST',
      body: { materialId, preset: PRESET_BY_MINUTES[minutes] ?? 'CLASSIC_25_5', ...(classId ? { classId } : {}) },
    }).then((r) => r.session),
  active: (signal?: AbortSignal) =>
    apiRequest<{ session: ServerSession | null }>('/sessions/active', { signal }).then((r) => r.session),
  get: (id: string, signal?: AbortSignal) => apiRequest<{ session: ServerSession }>(path(id), { signal }).then((r) => r.session),
  submitJol: (id: string, predictedJolScore: number) =>
    apiRequest<{ session: ServerSession }>(`${path(id)}/jol`, { method: 'PATCH', body: { predictedJolScore } }).then(
      (r) => r.session,
    ),
  cancel: (id: string) => apiRequest<{ session: ServerSession }>(`${path(id)}/cancel`, { method: 'POST' }).then((r) => r.session),
  issueQr: (id: string) =>
    apiRequest<{ qrToken: string; expiresInSec: number }>(`${path(id)}/qr-bridge`, { method: 'POST' }),
  /** URL stream SSE untuk layar laptop (EventSource, cookie ikut otomatis karena origin sama). */
  qrEventsUrl: (id: string) => `/api/v1${path(id)}/qr-bridge/events`,
};

/** Id sesi aktif dari 409 ACTIVE_SESSION_EXISTS, selain itu null. */
export function activeSessionIdOf(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.code !== 'ACTIVE_SESSION_EXISTS') return null;
  const id = (err.details as { activeSessionId?: unknown } | undefined)?.activeSessionId;
  return typeof id === 'string' ? id : null;
}

export function sessionErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Sesi belajar gagal disimpan. Coba lagi.';
  switch (err.code) {
    case 'SESSION_EXPIRED':
      return 'Sesi ini sudah kedaluwarsa karena terlalu lama. Mulai sesi baru, ya.';
    case 'INVALID_SESSION_STATE':
      return err.message;
    case 'ACTIVE_SESSION_EXISTS':
      return 'Kamu masih punya sesi belajar yang belum selesai.';
  }
  if (err.status === 0) return 'Server REKSA tidak bisa dihubungi. Periksa koneksimu lalu coba lagi.';
  if (err.status === 404) return 'Materi atau sesi ini tidak ditemukan. Pilih materi lagi.';
  if (err.status === 429) return 'Terlalu banyak sesi dimulai dalam satu jam. Coba lagi nanti.';
  return err.status >= 500 ? 'Server sedang bermasalah. Coba lagi sebentar lagi.' : err.message;
}
