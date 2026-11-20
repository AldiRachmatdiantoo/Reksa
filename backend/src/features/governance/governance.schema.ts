import { z } from 'zod';

export { AiCohortClusterOutputSchema, type AiCohortClusterOutput } from '../../common/ai/ai.schema.js';

export const ClassIdParamsSchema = z.object({ classId: z.uuid() }).strict();

/** GET /governance/classes/:classId/ledger (cursor pagination) */
export const LedgerQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/** GET /governance/classes/:classId/blind-spots */
export const BlindSpotsQuerySchema = z
  .object({
    materialId: z.uuid().optional(),
  })
  .strict();

export type LedgerQuery = z.infer<typeof LedgerQuerySchema>;
export type BlindSpotsQuery = z.infer<typeof BlindSpotsQuerySchema>;
