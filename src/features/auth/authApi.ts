import { apiRequest } from '@/core/apiClient';

// Kontrak dari backend/src/features/auth/auth.schema.ts (repo Reksa).
export type Role = 'STUDENT' | 'EDUCATOR' | 'INSTITUTION_ADMIN';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  tier: 'FREE' | 'PRO';
};

export type RegisterInput = {
  email: string;
  password: string;
  fullName: string;
  role: 'STUDENT' | 'EDUCATOR';
};

export type LoginInput = { email: string; password: string };

type UserResponse = { user: AuthUser };

export const authApi = {
  register: (input: RegisterInput) =>
    apiRequest<UserResponse>('/auth/register', { method: 'POST', body: input }).then((r) => r.user),
  login: (input: LoginInput) =>
    apiRequest<UserResponse>('/auth/login', { method: 'POST', body: input }).then((r) => r.user),
  me: (signal?: AbortSignal) => apiRequest<UserResponse>('/auth/me', { signal }).then((r) => r.user),
  /** Logout ada di DELETE /auth/refresh karena cookie refresh hanya dikirim ke path itu. */
  logout: () => apiRequest<void>('/auth/refresh', { method: 'DELETE' }),
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
