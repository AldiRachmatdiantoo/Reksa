import { apiRequest } from '@/core/apiClient';

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

export const IMPORTANCE_LABEL: Record<string, string> = { HIGH: 'Penting', MEDIUM: 'Sedang', LOW: 'Ringan' };
