import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MIN_USER_AGE, needsAdultConfirmation } from '@/features/legal/policyVersions';
import { TextField } from '@/shared/ui/TextField';
import type { ConsentErrors } from './consent';

type Props = {
  /** false di layar persetujuan ulang untuk akun yang sudah punya tahun lahir. */
  showBirthYear?: boolean;
  /** Tahun lahir sudah tersimpan dan tepat 18 tahun lalu: tampilkan centang "sudah 18" tanpa input tahun. */
  showAdultAlways?: boolean;
  birthYear: string;
  onBirthYear: (value: string) => void;
  acceptTerms: boolean;
  onAcceptTerms: (value: boolean) => void;
  adultConfirmed: boolean;
  onAdultConfirmed: (value: boolean) => void;
  errors: ConsentErrors;
};

/** Tahun lahir, centang "sudah 18" (untuk yang lahir tepat 18 tahun lalu), dan persetujuan dokumen (FR-13). */
export function ConsentFields({
  showBirthYear = true,
  showAdultAlways = false,
  birthYear,
  onBirthYear,
  acceptTerms,
  onAcceptTerms,
  adultConfirmed,
  onAdultConfirmed,
  errors,
}: Props) {
  const year = Number(birthYear);
  const showAdult = showAdultAlways || (showBirthYear && /^\d{4}$/.test(birthYear.trim()) && needsAdultConfirmation(year));

  return (
    <div className="flex flex-col gap-4">
      {showBirthYear && (
        <TextField
          id="birthYear"
          label="Tahun lahir"
          inputMode="numeric"
          autoComplete="bday-year"
          placeholder="mis. 2004"
          maxLength={4}
          value={birthYear}
          onChange={(e) => onBirthYear(e.target.value.replace(/\D/g, ''))}
          error={errors.birthYear}
          hint={`Dipakai untuk memeriksa batas usia ${MIN_USER_AGE} tahun.`}
          className="sm:max-w-56"
        />
      )}
      {showAdult && (
        <Checkbox id="adultConfirmed" checked={adultConfirmed} onChange={onAdultConfirmed} error={errors.adultConfirmed}>
          Aku sudah berumur {MIN_USER_AGE} tahun.
        </Checkbox>
      )}
      <Checkbox id="acceptTerms" checked={acceptTerms} onChange={onAcceptTerms} error={errors.acceptTerms}>
        Aku sudah membaca dan setuju dengan{' '}
        <Link to="/syarat" target="_blank" className="text-teal underline underline-offset-2">
          Syarat Layanan
        </Link>{' '}
        dan{' '}
        <Link to="/privasi" target="_blank" className="text-teal underline underline-offset-2">
          Kebijakan Privasi
        </Link>
        .
      </Checkbox>
    </div>
  );
}

function Checkbox({
  id,
  checked,
  onChange,
  error,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-6 shrink-0 accent-teal"
        />
        <label htmlFor={id} className="text-body-md text-ink">
          {children}
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} className="pl-9 text-body-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
