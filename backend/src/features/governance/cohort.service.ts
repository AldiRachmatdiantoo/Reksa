import { createHash } from 'node:crypto';
import type { IAiService } from '../../common/ai/ai.provider.interface.js';
import type { AiBlindSpot } from '../../common/ai/ai.schema.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import { parseBlindSpots } from '../spaced-repetition/spaced.service.js';
import type { CohortRecommendationCache } from './cohortCache.js';
import type { CohortRow, GovernanceRepository } from './governance.repository.js';
import type { CohortBlindSpots, CohortConcept, CohortMaterial, CohortRecommendation, ImportanceLevel } from './governance.schema.js';

export type CohortServiceDeps = {
  repo: Pick<GovernanceRepository, 'isClassOwner' | 'listCohortRows' | 'materialTitles'>;
  ai: Pick<IAiService, 'clusterCohortBlindSpots'>;
  cache: CohortRecommendationCache;
  /** true saat AI_PROVIDER_MODE=mock: saran ditandai contoh supaya guru tidak mengira itu hasil membaca kelasnya. */
  aiIsSample: boolean;
  onWarning?: (message: string, meta?: Record<string, unknown>) => void;
};

/** Saran AI baru diminta mulai 3 siswa: di bawah itu polanya belum berarti dan terlalu mudah ditebak siapa. */
export const MIN_STUDENTS_FOR_RECOMMENDATION = 3;

const CLASS_NOT_FOUND = 'Kelas tidak ditemukan';
const RANK: Record<ImportanceLevel, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

function isImportance(value: string | null): value is ImportanceLevel {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW';
}

function conceptKey(concept: string): string {
  return concept.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
}

