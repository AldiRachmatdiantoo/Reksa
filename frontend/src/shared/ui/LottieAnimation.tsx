import { useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { fetchLottieData } from '@/shared/lottie';

type LottieAnimationProps = {
  /** Path di public/, mis. `/lottie/pemindai-catatan.json`. */
  src: string;
  loop?: boolean;
  /** Kecepatan putar (1 = normal). */
  speed?: number;
  /**
   * Dipanggil sekali saat animasi tanpa loop selesai. Juga dipanggil langsung bila animasi gagal dimuat atau
   * pengguna memilih kurangi gerakan, supaya alur halaman tidak pernah tertahan menunggu animasi.
   */
  onComplete?: () => void;
  className?: string;
};

/**
 * Pemutar Lottie dekoratif (aria-hidden): teks status tetap ada di halaman, animasi hanya pelengkap.
 * Kurangi gerakan: animasi loop berhenti di frame pertama, animasi sekali putar langsung di frame terakhir.
 */
export function LottieAnimation({ src, loop = false, speed = 1, onComplete, className = '' }: LottieAnimationProps) {
  const box = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const done = useRef(onComplete);
  done.current = onComplete;
  const animRef = useRef<{ setSpeed: (s: number) => void } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const controller = new AbortController();
    let anim: import('lottie-web').AnimationItem | null = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done.current?.();
    };

    (async () => {
      try {
        const [data, lottie] = await Promise.all([
          fetchLottieData(src, controller.signal),
          import('lottie-web/build/player/lottie_light').then((m) => m.default),
        ]);
        if (controller.signal.aborted) return;
        anim = lottie.loadAnimation({
          container: el,
          renderer: 'svg',
          loop: reduceMotion ? false : loop,
          autoplay: !reduceMotion,
          animationData: data,
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true },
        });
        animRef.current = anim;
        anim.setSpeed(speed);
        if (reduceMotion) {
          anim.goToAndStop(loop ? 0 : anim.totalFrames - 1, true);
          finish();
        } else if (!loop) {
          anim.addEventListener('complete', finish);
        }
      } catch {
        if (!controller.signal.aborted) finish();
      }
    })();

    return () => {
      controller.abort();
      animRef.current = null;
      anim?.destroy();
    };
    // speed sengaja tidak masuk dependensi: perubahan kecepatan ditangani efek di bawah tanpa memuat ulang.
  }, [src, loop, reduceMotion]);

  useEffect(() => {
    animRef.current?.setSpeed(speed);
  }, [speed]);

  return <div ref={box} aria-hidden="true" className={className} />;
}
