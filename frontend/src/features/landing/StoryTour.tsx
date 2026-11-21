import { AnimatePresence, motion, useInView } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EASE_OUT, Reveal } from '@/shared/motion';
import { Icon } from '@/shared/ui/Icon';

/**
 * Tur gulir di beranda: tiap bab satu langkah sesi REKSA. Di desktop, panel kanan
 * menempel dan berganti sesuai bab yang sedang dibaca; di HP, contoh tampilan
 * muncul di bawah teks tiap bab. Semua angka di contoh tampilan diberi label
 * "Contoh tampilan" dan sama dengan data contoh di aplikasi.
 */

type Chapter = {
  id: string;
  label: string;
  title: string;
  body: string[];
  visual: () => ReactNode;
};

const CHAPTERS: Chapter[] = [
  {
    id: 'masalah',
    label: 'Sebelum mulai',
    title: 'Baca ulang tiga kali, tetap lupa saat ujian',
    body: [
      'Membaca bab yang sama berkali-kali membuat isinya terasa akrab. Rasa akrab itu gampang dikira paham.',
      'Begitu buku ditutup, yang bisa kamu jelaskan sendiri ternyata jauh lebih sedikit. REKSA dibuat untuk momen setelah buku ditutup itu.',
    ],
    visual: () => <HighlightedPage />,
  },
  {
    id: 'materi',
    label: 'Langkah 1',
    title: 'Mulai dari materi yang memang kamu pelajari',
    body: [
      'Tempel teks dari buku atau catatan guru, atau unggah PDF babnya. REKSA menyusun konsep kunci dan hubungan sebab-akibat di dalamnya.',
      'Daftar itulah patokan saat catatanmu dicek nanti, jadi dari awal kamu sudah tahu apa yang dinilai.',
    ],
    visual: () => <RubricCard />,
  },
  {
    id: 'fokus',
    label: 'Langkah 2',
    title: 'Bacaan ditutup, kamu menulis dari ingatan',
    body: [
      'Pilih 15, 25, atau 45 menit. Selama waktu berjalan, bacaan disembunyikan.',
      'Ambil kertas dan tulis semua yang kamu ingat: poin, panah, gambar kecil, apa saja. Bagian yang terasa sulit diingat justru bagian yang sedang kamu latih.',
    ],
    visual: () => <FocusTimer />,
  },
  {
    id: 'tebak',
    label: 'Langkah 3',
    title: 'Tebak dulu seberapa paham kamu',
    body: [
      'Sebelum catatan dicek, geser angka 0 sampai 100 sesuai keyakinanmu. Tebakan ini dikunci, jadi tidak bisa diubah setelah melihat hasil.',
      'Dari sini kamu belajar membedakan merasa paham dan benar-benar paham. Langkah ini jarang ada di aplikasi belajar lain.',
    ],
    visual: () => <ConfidenceSlider />,
  },
  {
    id: 'foto',
    label: 'Langkah 4',
    title: 'Foto catatanmu, coretan tetap dihitung',
    body: [
      'Potret kertasnya langsung dengan kamera belakang HP, atau unggah fotonya dari laptop.',
      'Yang dicek adalah ide dan hubungan antarkonsep, bukan kerapian tulisan. Singkatan, panah, dan coretan dibaca sebagai ide.',
    ],
    visual: () => <NotePhoto />,
  },
  {
    id: 'hasil',
    label: 'Langkah 5',
    title: 'Lihat yang sudah tepat dan yang terlewat',
    body: [
      'Hasil cek menaruh tebakanmu di samping nilai hasil cek, lalu memisahkan konsep yang sudah kamu tulis dengan benar dari yang belum muncul di catatan.',
      'Kalau lebih nyaman mendengar, tekan Bacakan hasil.',
    ],
    visual: () => <ResultCard />,
  },
  {
    id: 'ulang',
    label: 'Langkah 6',
    title: 'Ulangi sebentar di hari ke-3 dan ke-7',
    body: [
      'Konsep yang terlewat masuk rencana latihan singkat, 3 sampai 5 menit, tiga hari dan tujuh hari setelah sesi.',
      'Mengingat lagi dengan jeda seperti ini membantu materi bertahan lebih lama. Pengingat otomatis menyusul setelah fitur jadwal selesai.',
    ],
    visual: () => <ReviewStrip />,
  },
];

