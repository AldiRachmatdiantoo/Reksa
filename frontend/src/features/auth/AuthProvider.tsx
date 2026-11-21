import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, onSessionExpired } from '@/core/apiClient';
import { authApi, type AuthUser, type LoginInput, type RegisterInput } from './authApi';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'anonymous'; user: null }
  /** Server tidak bisa dihubungi saat memeriksa sesi. */
  | { status: 'unreachable'; user: null };

type AuthContextValue = AuthState & {
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  recheck: () => void;
  /** Mengganti data user yang sedang login (setelah ubah nama, verifikasi email, ganti kata sandi). */
  updateUser: (user: AuthUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
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

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setState({ status: 'anonymous', user: null });
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
