import { motion } from 'motion/react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { VerifyEmailNotice } from '@/features/auth/VerifyEmailNotice';
import { historyApi } from '@/features/history/historyApi';
import { useMaterialQuota } from '@/features/materials/materialsApi';
import { useGuide } from '@/features/onboarding/OnboardingGuide';
import { firstName } from '@/features/onboarding/guideSteps';
import { spacedApi } from '@/features/spaced-repetition/spacedApi';
import { useStudySession } from '@/features/studio/studySession';
import { useLoad } from '@/shared/hooks/useLoad';
import { Mascot } from '@/shared/mascot/Mascot';
import { pageTransition } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { buttonClass } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock } from '@/shared/ui/StateBlock';
import { attentionItems, nextStep } from './homeCards';

const CARD =
  'rounded-lg border border-line-soft transition-colors hover:border-line hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal';

/**
 * Beranda pelajar: menjawab "aku harus ngapain sekarang?". Satu langkah berikutnya yang dipilih dari keadaan
 * akun, lalu hal yang perlu diketahui (hanya kalau ada). Menu lain sudah ada di header, jadi tidak diulang.
 */
export function HomePage() {
  const auth = useAuth();
  const user = auth.status === 'authenticated' ? auth.user : null;
  const name = user ? firstName(user.fullName) : '';
  const { session, syncing } = useStudySession();
  const { openGuide } = useGuide();
  const due = useLoad((signal) => spacedApi.due(signal), []);
  const quota = useMaterialQuota();
  const history = useLoad((signal) => historyApi.list(null, signal), []);

  useEffect(() => {
    document.title = 'Beranda · REKSA';
  }, []);

  // Gagal dimuat dianggap tidak ada: Beranda tetap memberi arah, halaman tujuannya yang menampilkan error-nya.
  const settled = !syncing && due.state.status !== 'loading' && quota.state.status !== 'loading';
  const quotaData = quota.state.status === 'ready' ? quota.state.data : null;
  const step = nextStep(session, due.state.status === 'ready' ? due.state.data.due.length : null, quotaData?.stored ?? null);
  const latest = history.state.status === 'ready' ? (history.state.data.items[0] ?? null) : null;
  const attention = attentionItems(quotaData, latest);
  const showAttention = attention.length > 0 || (user !== null && !user.emailVerified);

  return (
    <>
      <AppHeader subtitle="Beranda" />
      <motion.main {...pageTransition} className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">{name ? `Halo, ${name}` : 'Halo'}</h1>
          <p className="max-w-prose text-body-lg text-ink-muted text-pretty">Ini yang paling pas kamu kerjakan sekarang.</p>
        </div>

        <section aria-labelledby="next-title">
          <h2 id="next-title" className="sr-only">
            Langkah berikutnya
          </h2>
          {settled ? (
            <Link to={step.to} className={`ruled-sheet flex items-center gap-4 p-5 pl-12 sm:gap-6 sm:p-7 sm:pl-14 ${CARD}`}>
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="font-title text-title-lg text-ink sm:text-headline-md">{step.title}</span>
                <span className="max-w-prose text-body-md text-ink-muted text-pretty">{step.text}</span>
                <span className={buttonClass('accent', 'md', 'mt-2 self-start')}>{step.action}</span>
              </span>
              <span className="hidden shrink-0 sm:block" aria-hidden="true">
                <Mascot name="rasi" mood="happy" className="h-28 w-auto" />
              </span>
            </Link>
          ) : (
            <div className={`ruled-sheet ${CARD}`}>
              <LoadingBlock label="Mencari langkah berikutnya..." />
            </div>
          )}
        </section>

        {showAttention && (
          <section aria-labelledby="attention-title" className="flex flex-col gap-3">
            <h2 id="attention-title" className="font-title text-title-lg text-ink">
              Perlu kamu tahu
            </h2>
            <VerifyEmailNotice reason="Verifikasi emailmu supaya bisa gabung kelas dari guru." />
            {attention.length > 0 && (
              <ul className="flex flex-col divide-y divide-line-soft rounded-lg border border-line-soft bg-card">
                {attention.map((item) => (
                  <li key={item.key} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                    <span className="flex min-w-0 flex-1 items-start gap-3">
                      <Icon name={item.icon} className="mt-0.5 text-[22px] text-teal" />
                      <span className="text-body-md text-ink text-pretty">{item.text}</span>
                    </span>
                    {item.link && (
                      <Link
                        to={item.link.to}
                        className="inline-flex min-h-11 shrink-0 items-center self-start pl-9 text-label-lg text-teal underline underline-offset-4 sm:self-auto sm:pl-0"
                      >
                        {item.link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <button type="button" onClick={openGuide} className={`flex w-full items-center gap-4 bg-card p-5 text-left ${CARD}`}>
          <span className="shrink-0" aria-hidden="true">
            <Mascot name="risa" className="h-14 w-auto" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-title-md text-ink">Panduan REKSA</span>
            <span className="text-body-sm text-ink-muted text-pretty">Lupa urutan belajarnya? Risa jelasin lagi langkah demi langkah.</span>
          </span>
          <Icon name="chevron_right" className="text-ink-muted" />
        </button>
      </motion.main>
    </>
  );
}
