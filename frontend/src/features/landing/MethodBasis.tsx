import { Reveal, Stagger, StaggerItem } from '@/shared/motion';

type Basis = {
  finding: string;
  inApp: string;
  source: { label: string; href: string };
};

/**
 * Hanya temuan yang buktinya kuat dan sumbernya sudah dicek. Jangan menambah klaim di sini tanpa sumber asli;
 * hal yang dipilih karena alasan praktis ditulis terpisah di bawahnya.
 */
const BASIS: Basis[] = [
  {
    finding: 'Mengingat tanpa melihat bacaan membuat materi bertahan lebih lama dibanding membaca ulang.',
    inApp: 'Selama waktu fokus, bacaan disembunyikan dan kamu menulis dari ingatan.',
    source: {
      label: 'Roediger & Karpicke, 2006, Psychological Science',
      href: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
    },
  },
  {
    finding: 'Peta pikiran sama ampuhnya dengan menulis bebas, asalkan dibuat dari ingatan, bukan sambil melihat bacaan.',
    inApp: 'Panah, peta pikiran, dan gambar kecil di kertasmu tetap dihitung.',
    source: {
      label: 'Blunt & Karpicke, 2014, Journal of Educational Psychology',
      href: 'https://scholar.google.com/scholar?q=%22Learning+with+retrieval-based+concept+mapping%22',
    },
  },
  {
    finding: 'Latihan yang diberi jeda beberapa hari lebih awet daripada belajar sekaligus dalam satu waktu.',
    inApp: 'Poin yang terlewat dilatih lagi di hari ke-3 dan ke-7.',
    source: {
      label: 'Cepeda dkk., 2006, Psychological Bulletin',
      href: 'https://doi.org/10.1037/0033-2909.132.3.354',
    },
  },
  {
    finding: 'Mahasiswa yang terlalu yakin sudah paham cenderung berhenti belajar terlalu cepat, dan hasilnya lebih rendah.',
    inApp: 'Kamu menebak nilai dulu, lalu tebakan itu dibandingkan dengan hasil cek.',
    source: {
      label: 'Dunlosky & Rawson, 2012, Learning and Instruction',
      href: 'https://scholar.google.com/scholar?q=%22Overconfidence+produces+underachievement%22',
    },
  },
];

const DUNLOSKY_2013 = 'https://doi.org/10.1177/1529100612453266';

export function MethodBasis() {
  return (
    <section id="dasar-metode" aria-labelledby="metode-title" className="px-4 pb-14 sm:px-6 lg:pb-20">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-12">
        <Reveal className="flex flex-col gap-3 lg:col-span-4">
          <h2 id="metode-title" className="font-headline text-headline-lg-mobile text-ink text-balance sm:text-headline-lg">
            Dasar metodenya
          </h2>
          <p className="text-body-lg text-ink-muted text-pretty">
            Latihan mengingat dan latihan berjeda adalah dua teknik belajar yang dinilai paling bermanfaat dalam tinjauan{' '}
            <a
              href={DUNLOSKY_2013}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal underline underline-offset-2 hover:text-ink"
            >
              Dunlosky dkk. (2013)
            </a>
            . Membaca ulang dan menstabilo termasuk yang paling rendah. REKSA dibangun dari temuan ini.
          </p>
        </Reveal>

        <div className="flex flex-col gap-6 lg:col-span-8">
          <Stagger as="ol" gap={0.08} className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {BASIS.map((item) => (
              <StaggerItem as="li" key={item.source.href} className="grid gap-2 py-5 sm:grid-cols-[1fr_auto] sm:gap-x-8">
                <div className="flex flex-col gap-1">
                  <p className="text-title-md text-ink text-pretty">{item.finding}</p>
                  <p className="text-body-md text-ink-muted text-pretty">{item.inApp}</p>
                </div>
                <a
                  href={item.source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center self-start text-body-sm text-teal underline underline-offset-2 hover:text-ink sm:max-w-56 sm:text-right"
                >
                  {item.source.label}
                </a>
              </StaggerItem>
            ))}
          </Stagger>
          <p className="text-body-sm text-ink-muted text-pretty">
            Yang tidak kami klaim: pilihan waktu fokus 15, 25, atau 45 menit dan menulis di kertas dipilih karena praktis dan bebas
            gangguan, bukan karena terbukti lebih unggul. Hari ke-3 dan ke-7 juga bukan angka ajaib. Yang penting ada jeda sebelum mengingat
            lagi.
          </p>
        </div>
      </div>
    </section>
  );
}
