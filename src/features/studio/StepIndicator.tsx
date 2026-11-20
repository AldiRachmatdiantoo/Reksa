import { motion } from 'motion/react';
import { EASE_OUT } from '@/shared/motion';
import { Icon } from '@/shared/ui/Icon';

const STEPS = ['Fokus & tulis', 'Tebak & foto', 'Cek hasil'] as const;

/** Tiga langkah ini memang alur sesi REKSA (PRD FR-02 s.d. FR-05), bukan hiasan. */
export function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Langkah sesi belajar">
      <ol className="flex flex-wrap items-center gap-2 text-label-md sm:gap-3">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          return (
            <li key={label} className="flex shrink-0 items-center gap-2 sm:gap-3">
              <motion.span
                initial={active ? { scale: 0.85, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.15 }}
                aria-current={active ? 'step' : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
                  active ? 'bg-teal text-on-teal' : done ? 'bg-teal-wash text-teal' : 'bg-wash text-ink-muted'
                }`}
              >
                {done ? (
                  <motion.span
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.1 + i * 0.08 }}
                    className="flex"
                  >
                    <Icon name="check" className="text-[16px]" />
                  </motion.span>
                ) : (
                  <span className="tabular-nums">{step}.</span>
                )}
                {/* Di layar sempit hanya langkah aktif yang berlabel, supaya tiga langkah muat tanpa digulir. */}
                <span className={active ? '' : 'sr-only sm:not-sr-only'}>{label}</span>
                {done && <span className="sr-only">(selesai)</span>}
              </motion.span>
              {step < STEPS.length && (
                // Garis penghubung terisi teal untuk langkah yang sudah dilewati.
                <span aria-hidden="true" className="relative h-0.5 w-4 overflow-hidden rounded-full bg-line sm:w-8">
                  {done && (
                    <motion.span
                      className="absolute inset-0 origin-left bg-teal"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.5, delay: 0.2 + i * 0.1, ease: EASE_OUT }}
                    />
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
