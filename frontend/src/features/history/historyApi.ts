import { apiRequest } from '@/core/apiClient';

// Kontrak dari backend/src/features/history/history.schema.ts (FR-05 riwayat, FR-11 tren Pro).
export type HistoryItem = {
  submissionId: string;
  sessionId: string;
  sessionType: 'INITIAL_BLURTING' | 'SPACED_REVIEW';
  /** null jika materinya sudah tidak bisa dibaca, mis. kamu keluar dari kelas pemilik materi. */
  materialTitle: string | null;
  startedAt: string;
  actualDurationSec: number | null;
  validity: 'VALID' | 'SHORT_FOCUS' | null;
  predictedJolScore: number;
  auditStatus: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | string;
  actualScore: number | null;
  jolDelta: number | null;
  blindSpotCount: number;
  createdAt: string;
};

export type HistoryPage = { items: HistoryItem[]; nextCursor: string | null };

export type CalibrationPoint = { submissionId: string; auditedAt: string; predicted: number; actual: number; gap: number };

export type CalibrationTrend = {
  points: CalibrationPoint[];
  summary: { count: number; meanAbsGap: number | null; meanSignedGap: number | null };
};

export const historyApi = {
  list: (cursor: string | null, signal?: AbortSignal) =>
    apiRequest<HistoryPage>(`/history?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
  calibration: (signal?: AbortSignal) => apiRequest<CalibrationTrend>('/history/calibration', { signal }),
};

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const shortFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });

export function formatHistoryDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatShortDate(iso: string): string {
  return shortFormat.format(new Date(iso));
}

/** Kalimat kecenderungan dari rata-rata selisih bertanda (tebakan dikurangi nilai asli). */
export function tendencyText(meanSignedGap: number): string {
  if (meanSignedGap > 5)
    return `Rata-rata tebakanmu ${formatGap(meanSignedGap)} poin di atas nilai asli. Kamu cenderung merasa lebih paham dari hasilnya.`;
  if (meanSignedGap < -5)
    return `Rata-rata tebakanmu ${formatGap(-meanSignedGap)} poin di bawah nilai asli. Kamu lebih paham dari yang kamu kira.`;
  return 'Tebakanmu tidak condong terlalu tinggi atau terlalu rendah.';
}

export function formatGap(n: number): string {
  return n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
}
