import { motion } from 'motion/react';
import { useId, useRef, type KeyboardEvent } from 'react';

export type SegmentedOption<T extends string> = { value: T; label: string; panelId?: string };

type SegmentedTabsProps<T extends string> = {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

/**
 * Tab tersegmentasi dengan indikator yang meluncur ke tab aktif.
 * Gerakan diadaptasi dari Watermelon UI "Discrete Tabs" (spring 210/18):
 * indikator yang berpindah memberi tahu bahwa isi di bawahnya ikut berganti.
 * Navigasi panah kiri/kanan, Home/End mengikuti pola WAI-ARIA Tabs.
 */
export function SegmentedTabs<T extends string>({ label, options, value, onChange, className = '' }: SegmentedTabsProps<T>) {
  const layoutId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = options.length - 1;
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`inline-grid grid-flow-col auto-cols-fr gap-1 rounded-full border border-line-soft bg-wash p-1 ${className}`}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={opt.panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative min-h-11 rounded-full px-5 font-label text-label-lg font-semibold whitespace-nowrap transition-colors duration-200 ${
              active ? 'text-teal' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                aria-hidden="true"
                className="absolute inset-0 rounded-full border border-line-soft bg-card shadow-sm"
                transition={{ type: 'spring', stiffness: 210, damping: 18, mass: 1 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
