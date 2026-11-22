import type { ReactNode } from 'react';
import { Icon } from './Icon';

type Tone = 'neutral' | 'danger';

type StateBlockProps = {
  icon: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: Tone;
};

/** Empty / error state: selalu menyebut penyebab dan satu langkah berikutnya. */
export function StateBlock({ icon, title, children, action, tone = 'neutral' }: StateBlockProps) {
  return (
    <section
      role={tone === 'danger' ? 'alert' : undefined}
      className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-lg border border-line-soft bg-card px-6 py-10 text-center"
    >
      <span
        className={`flex size-14 items-center justify-center rounded-full ${
          tone === 'danger' ? 'bg-danger-wash text-on-danger-wash' : 'bg-teal-wash text-teal'
        }`}
      >
        <Icon name={icon} className="text-[28px]" />
      </span>
      <h2 className="font-headline text-headline-md text-ink text-balance">{title}</h2>
      <div className="text-body-md text-ink-muted text-pretty">{children}</div>
      {action}
    </section>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div role="status" className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-ink-muted">
      <span
        className="size-8 animate-spin rounded-full border-[3px] border-line-soft border-t-teal motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="text-body-md">{label}</span>
    </div>
  );
}
