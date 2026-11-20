import type { InputHTMLAttributes, ReactNode } from 'react';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Kontrol tambahan di sisi kanan input (mis. tombol lihat sandi). */
  trailing?: ReactNode;
};

export function TextField({ id, label, error, hint, trailing, className = '', ...rest }: TextFieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-label-lg text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`min-h-12 w-full rounded-[12px] border bg-card px-4 text-body-lg text-ink transition-colors placeholder:text-ink-muted/70 focus-visible:outline-offset-1 ${
            trailing ? 'pr-12' : ''
          } ${error ? 'border-danger' : 'border-line hover:border-ink-muted'}`}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {hint && (
        <div id={`${id}-hint`} className="text-body-sm text-ink-muted">
          {hint}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="text-body-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
