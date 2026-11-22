import { motion, useInView, type HTMLMotionProps, type Variants } from 'motion/react';
import { useRef, type ReactNode } from 'react';

/**
 * Primitif animasi REKSA, dibangun di atas `motion`.
 * Satu kurva untuk semua gerak masuk supaya terasa satu bahasa: cepat di awal, mendarat pelan.
 * Semua otomatis mati kalau OS meminta prefers-reduced-motion (MotionConfig di App).
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const VIEWPORT = { once: true, margin: '0px 0px -12% 0px' } as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease: EASE_OUT } },
};

type RevealProps = HTMLMotionProps<'div'> & { delay?: number };

/** Muncul sekali saat masuk layar: naik sedikit, blur hilang. */
export function Reveal({ delay = 0, children, ...rest }: RevealProps) {
  return (
    <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={VIEWPORT} transition={{ delay }} {...rest}>
      {children}
    </motion.div>
  );
}

const staggerParent = (gap: number, delay: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

type StaggerProps<T extends 'ul' | 'ol' | 'div' | 'dl'> = HTMLMotionProps<T> & {
  as?: T;
  gap?: number;
  delay?: number;
  /** `mount`: jalan saat halaman dibuka (konten di atas lipatan). `view`: saat discroll ke layar. */
  trigger?: 'mount' | 'view';
};

/** Wadah yang memunculkan anak-anaknya (`StaggerItem`) satu per satu. */
export function Stagger<T extends 'ul' | 'ol' | 'div' | 'dl' = 'div'>({
  as,
  gap = 0.08,
  delay = 0,
  trigger = 'view',
  children,
  ...rest
}: StaggerProps<T>) {
  const Tag = motion[(as ?? 'div') as 'div'];
  const play = trigger === 'mount' ? { animate: 'show' } : { whileInView: 'show', viewport: VIEWPORT };
  return (
    <Tag variants={staggerParent(gap, delay)} initial="hidden" {...play} {...(rest as HTMLMotionProps<'div'>)}>
      {children as ReactNode}
    </Tag>
  );
}

type StaggerItemProps<T extends 'li' | 'div'> = HTMLMotionProps<T> & { as?: T };

export function StaggerItem<T extends 'li' | 'div' = 'div'>({ as, children, ...rest }: StaggerItemProps<T>) {
  const Tag = motion[(as ?? 'div') as 'div'];
  return (
    <Tag variants={fadeUp} {...(rest as HTMLMotionProps<'div'>)}>
      {children as ReactNode}
    </Tag>
  );
}

/**
 * Judul yang muncul kata demi kata. Pembaca layar mendapat kalimat utuh,
 * potongan kata disembunyikan dari aksesibilitas.
 */
export function WordReveal({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const words = text.split(' ');
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <motion.span aria-hidden="true" initial="hidden" animate="show" variants={staggerParent(0.06, delay)}>
        {words.map((word, i) => (
          <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span
              className="inline-block"
              variants={{
                hidden: { y: '110%', opacity: 0 },
                show: { y: '0%', opacity: 1, transition: { duration: 0.7, ease: EASE_OUT } },
              }}
            >
              {word}
            </motion.span>
            {i < words.length - 1 && ' '}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** Batang yang terisi dari 0 sampai `value` persen saat masuk layar. */
export function FillBar({ value, className, delay = 0 }: { value: number; className: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Batang tipis: mulai terisi begitu satu piksel pun terlihat, tanpa margin pemicu.
  const inView = useInView(ref, { once: true });
  return (
    <span ref={ref} aria-hidden="true" className="block h-full w-full origin-left">
      <motion.span
        className={`block h-full rounded-full ${className}`}
        initial={{ width: '0%' }}
        animate={{ width: inView ? `${value}%` : '0%' }}
        transition={{ duration: 0.9, delay, ease: EASE_OUT }}
      />
    </span>
  );
}

/** Transisi antarhalaman: dipakai sebagai pembungkus `<main>` setiap halaman. */
export const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: 'easeIn' } },
} as const;
