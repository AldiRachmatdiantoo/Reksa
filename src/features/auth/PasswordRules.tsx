import { Icon } from '@/shared/ui/Icon';
import { PASSWORD_RULES } from './authApi';

/** Daftar syarat kata sandi yang tercentang saat terpenuhi. Aturannya sama dengan backend. */
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1" aria-label="Syarat kata sandi">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li key={rule.id} className={`flex items-center gap-1.5 ${ok ? 'text-teal' : ''}`}>
            <Icon name={ok ? 'check_circle' : 'radio_button_unchecked'} fill={ok} className="text-[18px]" />
            {rule.label}
            <span className="sr-only">{ok ? '(terpenuhi)' : '(belum)'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function isStrongPassword(value: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(value));
}
