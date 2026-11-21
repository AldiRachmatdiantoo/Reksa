import { motion } from 'motion/react';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { TeacherClasses } from '@/features/classes/TeacherClasses';
import { pageTransition, Reveal, Stagger, StaggerItem } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Icon } from '@/shared/ui/Icon';
import { StateBlock } from '@/shared/ui/StateBlock';

// Kelola kelas sudah jalan (FR-09). Ledger bukti belajar dan peta bagian sulit
// datang dari modul `governance`; sampai endpoint itu ada, keduanya hanya
// dijelaskan, bukan diisi data siswa karangan.
const UPCOMING = [
  {
    icon: 'verified_user',
    title: 'Bukti belajar asli siswa',
    body: 'Lama waktu fokus, tebakan nilai, dan foto tulisan tangan setiap siswa, terkunci dengan hash agar tidak bisa diubah.',
  },
  {
    icon: 'analytics',
    title: 'Peta bagian sulit di kelas',
    body: 'Konsep yang paling sering terlewat oleh satu kelas, dikelompokkan otomatis, lengkap dengan saran untuk pertemuan berikutnya.',
  },
];

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

        <section aria-labelledby="upcoming-title" className="flex flex-col gap-4">
          <h2 id="upcoming-title" className="font-headline text-headline-md text-ink">
            Menyusul di portal ini
          </h2>
          <Stagger as="ul" delay={0.2} className="grid gap-4 md:grid-cols-2">
            {UPCOMING.map((item) => (
              <StaggerItem as="li" key={item.title} className="flex gap-4 rounded-md border border-line-soft bg-card p-5">
                <Icon name={item.icon} className="text-[28px] text-teal" />
                <div className="flex flex-col gap-1">
                  <h3 className="font-title text-title-md text-ink">{item.title}</h3>
                  <p className="text-body-md text-ink-muted text-pretty">{item.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      </motion.main>
    </>
  );
}
