import { motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMaterialQuota } from '@/features/materials/materialsApi';
import { useGuide } from '@/features/onboarding/OnboardingGuide';
import { firstName } from '@/features/onboarding/guideSteps';
import { spacedApi } from '@/features/spaced-repetition/spacedApi';
import { useStudySession } from '@/features/studio/studySession';
import { useLoad } from '@/shared/hooks/useLoad';
import { Mascot, type MascotName } from '@/shared/mascot/Mascot';
import { pageTransition } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { buttonClass } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { materialHint, reviewHint, studyCard } from './homeCards';

const CARD =
  'rounded-lg border border-line-soft transition-colors hover:border-line hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal';

/**
 * Beranda pelajar: pintu ke tiap bagian REKSA dalam bentuk kartu, dengan keterangan singkat apa isinya.
 * Empat kartu kecil untuk tempat yang dibuka sesekali, tiga kartu lebar untuk aksi utama dan bantuan.
 */
export function HomePage() {
  const auth = useAuth();
  const name = auth.status === 'authenticated' ? firstName(auth.user.fullName) : '';
  const { session } = useStudySession();
  const { openGuide } = useGuide();
  // Keterangan di kartu sifatnya tambahan: gagal dimuat tetap menampilkan kartu dengan keterangan umum.
  const due = useLoad((signal) => spacedApi.due(signal), []);
  const quota = useMaterialQuota();
  const study = studyCard(session);

  useEffect(() => {
    document.title = 'Beranda · REKSA';
  }, []);

  return (
    <>
      <AppHeader subtitle="Beranda" />
      <motion.main {...pageTransition} className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">{name ? `Halo, ${name}` : 'Halo'}</h1>
          <p className="max-w-prose text-body-lg text-ink-muted text-pretty">Mau ngapain hari ini? Pilih salah satu di bawah.</p>
        </div>

        <nav aria-label="Pintasan Beranda" className="flex flex-col gap-4">
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SmallCard
              to="/belajar/materi"
              icon="menu_book"
              title="Materi"
              hint={materialHint(quota.state.status === 'ready' ? quota.state.data : null)}
            />
            <SmallCard
              to="/belajar/ulang"
              icon="event_repeat"
              title="Ulang"
              hint={reviewHint(due.state.status === 'ready' ? due.state.data.due.length : null)}
              highlight={due.state.status === 'ready' && due.state.data.due.length > 0}
            />
            <SmallCard to="/belajar/riwayat" icon="history" title="Riwayat" hint="Hasil cek catatanmu yang dulu" />
            <SmallCard to="/belajar/kelas" icon="groups" title="Kelas" hint="Gabung kelas pakai kode dari guru" />
          </ul>

          <ul className="flex flex-col gap-3">
            <li>
              <Link to={study.to} className={`ruled-sheet flex items-center gap-4 p-5 pl-12 sm:gap-6 sm:p-6 sm:pl-14 ${CARD}`}>
                <WideBody title={study.title} text={study.text}>
                  <span className={buttonClass('accent', 'md', 'self-start')}>{study.action}</span>
                </WideBody>
                <WideMascot name="rasi" />
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={openGuide}
                className={`flex w-full items-center gap-4 bg-card p-5 text-left sm:gap-6 sm:p-6 ${CARD}`}
              >
                <WideBody
                  title="Panduan REKSA"
                  text="Lupa urutan belajarnya atau fitur apa saja yang ada? Risa jelasin lagi langkah demi langkah."
                >
                  <span className="text-label-lg text-teal">Buka panduan</span>
                </WideBody>
                <WideMascot name="risa" />
              </button>
            </li>
            <li>
              <Link to="/akun" className={`flex items-center gap-4 bg-card p-5 sm:gap-6 sm:p-6 ${CARD}`}>
                <WideBody title="Akun" text="Lihat paketmu, aktifkan kode Pro, unduh atau hapus datamu, dan ganti kata sandi.">
                  <span className="text-label-lg text-teal">Buka akun</span>
                </WideBody>
                <WideMascot name="risu" />
              </Link>
            </li>
          </ul>
        </nav>
      </motion.main>
    </>
  );
}

function SmallCard({
  to,
  icon,
  title,
  hint,
  highlight = false,
}: {
  to: string;
  icon: string;
  title: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <li>
      <Link to={to} className={`flex h-full min-h-32 flex-col gap-3 bg-card p-4 ${CARD}`}>
        <span className="flex size-11 items-center justify-center rounded-md bg-teal-wash text-teal" aria-hidden="true">
          <Icon name={icon} className="text-[24px]" />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-title-md text-ink">{title}</span>
          <span className={`text-body-sm text-pretty ${highlight ? 'font-semibold text-teal' : 'text-ink-muted'}`}>{hint}</span>
        </span>
      </Link>
    </li>
  );
}

function WideBody({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-2">
      <span className="font-title text-title-lg text-ink">{title}</span>
      <span className="max-w-prose text-body-md text-ink-muted text-pretty">{text}</span>
      {children}
    </span>
  );
}

function WideMascot({ name }: { name: MascotName }) {
  return (
    <span className="hidden shrink-0 sm:block" aria-hidden="true">
      <Mascot name={name} className="h-20 w-auto" />
    </span>
  );
}
