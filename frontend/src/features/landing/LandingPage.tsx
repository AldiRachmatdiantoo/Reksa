import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { homePathFor } from '@/features/auth/authApi';
import { useConsent } from '@/shared/consent';
import { EASE_OUT, pageTransition, Reveal, Stagger, StaggerItem, WordReveal } from '@/shared/motion';
import { Brand } from '@/shared/ui/Brand';
import { ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { StoryTour } from './StoryTour';

/** Hanya pertanyaan yang jawabannya sudah benar untuk versi saat ini. */
const FAQ = [
  {
    q: 'Materi apa saja yang bisa dipakai?',
    a: 'Teks yang kamu tempel (sampai 15.000 karakter) atau file PDF berisi teks, maksimal 10 MB. PDF hasil scan foto belum bisa dibaca, jadi unggah versi teksnya atau tempel isinya.',
  },
  {
    q: 'Tulisanku berantakan. Apakah nilainya turun?',
    a: 'Tidak. Yang dicek adalah konsep dan hubungan sebab-akibat di catatanmu. Panah, singkatan, dan coretan tetap dihitung sebagai ide.',
  },
  {
    q: 'Kenapa harus menebak nilai sebelum dicek?',
    a: 'Supaya kamu tahu bedanya merasa paham dan benar-benar paham. Di halaman hasil, tebakanmu dibandingkan dengan hasil cek.',
  },
  {
    q: 'Butuh alat apa saja?',
    a: 'Kertas, pulpen, dan kamera HP. Kalau belajar di laptop, foto catatan bisa diunggah dari laptop juga.',
  },
  {
    q: 'Materi yang sudah diunggah bisa dihapus?',
    a: 'Bisa, dari halaman Materi saya. Materi yang sudah dipakai di sesi belajar tetap disimpan supaya riwayat belajarmu utuh.',
  },
];

const TEACHER_POINTS = [
  {
    icon: 'verified_user',
    title: 'Bukti belajar asli siswa',
    body: 'Lama waktu fokus dan foto tulisan tangan menunjukkan siswa benar-benar berpikir, bukan menyalin dari internet.',
  },
  {
    icon: 'analytics',
    title: 'Peta bagian sulit di kelas',
    body: 'Topik yang paling sering terlewat oleh satu kelas, untuk bahan pertemuan berikutnya.',
  },
];

export function LandingPage() {
  const auth = useAuth();
  const { reopen: openCookieSettings } = useConsent();
  const user = auth.status === 'authenticated' ? auth.user : null;
  // Parallax tipis pada foto hero: bergeser 40px selama hero digulir keluar layar.
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroImageY = useTransform(scrollYProgress, [0, 1], [0, 40]);

  useEffect(() => {
    document.title = 'REKSA · Teman Belajar Aktif';
  }, []);

  return (
    <motion.div {...pageTransition} className="flex min-h-dvh flex-col">
      <a
        href="#isi"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-label-lg"
      >
        Langsung ke isi
      </a>
      <header className="sticky top-0 z-30 border-b border-line-soft bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Brand />
          <nav aria-label="Navigasi utama" className="hidden items-center gap-6 md:flex">
            <a href="#kenalan" className="text-label-lg text-ink-muted hover:text-teal">
              Cara kerja
            </a>
            <a href="#guru" className="text-label-lg text-ink-muted hover:text-teal">
              Untuk guru
            </a>
            <a href="#tanya-jawab" className="text-label-lg text-ink-muted hover:text-teal">
              Tanya jawab
            </a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {user ? (
              <ButtonLink to={homePathFor(user.role)} variant="primary">
                {user.role === 'STUDENT' ? 'Ruang belajar' : 'Portal guru'}
              </ButtonLink>
            ) : (
              <>
                <ButtonLink to="/masuk" variant="ghost" className="px-3 sm:px-5">
                  Masuk
                </ButtonLink>
                <ButtonLink to="/daftar" variant="primary" className="hidden sm:inline-flex">
                  Daftar
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="isi" className="flex flex-1 flex-col">
        <section ref={heroRef} className="overflow-hidden border-b border-line-soft bg-card">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:py-16">
            <div className="flex flex-col gap-5 lg:col-span-6">
              <h1 className="font-display text-display-lg-mobile text-ink text-balance sm:text-display-lg">
                <WordReveal text="Ubah catatan kertas jadi pemahaman nyata" delay={0.1} />
              </h1>
              <Reveal delay={0.45}>
              <p className="max-w-prose text-body-lg text-ink-muted text-pretty">
                Catat ulang pelajaran di kertas saat waktu fokus berjalan, lalu foto catatanmu. REKSA menunjukkan bagian yang sudah tepat
                dan yang masih terlewat, tanpa tablet mahal.
              </p>
              </Reveal>
              <Reveal delay={0.6} className="flex flex-wrap items-center gap-3 pt-1">
                <ButtonLink to={user ? homePathFor(user.role) : '/daftar'} variant="accent" size="lg">
                  {user ? 'Lanjut belajar' : 'Buat akun gratis'}
                </ButtonLink>
                <a href="#kenalan" className="inline-flex min-h-13 items-center gap-1.5 rounded-full px-4 text-title-md text-teal hover:bg-wash">
                  Kenalan dulu
                  <Icon name="arrow_downward" className="text-[20px]" />
                </a>
              </Reveal>
            </div>
            <motion.figure
              className="lg:col-span-6"
              initial={{ opacity: 0, clipPath: 'inset(12% 12% 12% 12% round 24px)' }}
              animate={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 0px)' }}
              transition={{ duration: 1, delay: 0.2, ease: EASE_OUT }}
            >
              <motion.img
                style={{ y: heroImageY }}
                src="/assets/active-learning.jpg"
                alt="Pelajar menulis peta konsep di kertas sambil memotretnya dengan kamera HP"
                width={1376}
                height={768}
                fetchPriority="high"
                className="aspect-[1376/768] w-full rounded-lg border border-line-soft object-cover"
              />
              <figcaption className="mt-3 flex items-center gap-2 text-body-sm text-ink-muted">
                <Icon name="edit" className="text-[18px] text-teal" />
                Cukup kertas, pulpen, dan kamera HP.
              </figcaption>
            </motion.figure>
          </div>
        </section>

        <StoryTour />

        <section id="guru" aria-labelledby="guru-title" className="border-y border-line-soft bg-card px-4 py-14 sm:px-6 lg:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-12">
            <Reveal className="flex flex-col gap-3 lg:col-span-5">
              <h2 id="guru-title" className="font-headline text-headline-lg-mobile text-ink text-balance sm:text-headline-lg">
                Lihat proses belajar siswa, bukan hanya jawaban akhirnya
              </h2>
              <p className="text-body-lg text-ink-muted text-pretty">
                Tugas yang dikerjakan dari ingatan di atas kertas susah disalin dari internet. Guru bisa melihat buktinya dan bagian materi
                yang paling sering terlewat di kelas.
              </p>
              <p className="text-body-sm text-ink-muted">
                Membuat kelas dan membagikan materi sudah bisa dipakai. Dua fitur ini menyusul bertahap.
              </p>
            </Reveal>
            <Stagger as="ul" gap={0.1} className="grid gap-4 self-center lg:col-span-7">
              {TEACHER_POINTS.map((point) => (
                <StaggerItem as="li" key={point.title} className="flex gap-4 rounded-lg border border-line-soft bg-paper p-6 sm:p-7">
                  <Icon name={point.icon} className="text-[32px] text-teal" />
                  <div className="flex flex-col gap-2">
                    <h3 className="font-title text-title-lg text-ink">{point.title}</h3>
                    <p className="text-body-md text-ink-muted text-pretty">{point.body}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        <section id="tanya-jawab" aria-labelledby="faq-title" className="px-4 pt-14 sm:px-6 lg:pt-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-12">
            <Reveal className="flex flex-col gap-2 lg:col-span-4">
              <h2 id="faq-title" className="font-headline text-headline-lg-mobile text-ink text-balance sm:text-headline-lg">
                Yang sering ditanyakan
              </h2>
              <p className="text-body-lg text-ink-muted text-pretty">Jawaban singkat sebelum kamu mulai sesi pertama.</p>
            </Reveal>
            <Stagger as="ul" gap={0.06} className="flex flex-col divide-y divide-line-soft border-y border-line-soft lg:col-span-8">
              {FAQ.map((item) => (
                <StaggerItem as="li" key={item.q}>
                  <details className="group">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-title-md text-ink hover:text-teal [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <Icon
                        name="expand_more"
                        className="shrink-0 text-ink-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                      />
                    </summary>
                    <p className="max-w-prose pb-5 text-body-md text-ink-muted text-pretty">{item.a}</p>
                  </details>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '0px 0px -10% 0px' }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
            className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-xl bg-teal p-8 text-on-teal sm:p-10 md:flex-row md:items-center dark:border dark:border-line dark:bg-teal-wash dark:text-ink">
            <div className="flex max-w-xl flex-col gap-2">
              <h2 className="font-headline text-headline-md text-balance sm:text-headline-lg">Siap uji pemahamanmu hari ini?</h2>
              <p className="text-body-lg opacity-90 text-pretty">Siapkan selembar kertas dan pulpen. Siapkan materi, lalu sesi pertama selesai dalam 15 menit.</p>
            </div>
            <ButtonLink to={user ? homePathFor(user.role) : '/daftar'} variant="accent" size="lg" className="shrink-0">
              {user ? 'Buka ruang belajar' : 'Buat akun gratis'}
            </ButtonLink>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-line-soft px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-body-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-headline text-title-md text-teal">REKSA</span> · Belajar aktif dari kertas
          </p>
          <nav aria-label="Tautan bawah" className="flex flex-wrap gap-x-6">
            <a href="#kenalan" className="inline-flex min-h-11 items-center hover:text-teal">
              Cara kerja
            </a>
            <a href="#tanya-jawab" className="inline-flex min-h-11 items-center hover:text-teal">
              Tanya jawab
            </a>
            <Link to="/masuk" className="inline-flex min-h-11 items-center hover:text-teal">
              Masuk
            </Link>
            <Link to="/daftar" className="inline-flex min-h-11 items-center hover:text-teal">
              Daftar
            </Link>
            <button type="button" onClick={openCookieSettings} className="inline-flex min-h-11 items-center hover:text-teal">
              Pengaturan cookie
            </button>
          </nav>
          <p>© 2026 REKSA</p>
        </div>
      </footer>
    </motion.div>
  );
}
