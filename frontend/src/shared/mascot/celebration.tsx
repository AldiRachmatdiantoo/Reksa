import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/shared/ui/Icon';
import { Mascot } from './Mascot';
import type { Celebration } from './praise';

type CelebrationContextValue = { celebrate: (c: Celebration) => void };

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

/** Lama pop up tampil. Berhenti menghitung selama kursor atau fokus keyboard ada di dalamnya. */
export const CELEBRATION_MS = 6000;

/**
 * Pop up pujian maskot setelah pengguna menyelesaikan sesuatu. Tidak modal dan tidak mencuri fokus:
 * pengguna tetap bisa lanjut kerja, pembaca layar mendengarnya lewat role="status".
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(Celebration & { id: number }) | null>(null);
  const nextId = useRef(0);

  const celebrate = useCallback((c: Celebration) => {
    nextId.current += 1;
    setCurrent({ ...c, id: nextId.current });
  }, []);
  const close = useCallback(() => setCurrent(null), []);

  return (
    <CelebrationContext.Provider value={{ celebrate }}>
      {children}
      {/* Wadah status selalu terpasang supaya pembaca layar sudah memantaunya sebelum pesan masuk. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-40 flex justify-end sm:right-6 sm:bottom-6 sm:left-auto"
      >
        <AnimatePresence>{current && <CelebrationCard key={current.id} celebration={current} onClose={close} />}</AnimatePresence>
      </div>
    </CelebrationContext.Provider>
  );
}

function CelebrationCard({ celebration, onClose }: { celebration: Celebration; onClose: () => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(onClose, CELEBRATION_MS);
    return () => window.clearTimeout(t);
  }, [paused, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
      exit={{ opacity: 0, y: 24, scale: 0.96, transition: { duration: 0.18, ease: 'easeIn' } }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full items-center gap-3 rounded-xl border border-line bg-card py-3 pr-2 pl-3 shadow-lg sm:max-w-sm"
    >
      <motion.div
        initial={{ rotate: -12, scale: 0.6 }}
        animate={{ rotate: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 11, delay: 0.08 } }}
        className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-teal-wash"
      >
        <Mascot name={celebration.mascot} mood={celebration.mood} className="h-14 w-auto" />
      </motion.div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-title text-title-md text-ink text-balance">{celebration.title}</p>
        <p className="text-body-sm text-ink-muted text-pretty">{celebration.text}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup pesan"
        className="flex size-11 shrink-0 items-center justify-center self-start rounded-full text-ink-muted hover:bg-wash hover:text-ink"
      >
        <Icon name="close" className="text-[20px]" />
      </button>
    </motion.div>
  );
}

/** Di luar provider (mis. unit test halaman) pujian diabaikan, bukan error. */
export function useCelebrate() {
  return useContext(CelebrationContext)?.celebrate ?? noop;
}

function noop() {}
