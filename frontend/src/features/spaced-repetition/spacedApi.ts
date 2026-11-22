import { ApiError, apiRequest } from '@/core/apiClient';
import type { ServerSession } from '@/features/studio/sessionsApi';

// Kontrak dari backend/src/features/spaced-repetition/spaced.schema.ts (PRD FR-06).
export type ScheduleBlindSpot = { concept: string; importanceLevel: string | null; explanation: string | null };

export type ScheduleItem = {
  id: string;
  materialId: string;
  /** null jika materinya sudah tidak bisa dibaca, mis. kamu keluar dari kelas pemilik materi. */
  materialTitle: string | null;
  originSubmissionId: string;
  intervalDay: number;
  nextReviewAt: string;
  isCompleted: boolean;
  blindSpots: ScheduleBlindSpot[];
};

export type DueResponse = { due: ScheduleItem[]; upcoming: ScheduleItem[] };

export const spacedApi = {
  due: (signal?: AbortSignal) => apiRequest<DueResponse>('/spaced/due', { signal }),
  /** Mulai latihan ulang yang dinilai AI: sesi 5 menit, tidak memotong jatah cek harian. */
  start: (id: string) =>
    apiRequest<{ session: ServerSession }>(`/spaced/${encodeURIComponent(id)}/start`, { method: 'POST', body: {} }).then((r) => r.session),
  complete: (id: string) =>
    apiRequest<{ schedule: ScheduleItem }>(`/spaced/${encodeURIComponent(id)}/complete`, { method: 'POST', body: {} }).then(
      (r) => r.schedule,
    ),
};

const dayFormat = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

export function formatReviewDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

/** "hari ini", "kemarin", atau "3 hari lalu", dihitung per tanggal kalender lokal. */
export function overdueLabel(iso: string, now = new Date()): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'hari ini';
  if (days === 1) return 'sejak kemarin';
  return `sejak ${days} hari lalu`;
}

/** Pesan untuk gagal memulai latihan ulang. */
export function startReviewErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'ACTIVE_SESSION_EXISTS') return 'Masih ada sesi belajar yang berjalan. Selesaikan atau batalkan dulu di menu Belajar.';
    if (err.code === 'REVIEW_LIMIT_REACHED')
      return 'Latihan ini sudah dicoba 3 kali. Cocokkan sendiri dengan penjelasannya, lalu tandai selesai.';
    if (err.status === 404) return 'Materinya sudah tidak bisa dibuka, jadi latihan ini tidak bisa dicek. Cocokkan sendiri saja.';
    if (err.status === 409) return 'Latihan ini sudah selesai atau belum jatuh tempo. Muat ulang halaman.';
  }
  return 'Latihan belum bisa dimulai. Periksa koneksimu lalu coba lagi.';
}

export const IMPORTANCE_LABEL: Record<string, string> = { HIGH: 'Penting', MEDIUM: 'Sedang', LOW: 'Ringan' };
