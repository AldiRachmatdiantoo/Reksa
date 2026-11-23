import { useState } from 'react';
import { Mascot, type MascotName } from '@/shared/mascot/Mascot';
import { Reveal, Stagger, StaggerItem } from '@/shared/motion';

/** Isi sama dengan peran maskot di aplikasi (panduan sambutan dan pop up pujian). */
const TRIO: { name: MascotName; label: string; kind: string; job: string }[] = [
  {
    name: 'risa',
    label: 'Risa',
    kind: 'Kertas catatan',
    job: 'Menyambutmu di awal, lalu membacakan apa yang sudah tepat dan yang masih terlewat di catatanmu.',
  },
  { name: 'rasi', label: 'Rasi', kind: 'Pensil', job: 'Menjaga waktu fokusmu dan mengingatkan latihan ulang di hari ke-3 dan ke-7.' },
  {
    name: 'risu',
    label: 'Risu',
    kind: 'Buku berkacamata',
    job: 'Membaca materimu dan menyusun poin penting yang jadi patokan saat catatan dicek.',
  },
];

/** Perkenalan tiga maskot. Disentuh atau disorot, maskot bersorak seperti di aplikasi. */
export function MascotTrio() {
  return (
    <section aria-labelledby="trio-title" className="px-4 pt-14 sm:px-6 lg:pt-20">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <Reveal className="flex max-w-2xl flex-col gap-3">
          <h2 id="trio-title" className="font-headline text-headline-lg-mobile text-ink text-balance sm:text-headline-lg">
            Belajar ditemani Risa, Rasi, dan Risu
          </h2>
          <p className="text-body-lg text-ink-muted text-pretty">
            Tiga teman kecil ini memandu sesi pertamamu dan ikut senang tiap kamu menyelesaikan satu langkah.
          </p>
        </Reveal>
        <Stagger as="ul" gap={0.12} className="grid gap-4 sm:grid-cols-3">
          {TRIO.map((m) => (
            <StaggerItem as="li" key={m.name}>
              <TrioCard {...m} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function TrioCard({ name, label, kind, job }: (typeof TRIO)[number]) {
  const [cheer, setCheer] = useState(false);
  return (
    <div
      onPointerEnter={() => setCheer(true)}
      onPointerLeave={() => setCheer(false)}
      className="flex h-full overflow-hidden rounded-lg border border-line-soft bg-card sm:flex-col"
    >
      <div className="flex w-28 shrink-0 items-end justify-center bg-teal-wash px-2 pt-4 sm:h-44 sm:w-auto sm:px-0 sm:pt-5">
        <Mascot name={name} mood={cheer ? 'cheer' : 'idle'} className="h-28 w-auto sm:h-full" />
      </div>
      <div className="flex flex-col gap-1 p-4 sm:p-5">
        <h3 className="font-title text-title-lg text-ink">
          {label} <span className="text-body-sm text-ink-muted">· {kind}</span>
        </h3>
        <p className="text-body-md text-ink-muted text-pretty">{job}</p>
      </div>
    </div>
  );
}
