import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isPossiblyMinor } from '@/features/legal/policyVersions';
import { TextField } from '@/shared/ui/TextField';
import type { ConsentErrors } from './consent';

type Props = {
  /** false di layar persetujuan ulang untuk akun yang sudah punya tahun lahir. */
  showBirthYear?: boolean;
  /** Tahun lahir sudah tersimpan dan masih di bawah 18: tampilkan centang wali tanpa input tahun. */
  showGuardianAlways?: boolean;
  birthYear: string;
  onBirthYear: (value: string) => void;
  acceptTerms: boolean;
  onAcceptTerms: (value: boolean) => void;
  guardianConsent: boolean;
  onGuardianConsent: (value: boolean) => void;
  errors: ConsentErrors;
};

/** Tahun lahir, centang izin wali (jika mungkin di bawah 18), dan persetujuan dokumen (FR-13). */
export function ConsentFields({
  showBirthYear = true,
  showGuardianAlways = false,
  birthYear,
  onBirthYear,
  acceptTerms,
  onAcceptTerms,
  guardianConsent,
  onGuardianConsent,
  errors,
}: Props) {
  const year = Number(birthYear);
  const showGuardian = showGuardianAlways || (showBirthYear && /^\d{4}$/.test(birthYear.trim()) && isPossiblyMinor(year));

  return (
    <div className="flex flex-col gap-4">
      {showBirthYear && (
        <TextField
          id="birthYear"
          label="Tahun lahir"
          inputMode="numeric"
          autoComplete="bday-year"
          placeholder="mis. 2009"
          maxLength={4}
          value={birthYear}
          onChange={(e) => onBirthYear(e.target.value.replace(/\D/g, ''))}
          error={errors.birthYear}
          hint="Dipakai untuk tahu apakah kamu perlu izin orang tua atau wali."
          className="sm:max-w-56"
        />
      )}
      {showGuardian && (
        <Checkbox id="guardianConsent" checked={guardianConsent} onChange={onGuardianConsent} error={errors.guardianConsent}>
          Umurku di bawah 18 tahun dan orang tua atau waliku sudah mengizinkan aku memakai REKSA.
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
