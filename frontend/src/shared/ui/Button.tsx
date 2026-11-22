import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'accent' | 'primary' | 'outline' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

// Aturan aksen: `accent` (oranye) hanya untuk SATU aksi utama per layar.
// Selebihnya `primary` (teal), `outline`, atau `ghost`.
const VARIANTS: Record<Variant, string> = {
  accent: 'bg-ember text-on-ember hover:brightness-95 active:brightness-90',
  primary: 'bg-teal text-on-teal hover:brightness-110 active:brightness-95',
  outline: 'border border-line bg-card text-teal hover:bg-wash active:bg-wash-strong',
  ghost: 'text-ink-muted hover:bg-wash hover:text-ink active:bg-wash-strong',
  // Aksi yang menghapus data permanen.
  danger: 'border border-danger bg-card text-danger hover:bg-danger-wash hover:text-on-danger-wash',
};

const SIZES: Record<Size, string> = {
  md: 'min-h-11 px-5 text-label-lg',
  lg: 'min-h-13 px-7 text-title-md',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-label font-semibold whitespace-nowrap transition-[filter,background-color,color,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100';

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

type ButtonLinkProps = LinkProps & { variant?: Variant; size?: Size };

export function ButtonLink({ variant = 'primary', size = 'md', className = '', ...rest }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
