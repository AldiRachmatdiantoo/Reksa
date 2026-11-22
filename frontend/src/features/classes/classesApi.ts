import { ApiError, apiRequest } from '@/core/apiClient';
import { useLoad } from '@/shared/hooks/useLoad';

// Sama dengan backend/src/features/classes/classes.schema.ts (PRD FR-09).
export const CLASS_NAME_MAX = 100;
export const CLASS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type ClassAccess = 'OWNER' | 'MEMBER';

export type ClassInfo = {
  id: string;
  name: string;
  /** Hanya untuk guru pemilik kelas; anggota mendapat null. */
  classCode: string | null;
  educatorName: string;
  memberCount: number;
  access: ClassAccess;
  createdAt: string;
  joinedAt: string | null;
};

export type ClassMember = { studentId: string; fullName: string; joinedAt: string };

const path = (id: string) => `/classes/${encodeURIComponent(id)}`;

export const classesApi = {
  list: (signal?: AbortSignal) => apiRequest<{ classes: ClassInfo[] }>('/classes', { signal }).then((r) => r.classes),
  create: (name: string) => apiRequest<{ class: ClassInfo }>('/classes', { method: 'POST', body: { name } }).then((r) => r.class),
  rename: (id: string, name: string) =>
    apiRequest<{ class: ClassInfo }>(path(id), { method: 'PATCH', body: { name } }).then((r) => r.class),
  rotateCode: (id: string) => apiRequest<{ class: ClassInfo }>(`${path(id)}/code`, { method: 'POST' }).then((r) => r.class),
  remove: (id: string) => apiRequest<void>(path(id), { method: 'DELETE' }),
  join: (classCode: string) =>
    apiRequest<{ class: ClassInfo }>('/classes/join', { method: 'POST', body: { classCode } }).then((r) => r.class),
  members: (id: string, signal?: AbortSignal) =>
    apiRequest<{ members: ClassMember[] }>(`${path(id)}/members`, { signal }).then((r) => r.members),
  removeMember: (id: string, studentId: string) =>
    apiRequest<void>(`${path(id)}/members/${encodeURIComponent(studentId)}`, { method: 'DELETE' }),
};

/** Tampilan kode untuk dibacakan: "ABCD EFGH". */
export function formatClassCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

/** Pesan untuk siswa saat bergabung gagal. 404 memakai pesan backend (sama untuk kode salah apa pun). */
export function joinErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Gagal bergabung. Coba lagi.';
  switch (err.status) {
    case 0:
      return 'Server REKSA tidak bisa dihubungi. Periksa koneksimu lalu coba lagi.';
    case 403:
    case 404:
      // 403 EMAIL_NOT_VERIFIED dan 404 kode salah: pesan backend sudah jelas untuk siswa.
      return err.message;
    case 429:
      return 'Sudah 10 kali mencoba dalam satu jam terakhir. Tanyakan kode yang benar ke gurumu, lalu coba lagi nanti.';
    default:
      return err.status >= 500 ? 'Server sedang bermasalah. Coba lagi sebentar lagi.' : 'Gagal bergabung. Coba lagi.';
  }
}

export function useClasses() {
  return useLoad((signal) => classesApi.list(signal), []);
}

export function useClassMembers(id: string | null) {
  return useLoad<ClassMember[]>((signal) => (id ? classesApi.members(id, signal) : Promise.resolve([])), [id]);
}

export function formatJoinDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