export function StoryTour() {
  const [active, setActive] = useState(0);
  const chapter = CHAPTERS[active];

  return (
    <section id="kenalan" aria-labelledby="kenalan-title" className="px-4 py-14 sm:px-6 lg:py-20">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 lg:gap-4">
        <Reveal className="flex max-w-2xl flex-col gap-3">
          <h2 id="kenalan-title" className="font-headline text-headline-lg-mobile text-ink text-balance sm:text-headline-lg">
            Kenalan dengan REKSA, satu langkah tiap kamu gulir
          </h2>
          <p className="text-body-lg text-ink-muted text-pretty">
            Begini satu sesi belajar berjalan, dari membuka materi sampai latihan ulang minggu depan. Siapkan kertas kalau mau langsung
            mencoba.
          </p>
        </Reveal>

        <div className="grid gap-x-12 lg:grid-cols-12">
          <ol className="flex flex-col gap-16 lg:col-span-6 lg:gap-0">
            {CHAPTERS.map((c, i) => (
              <ChapterBlock key={c.id} chapter={c} index={i} active={active === i} onEnter={() => setActive(i)} />
            ))}
          </ol>

          {/* Panel menempel hanya di desktop; di HP contoh tampilan ada di dalam tiap bab. */}
          <div className="hidden lg:col-span-6 lg:block">
            <div className="sticky top-24 flex h-[calc(100dvh-8rem)] max-h-[44rem] flex-col justify-center gap-5">
              <Progress active={active} />
              <div className="relative min-h-[26rem]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={chapter.id}
                    initial={{ opacity: 0, y: 24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.98 }}
                    transition={{ duration: 0.4, ease: EASE_OUT }}
                    aria-hidden="true"
                  >
                    {chapter.visual()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChapterBlock({ chapter, index, active, onEnter }: { chapter: Chapter; index: number; active: boolean; onEnter: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  // Bab dianggap aktif saat melewati pita tengah layar.
  const inView = useInView(ref, { margin: '-45% 0px -45% 0px' });
  useEffect(() => {
    if (inView) onEnter();
  }, [inView, onEnter]);

  return (
    <li ref={ref} className="flex flex-col justify-center gap-4 lg:min-h-[80dvh]">
      {/* Bab aktif ditandai warna label, bukan dengan memudarkan teks: teks yang dipudarkan
          gagal kontras WCAG (1,7:1) padahal tetap dibaca orang saat menggulir. */}
      <div className="flex flex-col gap-4">
        <p
          className={`flex items-center gap-3 text-label-lg transition-colors duration-300 ${active ? 'text-teal' : 'max-lg:text-teal lg:text-ink-muted'}`}
        >
          <span className="font-mono text-mono-md tabular-nums" aria-hidden="true">
            {String(index).padStart(2, '0')}
          </span>
          <span aria-hidden="true" className="h-px w-8 bg-teal/40" />
          {chapter.label}
        </p>
        <h3 className="font-headline text-headline-md text-ink text-balance">{chapter.title}</h3>
        {chapter.body.map((p) => (
          <p key={p} className="max-w-prose text-body-lg text-ink-muted text-pretty">
            {p}
          </p>
        ))}
      </div>
      <Reveal className="pt-2 lg:hidden" aria-hidden="true">
        {chapter.visual()}
      </Reveal>
    </li>
  );
}

function Progress({ active }: { active: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-mono-sm text-ink-muted tabular-nums">
        {active + 1} / {CHAPTERS.length}
      </span>
      <div className="flex flex-1 gap-1.5">
        {CHAPTERS.map((c, i) => (
          <span key={c.id} className="h-1 flex-1 overflow-hidden rounded-full bg-wash-strong">
            <motion.span
              className="block h-full rounded-full bg-teal"
              initial={false}
              animate={{ scaleX: i <= active ? 1 : 0 }}
              style={{ originX: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- Contoh tampilan per bab ---------- */

function Frame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <figure className={`flex flex-col gap-3 rounded-lg border border-line-soft bg-card p-5 sm:p-6 ${className}`}>
      {children}
      <figcaption className="text-label-sm text-ink-muted">Contoh tampilan</figcaption>
    </figure>
  );
}

function HighlightedPage() {
  const lines = [92, 100, 85, 97, 64, 100, 88, 95, 72];
  const marked = [1, 2, 5, 6];
  return (
    <figure className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-6">
      <div className="flex flex-col gap-3">
        {lines.map((w, i) => (
          <span key={i} className="relative block h-2.5" style={{ width: `${w}%` }}>
            <span className="absolute inset-0 rounded-full bg-wash-strong" />
            {marked.includes(i) && <span className="absolute -inset-y-1 inset-x-0 rounded-sm bg-ember/25" />}
          </span>
        ))}
      </div>
      <figcaption className="border-t border-line-soft pt-4 text-title-md text-ink">
        Semua sudah distabilo. Kalau bukunya ditutup sekarang, apa yang masih kamu ingat?
      </figcaption>
    </figure>
  );
}

const SAMPLE_CONCEPTS = [
  { name: 'Homeostasis', weight: 5 },
  { name: 'Reseptor', weight: 3 },
  { name: 'Pusat kontrol', weight: 4 },
  { name: 'Efektor', weight: 3 },
  { name: 'Umpan balik negatif', weight: 5 },
];

function RubricCard() {
  return (
    <Frame>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-teal-wash text-teal">
          <Icon name="task_alt" fill />
        </span>
        <div>
          <p className="text-title-md text-ink">Bab 3 Homeostasis</p>
          <p className="text-body-sm text-ink-muted">5 konsep kunci disusun</p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
        {SAMPLE_CONCEPTS.map((c) => (
          <li key={c.name} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-body-md text-ink">{c.name}</span>
            <span className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={`h-1.5 w-3 rounded-full ${n <= c.weight ? 'bg-teal' : 'bg-wash-strong'}`} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="rounded-md bg-wash px-3 py-2 text-body-sm text-ink">
        <strong className="font-semibold">Reseptor</strong> <span className="text-ink-muted">→</span>{' '}
        <strong className="font-semibold">Pusat kontrol</strong>
        <span className="block text-ink-muted">Reseptor mengirim sinyal perubahan ke pusat kontrol.</span>
      </p>
    </Frame>
  );
}

function FocusTimer() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-wash px-5 py-10 text-center">
        <Icon name="lock" className="text-[32px] text-teal" />
        <p className="text-title-md text-ink">Bacaan ditutup sementara</p>
      </div>
      <figure className="ruled-sheet flex flex-col items-center justify-center gap-3 rounded-lg border border-line-soft p-5 pl-12">
        <p className="text-label-lg text-ink">Waktunya menulis di kertas</p>
        <p className="font-mono text-[52px] leading-none text-ink tabular-nums">18:42</p>
        <span className="h-1.5 w-full overflow-hidden rounded-full bg-wash-strong">
          <span className="block h-full w-1/4 rounded-full bg-teal" />
        </span>
        <figcaption className="text-label-sm text-ink-muted">Contoh tampilan</figcaption>
      </figure>
    </div>
  );
}

function ConfidenceSlider() {
  return (
    <Frame>
      <p className="text-title-md text-ink">Seberapa paham kamu dengan materi ini?</p>
      <p className="font-display text-[56px] leading-none text-teal tabular-nums">75%</p>
      <div className="relative h-2 rounded-full bg-wash-strong">
        <span className="absolute inset-y-0 left-0 w-3/4 rounded-full bg-teal" />
        <span className="absolute top-1/2 left-3/4 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-card bg-teal shadow" />
      </div>
      <div className="flex justify-between text-label-sm text-ink-muted">
        <span>Belum paham</span>
        <span>Sangat paham</span>
      </div>
      <p className="flex items-center gap-2 text-body-sm text-ink-muted">
        <Icon name="lock" className="text-[18px] text-teal" />
        Tebakan dikunci sebelum hasil keluar
      </p>
    </Frame>
  );
}

function NotePhoto() {
  return (
    <figure className="flex flex-col gap-3">
      <img
        src="/assets/inclusive-learning.jpg"
        alt=""
        width={1024}
        height={1024}
        loading="lazy"
        className="aspect-[4/3] w-full rounded-lg border border-line-soft object-cover"
      />
      <figcaption className="flex items-center gap-2 text-body-sm text-ink-muted">
        <Icon name="photo_camera" className="text-[18px] text-teal" />
        Peta konsep dengan panah tetap dibaca sebagai ide.
      </figcaption>
    </figure>
  );
}

function ResultCard() {
  return (
    <Frame>
      <div className="flex flex-col gap-2.5">
        {[
          { label: 'Tebakanmu', value: 75, tone: 'bg-ink-muted' },
          { label: 'Hasil cek', value: 62, tone: 'bg-teal' },
        ].map((b) => (
          <div key={b.label} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-3">
            <span className="text-body-sm text-ink-muted">{b.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-wash">
              <span className={`block h-full rounded-full ${b.tone}`} style={{ width: `${b.value}%` }} />
            </span>
            <span className="font-mono text-mono-sm text-ink tabular-nums">{b.value}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-3 border-t border-line-soft pt-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-label-lg text-teal">
            <Icon name="check_circle" className="text-[18px]" fill />
            Sudah tepat
          </p>
          <p className="text-body-sm text-ink">Homeostasis, Efektor</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-label-lg text-ember-ink">
            <Icon name="error" className="text-[18px]" fill />
            Terlewat
          </p>
          <p className="text-body-sm text-ink">Umpan balik negatif, Reseptor</p>
        </div>
      </div>
    </Frame>
  );
}

function ReviewStrip() {
  const days = [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    <Frame>
      <p className="text-title-md text-ink">Rencana latihan ulang</p>
      <ol className="grid grid-cols-8 gap-1.5">
        {days.map((d) => {
          const review = d === 3 || d === 7;
          return (
            <li
              key={d}
              className={`flex aspect-square flex-col items-center justify-center rounded-md text-label-sm ${
                d === 0 ? 'bg-teal text-on-teal' : review ? 'border-2 border-teal bg-teal-wash text-teal' : 'bg-wash text-ink-muted'
              }`}
            >
              <span className="font-mono tabular-nums">H{d === 0 ? '' : `+${d}`}</span>
            </li>
          );
        })}
      </ol>
      <ul className="flex flex-col gap-2 text-body-sm text-ink">
        <li className="flex items-center gap-2">
          <Icon name="event" className="text-[18px] text-teal" />
          Hari ke-3: tulis ulang Umpan balik negatif, 3 sampai 5 menit
        </li>
        <li className="flex items-center gap-2">
          <Icon name="event" className="text-[18px] text-teal" />
          Hari ke-7: ulangi sekali lagi
        </li>
      </ul>
    </Frame>
  );
}
