import { z } from 'zod';

export const SPACED_INTERVAL_DAYS = [3, 7] as const;

/** GET /spaced/due */
export const DueSchedulesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

/** POST /spaced/:id/complete */
export const ScheduleIdParamsSchema = z.object({ id: z.uuid() }).strict();

export const EmptyBodySchema = z.object({}).strict().default({});

export type DueSchedulesQuery = z.infer<typeof DueSchedulesQuerySchema>;

export type ScheduleBlindSpot = { concept: string; importanceLevel: string | null; explanation: string | null };

export type ScheduleItem = {
  id: string;
  materialId: string;
  /** null jika materinya sudah tidak bisa dibaca (mis. siswa keluar dari kelas pemilik materi). */
  materialTitle: string | null;
  originSubmissionId: string;
  intervalDay: number;
  nextReviewAt: string;
  isCompleted: boolean;
  blindSpots: ScheduleBlindSpot[];
};
