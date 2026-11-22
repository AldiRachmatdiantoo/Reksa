import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * Persetujuan penyimpanan di perangkat.
 * - Cookie login (HttpOnly, dari backend, plus penanda sesi `__Host-reksa_session` tanpa rahasia) dan sesi belajar
 *   (sessionStorage) selalu aktif: tanpa itu aplikasi tidak jalan.
 * - `preferences`: boleh tidaknya REKSA mengingat pilihan tema di localStorage. Default mati.
 * Catatan persetujuan ini sendiri disimpan di localStorage supaya pop up tidak muncul terus.
 */
export type Consent = { preferences: boolean; decidedAt: string };

const STORAGE_KEY = 'reksa-consent';

function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof (parsed as Consent).preferences === 'boolean') {
      return parsed as Consent;
    }
    return null;
  } catch {
    return null;
  }
}

type ConsentContextValue = {
  consent: Consent | null;
  /** Pop up terbuka: belum pernah memilih, atau dibuka lagi dari tautan pengaturan. */
  noticeOpen: boolean;
  save: (preferences: boolean) => void;
  reopen: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<Consent | null>(readConsent);
  const [reopened, setReopened] = useState(false);

  const save = useCallback((preferences: boolean) => {
    const next: Consent = { preferences, decidedAt: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Penyimpanan diblokir: pilihan berlaku untuk tab ini saja.
    }
    setConsent(next);
    setReopened(false);
  }, []);

  const reopen = useCallback(() => setReopened(true), []);

  return (
    <ConsentContext.Provider value={{ consent, noticeOpen: consent == null || reopened, save, reopen }}>
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent harus di dalam ConsentProvider');
  return ctx;
}
