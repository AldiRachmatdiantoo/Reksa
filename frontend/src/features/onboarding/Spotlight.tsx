import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Icon } from '@/shared/ui/Icon';

type Rect = { top: number; left: number; width: number; height: number };

/** Elemen pertama yang cocok dan benar-benar tampil (menu pelajar ada dua: desktop dan HP). */
export function findVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

/**
 * Sorotan seperti tutorial game: bingkai berdenyut di sekeliling bagian yang sedang dijelaskan, plus panah
 * penunjuk. Tidak menghalangi klik (pointer-events-none) dan tidak menggelapkan halaman.
 */
export function Spotlight({ selector }: { selector?: string }) {
  const [rect, setRect] = useState<Rect | null>(null);
  // MotionConfig hanya menghentikan transform; denyut box-shadow dihentikan manual.
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    setRect(null);
    if (!selector) return;
    const el = findVisible(selector);
    if (!el) return;
    // Bagian di luar layar digeser ke tengah; menu di header lengket sudah terlihat.
    const r0 = el.getBoundingClientRect();
    if (r0.top < 0 || r0.bottom > window.innerHeight * 0.6)
      el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

    let frame = 0;
    const track = () => {
      const r = el.getBoundingClientRect();
      setRect((prev) =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [selector]);

  const pad = 6;
  const below = rect ? rect.top + rect.height / 2 < window.innerHeight / 2 : true;

  return (
    <AnimatePresence>
      {rect && (
        <motion.div
          key={selector}
          aria-hidden="true"
          className="pointer-events-none fixed z-40"
          initial={{ opacity: 0, scale: 1.15 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        >
          <motion.span
            className="absolute inset-0 rounded-xl border-3 border-ember"
            animate={reduceMotion ? undefined : { boxShadow: ['0 0 0 0 rgb(254 122 41 / 0.45)', '0 0 0 10px rgb(254 122 41 / 0)'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
          {/* Posisi di span luar, animasi di span dalam: transform motion menimpa translate Tailwind. */}
          <span className={`absolute left-1/2 flex -translate-x-1/2 text-ember ${below ? 'top-full mt-1' : 'bottom-full mb-1'}`}>
            <motion.span
              className="flex"
              animate={{ y: below ? [0, 6, 0] : [0, -6, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Icon name={below ? 'arrow_upward' : 'arrow_downward'} className="text-[28px] text-ember" />
            </motion.span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
