import { apiRequest } from '@/core/apiClient';

// Kontrak dari backend/src/features/institutions/institution.schema.ts (PRD FR-10).
export type InstitutionRef = { id: string; name: string };
export type InstitutionEducator = { id: string; fullName: string; email: string; classCount: number };
export type InstitutionClass = {
  id: string;
  name: string;
  educator: { id: string; fullName: string };
  memberCount: number;
  auditedStudents: number | null;
  completedSessions: number | null;
  avgScore: number | null;
  /** true: kurang dari minGroupSize siswa yang dicek, angkanya disembunyikan. */
  suppressed: boolean;
};
export type InstitutionOverview = {
  institution: InstitutionRef;
  educators: InstitutionEducator[];
  classes: InstitutionClass[];
  minGroupSize: number;
};
export type InstitutionConcept = {
  materialId: string;
  materialTitle: string;
  concept: string;
  studentsMissing: number;
  studentsAudited: number;
  percent: number;
};
export type InviteStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export type EducatorInvite = { id: string; createdAt: string; expiresAt: string; revokedAt: string | null; status: InviteStatus };

export const institutionApi = {
  overview: (signal?: AbortSignal) => apiRequest<InstitutionOverview>('/institution', { signal }),
  concepts: (signal?: AbortSignal) =>
    apiRequest<{ concepts: InstitutionConcept[]; minGroupSize: number }>('/institution/concepts', { signal }),
  invites: (signal?: AbortSignal) => apiRequest<{ invites: EducatorInvite[] }>('/institution/invites', { signal }).then((r) => r.invites),
  /** Kode mentah hanya ada di jawaban ini. */
  createInvite: () =>
    apiRequest<{ invite: EducatorInvite & { code: string } }>('/institution/invites', { method: 'POST', body: {} }).then((r) => r.invite),
  revokeInvite: (id: string) =>
    apiRequest<{ invite: EducatorInvite }>(`/institution/invites/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => r.invite),
  detachEducator: (id: string) => apiRequest<void>(`/institution/educators/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Sisi pengajar.
  mine: (signal?: AbortSignal) => apiRequest<{ institution: InstitutionRef | null }>('/me/institution', { signal }).then((r) => r.institution),
  join: (code: string) =>
    apiRequest<{ institution: InstitutionRef }>('/me/institution', { method: 'POST', body: { code } }).then((r) => r.institution),
};

export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  ACTIVE: 'Aktif',
  EXPIRED: 'Kedaluwarsa',
  REVOKED: 'Dicabut',
};

/** Rata-rata skor satu desimal, gaya Indonesia: 71,5 */
export function formatScore(score: number | null): string {
  return score === null ? '-' : score.toLocaleString('id-ID', { maximumFractionDigits: 1 });
}
