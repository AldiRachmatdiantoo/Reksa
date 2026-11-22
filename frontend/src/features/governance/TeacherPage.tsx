import { motion } from 'motion/react';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { TeacherClasses } from '@/features/classes/TeacherClasses';
import { AdminPortal } from '@/features/institution/AdminPortal';
import { CohortSection } from './CohortSection';
import { LedgerSection } from './LedgerSection';
import { pageTransition, Reveal } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';

export function TeacherPage() {
  const auth = useAuth();
  const fullName = auth.status === 'authenticated' ? auth.user.fullName : '';
  const isEducator = auth.status === 'authenticated' && auth.user.role === 'EDUCATOR';

  const portal = isEducator || auth.status !== 'authenticated' ? 'Portal Guru' : 'Portal Institusi';

  useEffect(() => {
    document.title = `${portal} · REKSA`;
  }, [portal]);

  return (
    <>
      <AppHeader subtitle={portal} />
      <motion.main {...pageTransition} className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">Halo, {fullName}</h1>
          <p className="max-w-prose text-body-lg text-ink-muted text-pretty">
            {isEducator
              ? 'Buat kelas, bagikan kodenya ke siswa, lalu bagikan materi yang perlu mereka pelajari.'
              : 'Undang pengajar, lihat kelas di institusimu, dan konsep yang paling sering terlewat.'}
          </p>
        </header>

        <Reveal delay={0.1}>{isEducator ? <TeacherClasses /> : <AdminPortal />}</Reveal>

        {isEducator && (
          <Reveal delay={0.15}>
            <LedgerSection />
          </Reveal>
        )}

        {isEducator && (
          <Reveal delay={0.2}>
            <CohortSection />
          </Reveal>
        )}
      </motion.main>
    </>
  );
}
