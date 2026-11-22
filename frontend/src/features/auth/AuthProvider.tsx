import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, onSessionExpired } from '@/core/apiClient';
import { authApi, type AuthUser, type LoginInput, type RegisterInput } from './authApi';
import { outbox } from '@/shared/offline/outbox';
import { hasSessionHint } from './sessionHint';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'anonymous'; user: null }
  /** Server tidak bisa dihubungi saat memeriksa sesi. */
  | { status: 'unreachable'; user: null };

type AuthContextValue = AuthState & {
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  /**
   * Menunggu server menghapus cookie, baru mengosongkan status. `then` (misalnya pindah ke beranda) dijalankan
   * dalam transisi yang sama dengan perubahan status, supaya halaman terproteksi tidak sempat membelokkan ke /masuk.
   */
  logout: (then?: () => void) => Promise<void>;
  recheck: () => void;
  /** Mengganti data user yang sedang login (setelah ubah nama, verifikasi email, ganti kata sandi). */
  updateUser: (user: AuthUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hasSessionHint()) {
      setState({ status: 'anonymous', user: null });
      return;
    }
    const controller = new AbortController();
    authApi
      .me(controller.signal)
      .then((user) => setState({ status: 'authenticated', user }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const unreachable = err instanceof ApiError && (err.status === 0 || err.status >= 500);
        setState(unreachable ? { status: 'unreachable', user: null } : { status: 'anonymous', user: null });
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => onSessionExpired(() => setState({ status: 'anonymous', user: null })), []);

  // F2: begitu koneksi kembali, periksa sesi lagi tanpa menunggu tombol "Coba hubungkan lagi" ditekan.
  const unreachable = state.status === 'unreachable';
  useEffect(() => {
    if (!unreachable) return;
    const retry = () => setAttempt((n) => n + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [unreachable]);

  const login = useCallback(async (input: LoginInput) => {
    const user = await authApi.login(input);
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const user = await authApi.register(input);
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const logout = useCallback(async (then?: () => void) => {
    // F2: foto dan tebakan yang belum terkirim tidak ditinggal di perangkat (komputer bersama).
    void outbox.clear().catch(() => undefined);
    try {
      await authApi.logout();
    } finally {
      startTransition(() => {
        then?.();
        setState({ status: 'anonymous', user: null });
      });
    }
  }, []);

  const recheck = useCallback(() => {
    setState({ status: 'loading', user: null });
    setAttempt((n) => n + 1);
  }, []);

  const updateUser = useCallback((user: AuthUser) => {
    setState((s) => (s.status === 'authenticated' ? { status: 'authenticated', user } : s));
  }, []);

  const value = useMemo(
    () => ({ ...state, login, register, logout, recheck, updateUser }),
    [state, login, register, logout, recheck, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus di dalam AuthProvider');
  return ctx;
}
