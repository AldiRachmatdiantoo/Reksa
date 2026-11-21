import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useConsent } from './consent';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'reksa-theme';

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

/**
 * Tema mengikuti sistem sampai user memilih sendiri.
 * Pilihan hanya diingat di perangkat kalau user mengizinkan "Ingat pilihan tema" di pop up cookie.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { consent } = useConsent();
  const remember = consent?.preferences === true;
  const [theme, setTheme] = useState<Theme>(() => readStored() ?? systemTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Izin berubah atau tema diganti: simpan tema sekarang, atau hapus yang pernah tersimpan.
  useEffect(() => {
    try {
      if (remember) localStorage.setItem(STORAGE_KEY, theme);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Penyimpanan diblokir (mode privat): tema tetap berlaku untuk sesi ini.
    }
  }, [remember, theme]);

  const toggle = useCallback(() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')), []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme harus di dalam ThemeProvider');
  return ctx;
}
