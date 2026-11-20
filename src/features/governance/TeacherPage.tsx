import { motion } from 'motion/react';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Icon } from '@/shared/ui/Icon';
import { StateBlock } from '@/shared/ui/StateBlock';

// Data kelas datang dari modul `governance` (ledger bukti belajar + peta
// bagian sulit kelas). Sampai endpoint itu ada, halaman ini menampilkan
// empty state, bukan data siswa karangan.
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
  const firstName = auth.status === 'authenticated' ? auth.user.fullName.split(' ')[0] : '';

  useEffect(() => {
    document.title = 'Portal Guru · REKSA';
  }, []);

  return (
    <>
      <AppHeader subtitle="Portal Guru" />
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10"
      >
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">Halo, {firstName}</h1>
          <p className="max-w-prose text-body-lg text-ink-muted text-pretty">
            Portal ini menampilkan hasil belajar siswa di kelas yang kamu ajar.
          </p>
        </header>

        <StateBlock icon="groups" title="Belum ada kelas yang terhubung">
          Kelas dan anggota kelas dibuat oleh admin institusi. Begitu kamu terdaftar sebagai pengajar sebuah kelas dan siswanya mulai
          mengirim catatan, ringkasannya muncul di sini.
        </StateBlock>

        <section aria-labelledby="upcoming-title" className="flex flex-col gap-4">
          <h2 id="upcoming-title" className="font-headline text-headline-md text-ink">
            Yang akan kamu lihat di sini
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {UPCOMING.map((item) => (
              <li key={item.title} className="flex gap-4 rounded-md border border-line-soft bg-card p-5">
                <Icon name={item.icon} className="text-[28px] text-teal" />
                <div className="flex flex-col gap-1">
                  <h3 className="font-title text-title-md text-ink">{item.title}</h3>
                  <p className="text-body-md text-ink-muted text-pretty">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </motion.main>
    </>
  );
}
