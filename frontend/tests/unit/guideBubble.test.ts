import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findVisible } from '@/features/onboarding/Spotlight';
import { TYPE_MS, useTypewriter } from '@/features/onboarding/useTypewriter';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let latest: ReturnType<typeof useTypewriter>;

function Probe({ text, enabled }: { text: string; enabled: boolean }) {
  latest = useTypewriter(text, enabled);
  return null;
}

const render = (text: string, enabled = true) =>
  act(() => {
    root.render(createElement(Probe, { text, enabled }));
  });

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('useTypewriter', () => {
  it('mengetik huruf demi huruf sampai selesai', () => {
    render('Halo');
    expect(latest).toMatchObject({ shown: 0, done: false });
    act(() => vi.advanceTimersByTime(TYPE_MS * 2));
    expect(latest.shown).toBe(2);
    act(() => vi.advanceTimersByTime(TYPE_MS * 10));
    expect(latest).toMatchObject({ shown: 4, done: true });
  });

  it('complete() langsung menampilkan kalimat utuh (tekan pertama di game)', () => {
    render('Kalimat panjang');
    act(() => latest.complete());
    expect(latest.done).toBe(true);
  });

  it('teks baru mulai mengetik dari awal', () => {
    render('Satu');
    act(() => vi.advanceTimersByTime(TYPE_MS * 10));
    render('Dua langkah');
    expect(latest).toMatchObject({ shown: 0, done: false });
  });

  it('kurangi gerakan: kalimat langsung utuh', () => {
    render('Tanpa animasi', false);
    expect(latest.done).toBe(true);
  });
});

describe('findVisible', () => {
  it('melewati elemen yang tersembunyi dan memilih yang tampil', () => {
    host.innerHTML = '<nav><a class="t" id="hidden"></a><a class="t" id="shown"></a></nav>';
    const [hidden, shown] = host.querySelectorAll<HTMLElement>('.t');
    hidden!.getClientRects = () => [] as unknown as DOMRectList;
    shown!.getClientRects = () => [{}] as unknown as DOMRectList;
    expect(findVisible('.t')?.id).toBe('shown');
    expect(findVisible('.tidak-ada')).toBeNull();
  });
});
