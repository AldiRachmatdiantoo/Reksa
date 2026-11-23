import { useCallback, useEffect, useState } from 'react';

/** Jeda per huruf. Kalimat 200 huruf selesai sekitar 3 detik. */
export const TYPE_MS = 16;

/**
 * Efek ketik ala kotak dialog game. `enabled` false (kurangi gerakan) langsung menampilkan kalimat utuh.
 * Teks berganti = mulai mengetik dari awal lagi.
 */
export function useTypewriter(text: string, enabled: boolean) {
  const [state, setState] = useState({ text, shown: enabled ? 0 : text.length });
  // Teks baru: reset saat render, bukan di efek, supaya tidak sempat tampil utuh satu frame.
  if (state.text !== text) setState({ text, shown: enabled ? 0 : text.length });
  const shown = state.text === text ? state.shown : enabled ? 0 : text.length;
  const done = shown >= text.length;

  useEffect(() => {
    if (done || !enabled) return;
    const t = window.setInterval(() => {
      setState((s) => (s.text === text ? { text, shown: Math.min(s.shown + 1, text.length) } : s));
    }, TYPE_MS);
    return () => window.clearInterval(t);
  }, [text, done, enabled]);

  const complete = useCallback(() => setState({ text, shown: text.length }), [text]);

  return { shown, done, complete };
}
