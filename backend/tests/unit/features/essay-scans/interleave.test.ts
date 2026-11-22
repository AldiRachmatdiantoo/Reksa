import { describe, expect, it } from 'vitest';
import { AiRubricOutputSchema, type AiBlindSpot, type AiRubricOutput } from '../../../../src/common/ai/ai.schema.js';
import { MOCK_RUBRIC, MOCK_RUBRIC_FOTOSINTESIS } from '../../../../src/common/ai/mockAi.fixtures.js';
import { mergeRubrics, splitBlindSpots } from '../../../../src/features/essay-scans/interleave.js';
import { computeLedgerHash, type LedgerContent } from '../../../../src/features/essay-scans/ledgerHash.js';

/** Rubrik sintetis dengan n konsep; bobot konsep ke-i = (i % 5) + 1, relasi berantai. */
function rubric(title: string, n: number): AiRubricOutput {
  const keyConcepts = Array.from({ length: n }, (_, i) => ({
    id: `k-${i}`,
    concept: `${title} ${i}`,
    definition: `Definisi ${i}`,
    weight: (i % 5) + 1,
  }));
  const causalRelations = keyConcepts.slice(1).map((c, i) => ({ fromConceptId: `k-${i}`, toConceptId: c.id, relation: 'memicu' }));
  return { materialTitle: title, summary: `Ringkasan ${title}`, keyConcepts, causalRelations };
}

describe('mergeRubrics (F3 interleaving)', () => {
  it('combines both materials into one valid rubric with unique ids and relations that still point at the right concepts', () => {
    const merged = mergeRubrics(MOCK_RUBRIC, MOCK_RUBRIC_FOTOSINTESIS);

    expect(AiRubricOutputSchema.safeParse(merged).success).toBe(true);
    expect(merged.materialTitle).toBe(`${MOCK_RUBRIC.materialTitle} + ${MOCK_RUBRIC_FOTOSINTESIS.materialTitle}`);
    expect(merged.summary).toContain(MOCK_RUBRIC.summary);
    expect(merged.summary).toContain(MOCK_RUBRIC_FOTOSINTESIS.summary);
    expect(merged.keyConcepts.map((c) => c.concept)).toEqual([
      ...MOCK_RUBRIC.keyConcepts.map((c) => c.concept),
      ...MOCK_RUBRIC_FOTOSINTESIS.keyConcepts.map((c) => c.concept),
    ]);
    expect(merged.causalRelations).toHaveLength(MOCK_RUBRIC.causalRelations.length + MOCK_RUBRIC_FOTOSINTESIS.causalRelations.length);

    // Relasi pertama materi pertama tetap menghubungkan konsep yang sama, lewat id baru.
    const byId = new Map(merged.keyConcepts.map((c) => [c.id, c.concept]));
    const original = MOCK_RUBRIC.causalRelations[0]!;
    const conceptOf = (id: string) => MOCK_RUBRIC.keyConcepts.find((c) => c.id === id)!.concept;
    const remapped = merged.causalRelations[0]!;
    expect([byId.get(remapped.fromConceptId), byId.get(remapped.toConceptId)]).toEqual([
      conceptOf(original.fromConceptId),
      conceptOf(original.toConceptId),
    ]);
  });

  it('keeps the merged rubric within 50 concepts, splitting fairly and preferring heavier concepts', () => {
    const merged = mergeRubrics(rubric('A', 50), rubric('B', 50));
    expect(AiRubricOutputSchema.safeParse(merged).success).toBe(true);
    const fromA = merged.keyConcepts.filter((c) => c.concept.startsWith('A '));
    expect(fromA).toHaveLength(25);
    expect(merged.keyConcepts).toHaveLength(50);
    // 50 konsep dengan bobot 1..5 berulang: 25 terberat adalah semua bobot 5, 4, dan sebagian 3.
    expect(Math.min(...fromA.map((c) => c.weight))).toBeGreaterThanOrEqual(3);
    // Relasi yang salah satu ujungnya terbuang tidak ikut.
    const ids = new Set(merged.keyConcepts.map((c) => c.id));
    expect(merged.causalRelations.every((r) => ids.has(r.fromConceptId) && ids.has(r.toConceptId))).toBe(true);
  });

  it('gives a small material all of its concepts and the rest to the bigger one', () => {
    const merged = mergeRubrics(rubric('A', 48), rubric('B', 5));
    expect(merged.keyConcepts.filter((c) => c.concept.startsWith('B '))).toHaveLength(5);
    expect(merged.keyConcepts.filter((c) => c.concept.startsWith('A '))).toHaveLength(45);
  });

  it('stays inside the title and summary limits even for maximum-length inputs', () => {
    const long = { ...rubric('A', 3), materialTitle: 'a'.repeat(200), summary: 's'.repeat(2000) };
    const merged = mergeRubrics(long, { ...long, materialTitle: 'b'.repeat(200) });
    expect(AiRubricOutputSchema.safeParse(merged).success).toBe(true);
  });
});

describe('splitBlindSpots', () => {
  const spot = (concept: string): AiBlindSpot => ({ concept, importanceLevel: 'HIGH', explanation: 'x' });

  it('sends each missed concept back to the material it came from, case-insensitively', () => {
    const split = splitBlindSpots([spot('reseptor'), spot('KLOROFIL'), spot('Konsep asing')], MOCK_RUBRIC, MOCK_RUBRIC_FOTOSINTESIS);
    expect(split.first.map((s) => s.concept)).toEqual(['reseptor', 'Konsep asing']);
    expect(split.second.map((s) => s.concept)).toEqual(['KLOROFIL']);
  });
});

describe('computeLedgerHash with a second material', () => {
  const content: LedgerContent = {
    submissionId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    materialId: '44444444-4444-4444-8444-444444444444',
    startedAt: new Date('2026-11-22T10:00:00Z'),
    focusEndedAt: new Date('2026-11-22T10:25:00Z'),
    actualDurationSec: 1500,
    validity: 'VALID',
    predictedJolScore: 70,
    actualScore: 65,
    imageStorageKey: 'scans/u/x.webp',
    submittedAt: new Date('2026-11-22T10:30:00Z'),
    auditedAt: new Date('2026-11-22T10:31:00Z'),
  };

  it('leaves single-material hashes exactly as before, and locks the second material when there is one', () => {
    const single = computeLedgerHash(content);
    expect(computeLedgerHash({ ...content, secondMaterialId: null })).toBe(single);
    const mixed = computeLedgerHash({ ...content, secondMaterialId: '55555555-5555-4555-8555-555555555555' });
    expect(mixed).not.toBe(single);
    expect(computeLedgerHash({ ...content, secondMaterialId: '66666666-6666-4666-8666-666666666666' })).not.toBe(mixed);
  });
});
