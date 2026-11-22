import { useEffect, useState } from 'react';
import { useClasses } from '@/features/classes/classesApi';
import { FillBar } from '@/shared/motion';
import { Icon } from '@/shared/ui/Icon';
import { conceptShareLabel, governanceApi, type CohortBlindSpots, type CohortMaterial, type ImportanceLevel } from './governanceApi';

const IMPORTANCE: Record<ImportanceLevel, { label: string; className: string }> = {
  HIGH: { label: 'Penting', className: 'bg-danger-wash text-on-danger-wash' },
  MEDIUM: { label: 'Sedang', className: 'bg-wash-strong text-ember-ink' },
  LOW: { label: 'Tambahan', className: 'bg-wash-strong text-ink-muted' },
};

const SELECT_CLASS = 'min-h-12 rounded-[12px] border border-line bg-card px-4 text-body-lg text-ink';

type Load<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error' };

function RetryAlert({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <p role="alert" className="text-body-md text-on-danger-wash">
      {text}{' '}
      <button type="button" onClick={onRetry} className="min-h-11 text-teal underline underline-offset-2">
        Coba lagi
      </button>
    </p>
  );
}

/** Peta bagian sulit satu kelas (FR-08): konsep yang paling sering terlewat dan saran bahan ajar. */
export function CohortSection() {
  const classes = useClasses();
  const owned = classes.state.status === 'ready' ? classes.state.data.filter((c) => c.access === 'OWNER') : [];
  const [classId, setClassId] = useState<string | null>(null);
  const selected = classId ?? owned[0]?.id ?? null;

  return (
    <section aria-labelledby="cohort-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="cohort-title" className="font-headline text-headline-md text-ink">
          Peta bagian sulit
        </h2>
        <p className="max-w-prose text-body-md text-ink-muted text-pretty">
          Berapa banyak siswa yang melewatkan tiap konsep, dihitung dari hasil cek terakhir setiap siswa. Nama siswa tidak ditampilkan di
          sini.
        </p>
      </div>

      {classes.state.status === 'loading' && <p className="text-body-md text-ink-muted">Memuat kelas...</p>}
      {classes.state.status === 'error' && <RetryAlert text="Daftar kelas gagal dimuat." onRetry={classes.reload} />}
      {classes.state.status === 'ready' && owned.length === 0 && (
        <p className="rounded-lg border border-line-soft bg-card px-5 py-4 text-body-md text-ink-muted">
          Buat kelas dulu. Petanya terisi setelah siswa di kelas itu mengecek catatan dari materi kelas.
        </p>
      )}
      {owned.length > 0 && selected && (
        <>
          {owned.length > 1 && (
            <div className="flex flex-col gap-1.5 sm:max-w-sm">
              <label htmlFor="cohort-class" className="text-label-lg text-ink">
                Kelas
              </label>
              <select id="cohort-class" value={selected} onChange={(e) => setClassId(e.target.value)} className={SELECT_CLASS}>
                {owned.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <MaterialPicker key={selected} classId={selected} />
        </>
      )}
    </section>
  );
}

function MaterialPicker({ classId }: { classId: string }) {
  const [state, setState] = useState<Load<CohortMaterial[]>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [materialId, setMaterialId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    governanceApi
      .cohortMaterials(classId, controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [classId, attempt]);

  if (state.status === 'loading') return <p className="text-body-md text-ink-muted">Memuat materi...</p>;
  if (state.status === 'error') return <RetryAlert text="Daftar materi gagal dimuat." onRetry={() => setAttempt((n) => n + 1)} />;
  if (state.data.length === 0) {
    return (
      <p className="rounded-lg border border-line-soft bg-card px-5 py-4 text-body-md text-ink-muted">
        Belum ada catatan yang dicek di kelas ini.
      </p>
    );
  }

  const selected = materialId ?? state.data[0]!.materialId;
  return (
    <div className="flex flex-col gap-4">
      {state.data.length > 1 && (
        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          <label htmlFor="cohort-material" className="text-label-lg text-ink">
            Materi
          </label>
          <select id="cohort-material" value={selected} onChange={(e) => setMaterialId(e.target.value)} className={SELECT_CLASS}>
            {state.data.map((m) => (
              <option key={m.materialId} value={m.materialId}>
                {m.title ?? 'Materi pribadi siswa'} ({m.studentCount} siswa)
              </option>
            ))}
          </select>
        </div>
      )}
      <CohortMap key={selected} classId={classId} materialId={selected} />
    </div>
  );
}

function CohortMap({ classId, materialId }: { classId: string; materialId: string }) {
  const [state, setState] = useState<Load<CohortBlindSpots>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    governanceApi
      .cohortBlindSpots(classId, materialId, controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [classId, materialId, attempt]);

  if (state.status === 'loading') return <p className="text-body-md text-ink-muted">Menghitung peta...</p>;
  if (state.status === 'error') return <RetryAlert text="Peta gagal dimuat." onRetry={() => setAttempt((n) => n + 1)} />;

  const map = state.data;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <div className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
        <h3 className="font-title text-title-lg text-ink">
          {map.material.title ?? 'Materi pribadi siswa'}
          <span className="block text-body-md font-normal text-ink-muted">{map.studentCount} siswa sudah dicek</span>
        </h3>
        {map.concepts.length === 0 ? (
          <p className="flex items-start gap-2 text-body-md text-ink">
            <Icon name="task_alt" className="mt-px text-[20px] text-teal" />
            Tidak ada konsep yang terlewat di hasil cek terakhir siswa.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {map.concepts.map((c, i) => (
              <li key={c.concept} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="flex items-center gap-2 text-body-lg text-ink">
                    {c.concept}
                    {c.importanceLevel && (
                      <span className={`rounded-full px-2.5 py-0.5 text-label-md ${IMPORTANCE[c.importanceLevel].className}`}>
                        {IMPORTANCE[c.importanceLevel].label}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-mono-md text-ink-muted tabular-nums">{conceptShareLabel(c, map.studentCount)}</span>
                </div>
                <span className="h-2 overflow-hidden rounded-full bg-wash">
                  <FillBar value={c.percent} delay={i * 0.05} className="bg-teal" />
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Recommendation map={map} />
    </div>
  );
}

function Recommendation({ map }: { map: CohortBlindSpots }) {
  if (map.recommendationStatus === 'NOT_ENOUGH_DATA') {
    return (
      <p className="rounded-lg border border-line-soft bg-card px-5 py-4 text-body-md text-ink-muted">
        {map.concepts.length === 0
          ? 'Saran perbaikan muncul kalau ada konsep yang terlewat.'
          : `Saran perbaikan muncul setelah minimal ${map.minStudentsForRecommendation} siswa mengecek catatan untuk materi ini.`}
      </p>
    );
  }
  if (map.recommendationStatus === 'UNAVAILABLE' || !map.recommendation) {
    return (
      <p className="rounded-lg border border-line-soft bg-card px-5 py-4 text-body-md text-ink-muted">
        Saran perbaikan sedang tidak bisa dibuat. Persentase per konsep tetap akurat. Buka lagi nanti untuk sarannya.
      </p>
    );
  }

  const rec = map.recommendation;
  return (
    <section aria-labelledby="cohort-rec-title" className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
      <h3 id="cohort-rec-title" className="flex items-center gap-2 font-title text-title-lg text-ink">
        <Icon name="lightbulb" className="text-teal" />
        Saran untuk pertemuan berikutnya
      </h3>
      {rec.sample && (
        <p className="rounded-md bg-wash px-4 py-3 text-body-sm text-ink">
          Contoh: server masih memakai AI tiruan, jadi saran di bawah ini teks tetap, belum dibaca dari data kelasmu. Persentase per konsep
          sudah asli.
        </p>
      )}
      <p className="text-body-md text-ink text-pretty">{rec.curriculumRecommendation}</p>
      <ul className="flex flex-col gap-3">
        {rec.clusters.map((cluster) => (
          <li key={cluster.label} className="flex flex-col gap-1 rounded-md bg-wash px-4 py-3">
            <span className="flex flex-wrap items-center gap-2 text-body-md font-semibold text-ink">
              {cluster.label}
              <span className={`rounded-full px-2.5 py-0.5 text-label-md font-normal ${IMPORTANCE[cluster.severity].className}`}>
                {IMPORTANCE[cluster.severity].label}
              </span>
            </span>
            <span className="text-body-sm text-ink-muted">Konsep: {cluster.memberConcepts.join(', ')}</span>
            <span className="text-body-md text-ink text-pretty">{cluster.remediationSuggestion}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
