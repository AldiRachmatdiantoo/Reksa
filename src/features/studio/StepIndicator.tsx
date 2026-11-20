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
              <span
                aria-current={active ? 'step' : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
                  active ? 'bg-teal text-on-teal' : done ? 'bg-teal-wash text-teal' : 'bg-wash text-ink-muted'
                }`}
              >
                {done ? <Icon name="check" className="text-[16px]" /> : <span className="tabular-nums">{step}.</span>}
                {/* Di layar sempit hanya langkah aktif yang berlabel, supaya tiga langkah muat tanpa digulir. */}
                <span className={active ? '' : 'sr-only sm:not-sr-only'}>{label}</span>
                {done && <span className="sr-only">(selesai)</span>}
              </span>
              {step < STEPS.length && <span aria-hidden="true" className="h-px w-4 bg-line sm:w-8" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
