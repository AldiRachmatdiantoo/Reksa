import { Link } from 'react-router-dom';
import { Icon } from './Icon';

/** Logo sementara: tanda dari desain Figma + nama produk sebagai teks. */
export function Brand({ to = '/', subtitle = 'Teman Belajar Aktif' }: { to?: string; subtitle?: string }) {
  return (
    <Link to={to} className="flex min-h-11 items-center gap-2.5 rounded-md">
      <span className="flex size-10 items-center justify-center rounded-md bg-teal text-on-teal">
        <Icon name="edit_document" />
      </span>
      <span className="flex flex-col">
        <span className="font-headline text-title-lg leading-none text-teal">REKSA</span>
        <span className="text-label-sm text-ink-muted">{subtitle}</span>
      </span>
    </Link>
  );
}
