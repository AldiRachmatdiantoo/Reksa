import { useTheme } from '../theme';
import { Icon } from './Icon';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const toDark = theme === 'light';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={toDark ? 'Ganti ke tema gelap' : 'Ganti ke tema terang'}
      title={toDark ? 'Tema gelap' : 'Tema terang'}
      className="inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-wash hover:text-ink active:bg-wash-strong"
    >
      <Icon name={toDark ? 'dark_mode' : 'light_mode'} />
    </button>
  );
}
