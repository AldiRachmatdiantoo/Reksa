import { motion } from 'motion/react';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { TeacherClasses } from '@/features/classes/TeacherClasses';
import { CohortSection } from './CohortSection';
import { LedgerSection } from './LedgerSection';
import { pageTransition, Reveal } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { StateBlock } from '@/shared/ui/StateBlock';

export function TeacherPage() {
  const auth = useAuth();
  const fullName = auth.status === 'authenticated' ? auth.user.fullName : '';
  const isEducator = auth.status === 'authenticated' && auth.user.role === 'EDUCATOR';

  useEffect(() => {
    document.title = 'Portal Guru · REKSA';
  }, []);

  return (
    <>
      <AppHeader subtitle="Portal Guru" />
      <motion.main
        {...pageTransition}
        className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10"
      >
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">Halo, {fullName}</h1>
          <p className="max-w-prose text-body-lg text-ink-muted text-pretty">
            {isEducator
              ? 'Buat kelas, bagikan kodenya ke siswa, lalu bagikan materi yang perlu mereka pelajari.'
              : 'Portal admin institusi masih dalam pengembangan.'}
          </p>
        </header>

        <Reveal delay={0.1}>
          {isEducator ? (
            <TeacherClasses />
          ) : (
            <StateBlock icon="domain" title="Portal admin institusi menyusul">
              Nantinya kamu bisa membuat kode undangan pengajar dan melihat kelas di institusimu dari sini.
            </StateBlock>
          )}
        </Reveal>

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
