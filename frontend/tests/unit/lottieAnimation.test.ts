import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reduce = vi.hoisted(() => ({ value: false }));
const anim = vi.hoisted(() => ({
  setSpeed: vi.fn(),
  goToAndStop: vi.fn(),
  addEventListener: vi.fn(),
  destroy: vi.fn(),
  totalFrames: 60,
}));
const loadAnimation = vi.hoisted(() => vi.fn(() => anim));

vi.mock('motion/react', () => ({ useReducedMotion: () => reduce.value }));
vi.mock('lottie-web/build/player/lottie_light', () => ({ default: { loadAnimation } }));

import { LottieAnimation } from '@/shared/ui/LottieAnimation';

const valid = { v: '5.7.4', fr: 30, ip: 0, op: 60, w: 300, h: 300, layers: [] };
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

async function render(props: Parameters<typeof LottieAnimation>[0]) {
  await act(async () => {
    root.render(createElement(LottieAnimation, props));
  });
  // Tunggu fetch + import dinamis selesai.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  reduce.value = false;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => valid }));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('LottieAnimation', () => {
  it('memutar animasi sekali dan menunggu event complete', async () => {
    const onComplete = vi.fn();
    await render({ src: '/lottie/a.json', onComplete });
    expect(loadAnimation).toHaveBeenCalledWith(expect.objectContaining({ loop: false, autoplay: true, renderer: 'svg' }));
    expect(anim.addEventListener).toHaveBeenCalledWith('complete', expect.any(Function));
    expect(onComplete).not.toHaveBeenCalled();
    expect(host.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('kurangi gerakan: berhenti di frame terakhir dan langsung lanjut', async () => {
    reduce.value = true;
    const onComplete = vi.fn();
    await render({ src: '/lottie/a.json', onComplete });
    expect(loadAnimation).toHaveBeenCalledWith(expect.objectContaining({ autoplay: false, loop: false }));
    expect(anim.goToAndStop).toHaveBeenCalledWith(59, true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('animasi gagal dimuat tidak menahan alur halaman', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const onComplete = vi.fn();
    await render({ src: '/lottie/hilang.json', onComplete });
    expect(loadAnimation).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('membersihkan animasi saat dilepas', async () => {
    await render({ src: '/lottie/a.json', loop: true });
    act(() => root.unmount());
    root = createRoot(host);
    expect(anim.destroy).toHaveBeenCalled();
  });
});
