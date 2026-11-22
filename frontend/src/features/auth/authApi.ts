import { apiRequest } from '@/core/apiClient';

// Kontrak dari backend/src/features/auth/auth.schema.ts (repo Reksa).
export type Role = 'STUDENT' | 'EDUCATOR' | 'INSTITUTION_ADMIN';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  tier: 'FREE' | 'PRO';
  /** Wajib true untuk bergabung ke kelas (FR-14). */
  emailVerified: boolean;
  /** Akhir masa Pro dari kode aktivasi (FR-11). null jika tidak pernah aktif. */
  proExpiresAt: string | null;
  /** null pada akun lama yang dibuat sebelum FR-13. */
  birthYear: number | null;
  /** true jika user belum menyetujui versi syarat dan kebijakan privasi terbaru (FR-13). */
  consentRequired: boolean;
};

export type RegisterInput = {
  email: string;
  password: string;
  fullName: string;
  role: 'STUDENT' | 'EDUCATOR';
  birthYear: number;
  acceptTerms: true;
  adultConfirmed: boolean;
};

export type ConsentInput = { acceptTerms: true; birthYear?: number; adultConfirmed: boolean };

export type ProStatus = { tier: 'FREE' | 'PRO'; proExpiresAt: string | null };

export type DataExport = { url: string; expiresAt: string };

export type LoginInput = { email: string; password: string };

type UserResponse = { user: AuthUser };

export const authApi = {
  register: (input: RegisterInput) => apiRequest<UserResponse>('/auth/register', { method: 'POST', body: input }).then((r) => r.user),
  login: (input: LoginInput) => apiRequest<UserResponse>('/auth/login', { method: 'POST', body: input }).then((r) => r.user),
  me: (signal?: AbortSignal) => apiRequest<UserResponse>('/auth/me', { signal }).then((r) => r.user),
  /** Logout ada di DELETE /auth/refresh karena cookie refresh hanya dikirim ke path itu. */
  logout: () => apiRequest<void>('/auth/refresh', { method: 'DELETE' }),
  verifyEmail: (token: string) => apiRequest<void>('/auth/verify-email', { method: 'POST', body: { token } }),
  resendVerification: () => apiRequest<{ message: string }>('/auth/verify-email/resend', { method: 'POST' }),
  /** Selalu 202 dengan pesan yang sama, terdaftar atau tidak. */
  forgotPassword: (email: string) => apiRequest<{ message: string }>('/auth/password/forgot', { method: 'POST', body: { email } }),
  resetPassword: (token: string, newPassword: string) =>
    apiRequest<void>('/auth/password/reset', { method: 'POST', body: { token, newPassword } }),
  updateProfile: (fullName: string) => apiRequest<UserResponse>('/me', { method: 'PATCH', body: { fullName } }).then((r) => r.user),
  /** Perangkat lain dikeluarkan; perangkat ini mendapat cookie sesi baru. */
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<UserResponse>('/me/password', { method: 'PATCH', body: { currentPassword, newPassword } }).then((r) => r.user),
  recordConsent: (input: ConsentInput) => apiRequest<UserResponse>('/me/consent', { method: 'POST', body: input }).then((r) => r.user),
  activatePro: (code: string) => apiRequest<{ pro: ProStatus }>('/me/activate-pro', { method: 'POST', body: { code } }).then((r) => r.pro),
  /** Arsip zip berisi data.json dan foto tulisan. Link berlaku 5 menit, file dihapus setelah 24 jam. */
  exportData: () => apiRequest<{ export: DataExport }>('/me/export', { method: 'POST', body: {} }).then((r) => r.export),
  /** Permanen. Server ikut menghapus cookie sesi. */
  deleteAccount: (password: string) => apiRequest<void>('/me', { method: 'DELETE', body: { password } }),
};

/** Aturan password sama persis dengan StrongPasswordSchema di backend. */
export const PASSWORD_RULES = [
  { id: 'length', label: 'Minimal 12 karakter', test: (v: string) => v.length >= 12 && v.length <= 128 },
  { id: 'lower', label: 'Ada huruf kecil', test: (v: string) => /[a-z]/.test(v) },
  { id: 'upper', label: 'Ada huruf besar', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'digit', label: 'Ada angka', test: (v: string) => /[0-9]/.test(v) },
] as const;

export function homePathFor(role: Role): string {
  return role === 'STUDENT' ? '/belajar' : '/guru';
}

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: 'Pelajar',
  EDUCATOR: 'Guru / Dosen',
  INSTITUTION_ADMIN: 'Admin Institusi',
};

/** Pro efektif, sama dengan effectiveTier di backend: tier PRO, atau masa aktif kode yang belum lewat (FR-11). */
export function isEffectivePro(user: Pick<AuthUser, 'tier' | 'proExpiresAt'>, now = Date.now()): boolean {
  if (user.tier === 'PRO') return true;
  return user.proExpiresAt !== null && new Date(user.proExpiresAt).getTime() > now;
}