/** Hasil cek terakhir setiap siswa per materi. Baris dari repository sudah urut terbaru dulu. */
function latestPerStudent(rows: CohortRow[]): CohortRow[] {
  const seen = new Set<string>();
  const out: CohortRow[] = [];
  for (const row of rows) {
    const key = `${row.userId}:${row.materialId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** FR-08: peta bagian sulit satu kelas dan saran perbaikan bahan ajar dari IAiService (Stage 3). */
export class CohortService {
  constructor(private readonly deps: CohortServiceDeps) {}

  async materials(educatorId: string, classId: string): Promise<CohortMaterial[]> {
    await this.assertOwner(educatorId, classId);
    const latest = latestPerStudent(await this.deps.repo.listCohortRows(educatorId, classId));
    const byMaterial = new Map<string, { students: Set<string>; last: Date }>();
    for (const row of latest) {
      const entry = byMaterial.get(row.materialId) ?? { students: new Set<string>(), last: row.auditedAt };
      entry.students.add(row.userId);
      if (row.auditedAt > entry.last) entry.last = row.auditedAt;
      byMaterial.set(row.materialId, entry);
    }
    const titles = await this.deps.repo.materialTitles(educatorId, [...byMaterial.keys()]);
    return [...byMaterial.entries()]
      .map(([materialId, e]) => ({
        materialId,
        title: titles.get(materialId) ?? null,
        studentCount: e.students.size,
        lastAuditedAt: e.last.toISOString(),
      }))
      .sort((a, b) => b.lastAuditedAt.localeCompare(a.lastAuditedAt));
  }

  async blindSpots(educatorId: string, classId: string, materialId: string): Promise<CohortBlindSpots> {
    await this.assertOwner(educatorId, classId);
    const latest = latestPerStudent(await this.deps.repo.listCohortRows(educatorId, classId, materialId));
    // Materi tanpa hasil cek di kelas ini dijawab sama dengan materi yang tidak ada.
    if (latest.length === 0) throw new NotFoundError('Belum ada hasil cek untuk materi ini di kelas ini');

    const perStudent = latest.map((row) => parseBlindSpots(row.blindSpotsJson));
    const concepts = this.aggregate(perStudent, latest.length);
    const titles = await this.deps.repo.materialTitles(educatorId, [materialId]);

    const base = {
      material: { id: materialId, title: titles.get(materialId) ?? null },
      studentCount: latest.length,
      concepts,
      minStudentsForRecommendation: MIN_STUDENTS_FOR_RECOMMENDATION,
    };
    if (latest.length < MIN_STUDENTS_FOR_RECOMMENDATION || concepts.length === 0) {
      return { ...base, recommendationStatus: 'NOT_ENOUGH_DATA', recommendation: null };
    }
    const recommendation = await this.recommend(perStudent);
    return recommendation
      ? { ...base, recommendationStatus: 'READY', recommendation }
      : { ...base, recommendationStatus: 'UNAVAILABLE', recommendation: null };
  }

  private async assertOwner(educatorId: string, classId: string) {
    // Kelas milik pengajar lain dijawab sama seperti kelas yang tidak ada (anti-IDOR).
    if (!(await this.deps.repo.isClassOwner(educatorId, classId))) throw new NotFoundError(CLASS_NOT_FOUND);
  }

  private aggregate(perStudent: ReturnType<typeof parseBlindSpots>[], studentCount: number): CohortConcept[] {
    const groups = new Map<string, { spellings: Map<string, number>; students: number; level: ImportanceLevel | null }>();
    for (const spots of perStudent) {
      // Satu siswa dihitung sekali per konsep, walau AI menuliskannya dua kali.
      const counted = new Set<string>();
      for (const spot of spots) {
        const key = conceptKey(spot.concept);
        const group = groups.get(key) ?? { spellings: new Map<string, number>(), students: 0, level: null };
        const spelling = spot.concept.trim().replace(/\s+/g, ' ');
        group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
        if (isImportance(spot.importanceLevel) && (group.level === null || RANK[spot.importanceLevel] > RANK[group.level])) {
          group.level = spot.importanceLevel;
        }
        if (!counted.has(key)) {
          counted.add(key);
          group.students += 1;
        }
        groups.set(key, group);
      }
    }
    return [...groups.values()]
      .map((g) => {
        // Ejaan yang paling sering dipakai AI menjadi label; kalau seri, yang berawalan huruf kapital.
        const capitalized = (text: string) => (text[0] !== text[0]!.toLocaleLowerCase('id-ID') ? 1 : 0);
        const concept = [...g.spellings.entries()].sort(
          (a, b) => b[1] - a[1] || capitalized(b[0]) - capitalized(a[0]) || a[0].localeCompare(b[0], 'id-ID'),
        )[0]![0];
        return { concept, studentCount: g.students, percent: Math.round((g.students / studentCount) * 100), importanceLevel: g.level };
      })
      .sort((a, b) => b.studentCount - a.studentCount || a.concept.localeCompare(b.concept, 'id-ID'));
  }

  private async recommend(perStudent: ReturnType<typeof parseBlindSpots>[]): Promise<CohortRecommendation | null> {
    // Hanya konsep, tingkat, dan penjelasan yang dikirim ke AI: tanpa nama, id, atau skor siswa.
    const input: AiBlindSpot[][] = perStudent
      .map((spots) =>
        spots.map((s) => ({
          concept: s.concept.trim(),
          importanceLevel: isImportance(s.importanceLevel) ? s.importanceLevel : 'MEDIUM',
          explanation: s.explanation?.trim() || s.concept.trim(),
        })),
      )
      .filter((spots) => spots.length > 0);
    const key = createHash('sha256')
      .update(JSON.stringify(input.map((spots) => spots.map((s) => [conceptKey(s.concept), s.importanceLevel]).sort()).sort()))
      .digest('hex');

    let output = await this.deps.cache.get(key);
    if (!output) {
      try {
        output = await this.deps.ai.clusterCohortBlindSpots(input);
      } catch (err) {
        this.deps.onWarning?.('Saran peta bagian sulit gagal dibuat', { err });
        return null;
      }
      await this.deps.cache.set(key, output);
    }
    // Angka dari AI tidak ditampilkan: persentase per konsep dihitung sendiri dari data kelas.
    return {
      sample: this.deps.aiIsSample,
      clusters: output.clusters.map((c) => ({
        label: c.label,
        memberConcepts: c.memberConcepts,
        severity: c.severity,
        remediationSuggestion: c.remediationSuggestion,
      })),
      curriculumRecommendation: output.curriculumRecommendation,
    };
  }
}
