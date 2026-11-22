import { apiRequest } from '@/core/apiClient';

// Kontrak dari backend/src/features/governance/governance.schema.ts (PRD FR-07).
export type LedgerEntry = {
  submissionId: string;
  student: { id: string; fullName: string };
  material: { id: string; title: string | null };
  session: {
    startedAt: string;
    focusEndedAt: string | null;
    plannedDurationSec: number;
    actualDurationSec: number | null;
    validity: 'VALID' | 'SHORT_FOCUS' | null;
  };
  predictedJolScore: number;
  actualScore: number;
  jolDelta: number;
  blindSpotCount: number;
  ledgerHash: string;
  /** false: data yang tersimpan tidak lagi cocok dengan hash saat dikunci. */
  hashValid: boolean;
  /** Signed URL 5 menit; null jika storage gagal. */
  photoUrl: string | null;
  submittedAt: string;
  auditedAt: string;
};

export type LedgerPage = { entries: LedgerEntry[]; nextCursor: string | null };

export type LedgerVerification = { valid: true; sessionDate: string } | { valid: false };

export const governanceApi = {
  ledger: (classId: string, cursor: string | null, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: '20' });
    if (cursor) params.set('cursor', cursor);
    return apiRequest<LedgerPage>(`/governance/classes/${encodeURIComponent(classId)}/ledger?${params}`, { signal });
  },
  verify: (hash: string) => apiRequest<LedgerVerification>(`/ledger/verify/${encodeURIComponent(hash)}`),
};

const dateTime = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });

export function formatSessionWindow(startedAt: string, endedAt: string | null): string {
  const start = dateTime.format(new Date(startedAt));
  return endedAt ? `${start} sampai ${time.format(new Date(endedAt))}` : start;
}

export function formatMinutes(seconds: number | null): string {
  if (seconds === null) return '-';
  const minutes = Math.round(seconds / 60);
  return `${minutes} menit`;
}

/** Selisih tebakan dan skor dalam kalimat pendek untuk guru. */
export function jolDeltaLabel(delta: number): string {
  if (Math.abs(delta) <= 10) return 'tebakannya tepat';
  return delta > 0 ? `meremehkan diri ${delta} poin` : `terlalu yakin ${-delta} poin`;
}
