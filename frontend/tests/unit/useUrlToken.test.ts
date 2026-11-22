import { act, createElement, Suspense, use } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EMAIL_TOKEN_RE, peekUrlToken, stripUrlToken, useUrlToken } from '@/shared/hooks/useUrlToken';

const EMAIL_TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF12';
const QR_TOKEN = 'TLmzgqs8PHUONDe9082MKEisutOTMetc3GOnSEN578c';
const QR_RE = /^[A-Za-z0-9_-]{43}$/;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => window.history.replaceState(null, '', '/'));

describe('peekUrlToken', () => {
  it('reads a valid token without touching the URL', () => {
    window.history.replaceState(null, '', `/verifikasi-email?token=${EMAIL_TOKEN}&x=1#top`);
    expect(peekUrlToken('query', EMAIL_TOKEN_RE)).toBe(EMAIL_TOKEN);
    expect(peekUrlToken('query', EMAIL_TOKEN_RE)).toBe(EMAIL_TOKEN);
    expect(window.location.search).toContain(EMAIL_TOKEN);

    window.history.replaceState(null, '', `/unggah#${QR_TOKEN}`);
    expect(peekUrlToken('hash', QR_RE)).toBe(QR_TOKEN);
  });

  it('answers null for a missing or malformed token', () => {
    window.history.replaceState(null, '', '/verifikasi-email');
    expect(peekUrlToken('query', EMAIL_TOKEN_RE)).toBeNull();
    window.history.replaceState(null, '', '/atur-ulang-password?token=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    expect(peekUrlToken('query', EMAIL_TOKEN_RE)).toBeNull();
    window.history.replaceState(null, '', '/atur-ulang-password?token=short');
    expect(peekUrlToken('query', EMAIL_TOKEN_RE)).toBeNull();
    window.history.replaceState(null, '', '/unggah#pendek');
    expect(peekUrlToken('hash', QR_RE)).toBeNull();
  });
});

describe('stripUrlToken', () => {
  it('removes only the token query and keeps the rest of the URL and the router state', () => {
    window.history.replaceState({ idx: 3 }, '', `/verifikasi-email?token=${EMAIL_TOKEN}&x=1#top`);
    stripUrlToken('query');
    expect(window.location.pathname).toBe('/verifikasi-email');
    expect(window.location.search).toBe('?x=1');
    expect(window.location.hash).toBe('#top');
    expect(window.history.state).toEqual({ idx: 3 });
  });

  it('removes the fragment, malformed or not', () => {
    window.history.replaceState(null, '', `/unggah?a=1#${QR_TOKEN}`);
    stripUrlToken('hash');
    expect(window.location.href).not.toContain(QR_TOKEN);
    expect(window.location.search).toBe('?a=1');
    window.history.replaceState(null, '', '/atur-ulang-password?token=short');
    stripUrlToken('query');
    expect(window.location.search).toBe('');
  });
});

describe('useUrlToken', () => {
  // Bug yang muncul setelah halaman dimuat lazy: render pertama dibuang React karena ada yang masih
  // menunggu (Suspense), render ulang tidak lagi menemukan token, dan HP menampilkan "Kode QR tidak terbaca".
  it('keeps the token when React throws away the first render, and strips it once the page is shown', async () => {
    window.history.replaceState(null, '', `/unggah#${QR_TOKEN}`);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const seen: (string | null)[] = [];
    function Reader() {
      seen.push(useUrlToken('hash', QR_RE));
      return null;
    }
    function Gate() {
      use(gate);
      return null;
    }

    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(createElement(Suspense, { fallback: null }, createElement(Reader), createElement(Gate))));
    expect(window.location.hash).toBe(`#${QR_TOKEN}`); // belum tampil, jadi belum dihapus

    await act(async () => {
      release();
      await gate;
    });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(QR_TOKEN);
    expect(window.location.hash).toBe('');
    act(() => root.unmount());
  });
});
