import type { AiBlindSpot, AiRubricOutput } from '../../common/ai/ai.schema.js';

/** Batas skema rubrik (ai.schema.ts): rubrik gabungan tetap harus lolos AiRubricOutputSchema. */
const MAX_CONCEPTS = 50;
const MAX_RELATIONS = 100;
const MAX_TITLE = 200;
const MAX_SUMMARY = 2000;
const SEPARATOR = '\n\n';

/**
 * F3 interleaving: rubrik untuk sesi dua materi. Id konsep diganti menjadi `m1-c0`, `m2-c3`, dst. supaya
 * tidak bentrok antarmateri. Bila total konsep melebihi 50, tiap materi mendapat jatah setara (konsep
 * berbobot tertinggi lebih dulu), sisa jatah satu materi dipakai materi lain. Relasi sebab-akibat hanya
 * dipertahankan bila kedua ujungnya ikut terpilih.
 */
export function mergeRubrics(first: AiRubricOutput, second: AiRubricOutput): AiRubricOutput {
  const half = MAX_CONCEPTS / 2;
  const takeFirst = Math.min(first.keyConcepts.length, Math.max(half, MAX_CONCEPTS - second.keyConcepts.length));
  const takeSecond = Math.min(second.keyConcepts.length, MAX_CONCEPTS - takeFirst);

  const parts = [
    { rubric: first, take: takeFirst, prefix: 'm1' },
    { rubric: second, take: takeSecond, prefix: 'm2' },
  ].map(({ rubric, take, prefix }) => {
    const kept = topByWeight(rubric.keyConcepts, take);
    const ids = new Map(kept.map((c, i) => [c.id, `${prefix}-c${i}`]));
    return {
      concepts: kept.map((c) => ({ ...c, id: ids.get(c.id)! })),
      relations: rubric.causalRelations
        .filter((r) => ids.has(r.fromConceptId) && ids.has(r.toConceptId))
        .map((r) => ({ ...r, fromConceptId: ids.get(r.fromConceptId)!, toConceptId: ids.get(r.toConceptId)! })),
    };
  });

  const perSummary = Math.floor((MAX_SUMMARY - SEPARATOR.length) / 2);
  return {
    materialTitle: `${first.materialTitle} + ${second.materialTitle}`.slice(0, MAX_TITLE),
    summary: [first.summary.slice(0, perSummary), second.summary.slice(0, perSummary)].join(SEPARATOR),
    keyConcepts: parts.flatMap((p) => p.concepts),
    causalRelations: parts.flatMap((p) => p.relations).slice(0, MAX_RELATIONS),
  };
}

/** Konsep berbobot tertinggi lebih dulu; urutan asli dipertahankan untuk bobot yang sama. */
function topByWeight<T extends { weight: number }>(items: T[], take: number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.weight - a.item.weight || a.index - b.index)
    .slice(0, take)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.item);
}

/**
 * Membagi bagian yang terlewat ke materi asalnya, dicocokkan lewat nama konsep di rubrik masing-masing
 * (tanpa beda huruf besar/kecil). Konsep yang tidak dikenali kedua rubrik masuk ke materi pertama, supaya
 * tetap terjadwal ulang. Hasil kosong untuk satu materi berarti materi itu tidak perlu dijadwalkan.
 */
export function splitBlindSpots(
  blindSpots: AiBlindSpot[],
  first: AiRubricOutput,
  second: AiRubricOutput,
): { first: AiBlindSpot[]; second: AiBlindSpot[] } {
  const names = (r: AiRubricOutput) => new Set(r.keyConcepts.map((c) => normalize(c.concept)));
  const firstNames = names(first);
  const secondNames = names(second);
  const result = { first: [] as AiBlindSpot[], second: [] as AiBlindSpot[] };
  for (const spot of blindSpots) {
    const key = normalize(spot.concept);
    if (secondNames.has(key) && !firstNames.has(key)) result.second.push(spot);
    else result.first.push(spot);
  }
  return result;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}
