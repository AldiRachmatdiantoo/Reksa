import { z } from 'zod';

// Kontrak output AI. Setiap provider (mock maupun Gemini) WAJIB mengembalikan
// data yang lolos skema ini; output Gemini divalidasi ulang di sini (PRD §5.3).

// ---------- Stage 1: ekstraksi rubrik ----------
export const RubricKeyConceptSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,64}$/, 'id konsep harus slug huruf kecil'),
    concept: z.string().min(1).max(200),
    definition: z.string().min(1).max(1000),
    weight: z.number().int().min(1).max(5),
  })
  .strict();

export const RubricCausalRelationSchema = z
  .object({
    fromConceptId: z.string().min(1),
    toConceptId: z.string().min(1),
    relation: z.string().min(1).max(500),
  })
  .strict();

export const AiRubricOutputSchema = z
  .object({
    materialTitle: z.string().min(1).max(200),
    summary: z.string().min(1).max(2000),
    keyConcepts: z.array(RubricKeyConceptSchema).min(1).max(50),
    causalRelations: z.array(RubricCausalRelationSchema).max(100),
  })
  .strict()
  .superRefine((rubric, ctx) => {
    const ids = new Set<string>();
    rubric.keyConcepts.forEach((c, i) => {
      if (ids.has(c.id)) {
        ctx.addIssue({ code: 'custom', path: ['keyConcepts', i, 'id'], message: `id konsep duplikat: ${c.id}` });
      }
      ids.add(c.id);
    });
    rubric.causalRelations.forEach((r, i) => {
      for (const key of ['fromConceptId', 'toConceptId'] as const) {
        if (!ids.has(r[key])) {
          ctx.addIssue({
            code: 'custom',
            path: ['causalRelations', i, key],
            message: `merujuk konsep yang tidak ada: ${r[key]}`,
          });
        }
      }
    });
  });

export type AiRubricOutput = z.infer<typeof AiRubricOutputSchema>;

// ---------- Stage 2: audit esai tulisan tangan (PRD §8.2) ----------
export const ImportanceLevelSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

export const AiEssayAuditOutputSchema = z
  .object({
    actualScore: z.number().int().min(0).max(100),
    accurateConcepts: z.array(
      z
        .object({
          concept: z.string().min(1),
          evidenceFromHandwriting: z.string().min(1),
        })
        .strict(),
    ),
    blindSpots: z.array(
      z
        .object({
          concept: z.string().min(1),
          importanceLevel: ImportanceLevelSchema,
          explanation: z.string().min(1),
        })
        .strict(),
    ),
    logicCorrections: z.array(
      z
        .object({
          studentStatement: z.string().min(1),
          correction: z.string().min(1),
        })
        .strict(),
    ),
    encouragingSummary: z.string().min(1),
  })
  .strict();

export type AiEssayAuditOutput = z.infer<typeof AiEssayAuditOutputSchema>;
export type AiBlindSpot = AiEssayAuditOutput['blindSpots'][number];

// ---------- Stage 3: klasterisasi blind spots kelas ----------
export const AiCohortClusterOutputSchema = z
  .object({
    totalStudentsAnalyzed: z.number().int().min(0),
    clusters: z.array(
      z
        .object({
          label: z.string().min(1).max(200),
          memberConcepts: z.array(z.string().min(1)).min(1),
          affectedStudentCount: z.number().int().min(0),
          failureRatePercent: z.number().int().min(0).max(100),
          severity: ImportanceLevelSchema,
          remediationSuggestion: z.string().min(1).max(2000),
        })
        .strict(),
    ),
    curriculumRecommendation: z.string().min(1).max(4000),
  })
  .strict()
  .superRefine((out, ctx) => {
    out.clusters.forEach((c, i) => {
      if (c.affectedStudentCount > out.totalStudentsAnalyzed) {
        ctx.addIssue({
          code: 'custom',
          path: ['clusters', i, 'affectedStudentCount'],
          message: 'affectedStudentCount melebihi totalStudentsAnalyzed',
        });
      }
    });
  });

export type AiCohortClusterOutput = z.infer<typeof AiCohortClusterOutputSchema>;
