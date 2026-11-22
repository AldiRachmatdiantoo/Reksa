import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/core/apiClient';
import { formatVersion, isPossiblyMinor, PRIVACY_VERSION } from '@/features/legal/policyVersions';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { useAuth } from './AuthProvider';
import { AuthCardLayout } from './AuthCardLayout';
import { authApi, type AuthUser } from './authApi';
import { GUARDIAN_MESSAGE, validateConsent, type ConsentErrors } from './consent';
import { ConsentFields } from './ConsentFields';

/**
 * Muncul sebelum halaman login mana pun jika server menandai consentRequired:
 * akun lama tanpa tahun lahir, atau versi Syarat/Kebijakan Privasi sudah naik (FR-13).
 */
export function ConsentGate({ user }: { user: AuthUser }) {
  const auth = useAuth();
  const needsBirthYear = user.birthYear === null;
  const [birthYear, setBirthYear] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [errors, setErrors] = useState<ConsentErrors & { form?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Persetujuan · REKSA';
  }, []);

  // Akun lama yang tahun lahirnya sudah tersimpan tetap perlu centang wali kalau masih di bawah 18.
  const storedMinor = !needsBirthYear && user.birthYear !== null && isPossiblyMinor(user.birthYear);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateConsent({ birthYear, acceptTerms, guardianConsent, needsBirthYear });
    if (storedMinor && !guardianConsent) found.guardianConsent = GUARDIAN_MESSAGE;
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const updated = await authApi.recordConsent({
        acceptTerms: true,
        guardianConsent,
        ...(needsBirthYear ? { birthYear: Number(birthYear) } : {}),
      });
      auth.updateUser(updated);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'GUARDIAN_CONSENT_REQUIRED') setErrors({ guardianConsent: GUARDIAN_MESSAGE });
      else if (err instanceof ApiError && err.issues.some((i) => i.path === 'birthYear'))
        setErrors({ birthYear: err.issues.find((i) => i.path === 'birthYear')?.message });
      else setErrors({ form: err instanceof ApiError && err.status !== 500 ? err.message : 'Persetujuan gagal disimpan. Coba lagi.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthCardLayout
      title="Ada pembaruan dokumen"
      intro={`Syarat Layanan dan Kebijakan Privasi REKSA diperbarui pada ${formatVersion(PRIVACY_VERSION)}. Setujui dulu untuk lanjut belajar.`}
    >
      <form noValidate onSubmit={onSubmit} aria-busy={saving} className="flex flex-col gap-5">
        <ConsentFields
          showBirthYear={needsBirthYear}
          birthYear={birthYear}
          onBirthYear={setBirthYear}
          acceptTerms={acceptTerms}
          onAcceptTerms={setAcceptTerms}
          guardianConsent={guardianConsent}
          onGuardianConsent={setGuardianConsent}
          showGuardianAlways={storedMinor}
          errors={errors}
        />
        {errors.form && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
            <Icon name="error" className="mt-px text-[20px]" />
            {errors.form}
          </p>
        )}
        <Button type="submit" variant="accent" size="lg" disabled={saving} className="w-full">
          {saving ? 'Menyimpan...' : 'Setuju dan lanjut'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void auth.logout()} className="w-full">
          Keluar dulu
        </Button>
      </form>
    </AuthCardLayout>
  );
}
