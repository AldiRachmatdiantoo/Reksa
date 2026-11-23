import { Stagger, StaggerItem } from '@/shared/motion';
import type { Rubric } from './materialsApi';

/** Bobot 1..5 dari rubrik: makin tinggi, makin menentukan nilai saat catatan dicek. */
function WeightMeter({ weight }: { weight: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`Bobot ${weight} dari 5`} title={`Bobot ${weight} dari 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={`h-1.5 w-3 rounded-full ${n <= weight ? 'bg-teal' : 'bg-wash-strong'}`} />
      ))}
    </span>
  );
}

/**
 * Daftar poin penting + hubungan sebab-akibat. Inilah patokan saat foto catatan dicek,
 * jadi ditampilkan apa adanya supaya user tahu apa yang akan dinilai.
 */
export function RubricPreview({ rubric, animate = 'mount' }: { rubric: Rubric; animate?: 'mount' | 'view' }) {
  const name = (id: string) => rubric.keyConcepts.find((c) => c.id === id)?.concept ?? id;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-md text-ink-muted text-pretty">{rubric.summary}</p>

      <section aria-label="Poin penting" className="flex flex-col gap-2">
        <h3 className="text-label-lg text-ink">Poin penting ({rubric.keyConcepts.length})</h3>
        <Stagger as="dl" trigger={animate} gap={0.05} className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {rubric.keyConcepts.map((c) => (
            <StaggerItem key={c.id} className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="flex flex-col gap-1.5">
                <span className="text-title-md text-teal">{c.concept}</span>
                <WeightMeter weight={c.weight} />
              </dt>
              <dd className="text-body-md text-ink">{c.definition}</dd>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {rubric.causalRelations.length > 0 && (
        <section aria-label="Hubungan sebab-akibat" className="flex flex-col gap-2">
          <h3 className="text-label-lg text-ink">Hubungan sebab-akibat</h3>
          <ul className="flex flex-col gap-2">
            {rubric.causalRelations.map((r) => (
              <li key={`${r.fromConceptId}-${r.toConceptId}`} className="rounded-md bg-wash px-4 py-3 text-body-md text-ink">
                <span className="font-semibold">{name(r.fromConceptId)}</span>
                <span className="px-1.5 text-ink-muted" aria-label="ke">
                  →
                </span>
                <span className="font-semibold">{name(r.toConceptId)}</span>
                <span className="block text-body-sm text-ink-muted">{r.relation}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
