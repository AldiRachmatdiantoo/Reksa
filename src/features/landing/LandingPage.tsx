import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { homePathFor } from '@/features/auth/authApi';
import { useConsent } from '@/shared/consent';
import { EASE_OUT, pageTransition, Reveal, Stagger, StaggerItem, WordReveal } from '@/shared/motion';
import { Brand } from '@/shared/ui/Brand';
import { ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

type Audience = 'pelajar' | 'guru';

const STUDENT_STEPS = [
  {
    title: 'Fokus dan tulis di kertas',
    body: 'Pilih waktu 15, 25, atau 45 menit. Bahan bacaan ditutup selama waktu berjalan, jadi kamu menulis dari ingatan sendiri.',
  },
  {
    title: 'Tebak nilaimu, lalu foto',
    body: 'Sebelum dicek, tebak dulu seberapa paham kamu (0 sampai 100%). Dari sini kamu belajar membedakan benar-benar paham dan merasa paham.',
    highlight: true,
  },
  {
    title: 'Lihat yang terlewat, ulangi singkat',
    body: 'Hasil menunjukkan konsep yang sudah tepat, yang masih terlewat, dan latihan ulang 3 sampai 5 menit di hari ke-3 dan ke-7.',
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
  const [audience, setAudience] = useState<Audience>('pelajar');
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
            <a href="#cara-kerja" className="text-label-lg text-ink-muted hover:text-teal">
              Cara kerja
            </a>
            <a href="#penilaian" className="text-label-lg text-ink-muted hover:text-teal">
              Cara menilai
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
                <a href="#cara-kerja" className="inline-flex min-h-13 items-center gap-1.5 rounded-full px-4 text-title-md text-teal hover:bg-wash">
                  Lihat alurnya
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

        <section id="cara-kerja" aria-labelledby="cara-kerja-title" className="px-4 py-14 sm:px-6 lg:py-20">
          <div className="mx-auto flex max-w-6xl flex-col gap-8">
            <Reveal className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div className="flex max-w-xl flex-col gap-2">
                <h2 id="cara-kerja-title" className="font-headline text-headline-lg-mobile text-ink text-balance sm:text-headline-lg">
                  Satu tempat untuk belajar dan mengajar
                </h2>
                <p className="text-body-lg text-ink-muted text-pretty">Pilih peranmu untuk melihat alurnya.</p>
              </div>
              <SegmentedTabs
                label="Pilih peran"
                value={audience}
                onChange={setAudience}
                options={[
                  { value: 'pelajar', label: 'Untuk pelajar', panelId: 'panel-audience' },
                  { value: 'guru', label: 'Untuk guru', panelId: 'panel-audience' },
                ]}
              />
            </Reveal>

            <div id="panel-audience" role="tabpanel" aria-label={audience === 'pelajar' ? 'Alur untuk pelajar' : 'Manfaat untuk guru'}>
              <AnimatePresence mode="wait">
                {audience === 'pelajar' ? (
                  <Stagger
                    as="ol"
                    key="pelajar"
                    gap={0.1}
                    exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
                    className="grid gap-px overflow-hidden rounded-lg border border-line-soft bg-line-soft md:grid-cols-3"
                  >
                    {STUDENT_STEPS.map((step, i) => (
                      <StaggerItem
                        as="li"
                        key={step.title}
                        className={`flex flex-col gap-3 p-6 sm:p-7 ${step.highlight ? 'bg-teal-wash' : 'bg-card'}`}
                      >
                        <span className="font-display text-[56px] leading-none text-teal tabular-nums" aria-hidden="true">
                          {i + 1}
                        </span>
                        <h3 className="font-title text-title-lg text-ink">
                          <span className="sr-only">Langkah {i + 1}: </span>
                          {step.title}
                        </h3>
                        <p className="text-body-md text-ink-muted text-pretty">{step.body}</p>
                        {step.highlight && (
                          <p className="mt-auto text-label-md text-teal">Langkah yang jarang ada di aplikasi belajar lain.</p>
                        )}
                      </StaggerItem>
                    ))}
                  </Stagger>
                ) : (
                  <Stagger
                    as="ul"
                    key="guru"
                    gap={0.1}
                    exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
                    className="grid gap-4 md:grid-cols-2"
                  >
                    {TEACHER_POINTS.map((point) => (
                      <StaggerItem as="li" key={point.title} className="flex gap-4 rounded-lg border border-line-soft bg-card p-6 sm:p-7">
                        <Icon name={point.icon} className="text-[32px] text-teal" />
                        <div className="flex flex-col gap-2">
                          <h3 className="font-title text-title-lg text-ink">{point.title}</h3>
                          <p className="text-body-md text-ink-muted text-pretty">{point.body}</p>
                        </div>
                      </StaggerItem>
                    ))}
                  </Stagger>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

        <section id="penilaian" aria-labelledby="penilaian-title" className="border-y border-line-soft bg-card px-4 py-14 sm:px-6 lg:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-12">
            <motion.img
              initial={{ opacity: 0, x: -32, rotate: -2 }}
              whileInView={{ opacity: 1, x: 0, rotate: 0 }}
              viewport={{ once: true, margin: '0px 0px -15% 0px' }}
              transition={{ duration: 0.8, ease: EASE_OUT }}
              src="/assets/inclusive-learning.jpg"
              alt="Kertas berisi peta konsep dengan panah dan pensil, di samping HP yang memotretnya"
              width={1024}
              height={1024}
              loading="lazy"
              className="aspect-square w-full max-w-md rounded-lg border border-line-soft object-cover lg:col-span-5"
            />
            <Reveal delay={0.1} className="flex flex-col gap-5 lg:col-span-7">
              <h2 id="penilaian-title" className="font-headline text-headline-lg-mobile text-ink text-balance sm:text-headline-lg">
                Yang dinilai idemu, bukan rapinya tulisan
              </h2>
              <p className="max-w-prose text-body-lg text-ink-muted text-pretty">
                Catatan dinilai dari konsep dan hubungan sebab-akibat di materi. Panah, singkatan, dan coretan dihitung sebagai ide, bukan
                dikurangi nilainya karena kurang rapi.
              </p>
              <ul className="grid gap-4 border-t border-line-soft pt-5 sm:grid-cols-2">
                <li className="flex gap-3">
                  <Icon name="volume_up" className="text-teal" />
                  <span className="text-body-md text-ink">
                    <strong className="font-semibold">Bacakan hasil.</strong> Hasil cek bisa didengarkan, membantu yang lebih nyaman
                    mendengar daripada membaca.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Icon name="photo_camera" className="text-teal" />
                  <span className="text-body-md text-ink">
                    <strong className="font-semibold">Kamera HP atau laptop.</strong> Foto langsung dari kamera belakang HP, atau unggah
                    foto dari laptop.
                  </span>
                </li>
              </ul>
            </Reveal>
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
              <p className="text-body-lg opacity-90 text-pretty">Siapkan selembar kertas dan pulpen. Sesi pertama selesai dalam 15 menit.</p>
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
            <a href="#cara-kerja" className="inline-flex min-h-11 items-center hover:text-teal">
              Cara kerja
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
