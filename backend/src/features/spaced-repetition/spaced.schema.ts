import { z } from 'zod';

export const SPACED_INTERVAL_DAYS = [3, 7] as const;

/** GET /spaced/due */
export const DueSchedulesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type DueSchedulesQuery = z.infer<typeof DueSchedulesQuerySchema>;
