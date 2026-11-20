import { z } from 'zod';

/** Preset Pomodoro (FR-01). Durasi fokus dalam detik, ditentukan server, bukan klien. */
export const POMODORO_PRESETS = {
  CLASSIC_25_5: { focusSec: 25 * 60, breakSec: 5 * 60 },
  DEEP_45_10: { focusSec: 45 * 60, breakSec: 10 * 60 },
  FOCUS_SPRINT_15_3: { focusSec: 15 * 60, breakSec: 3 * 60 },
} as const;

export const PomodoroPresetSchema = z.enum(['CLASSIC_25_5', 'DEEP_45_10', 'FOCUS_SPRINT_15_3']);

/** POST /sessions */
export const StartSessionSchema = z
  .object({
    materialId: z.uuid(),
    preset: PomodoroPresetSchema,
    classId: z.uuid().optional(),
  })
  .strict();

/** PATCH /sessions/:id/jol (FR-03) */
export const SubmitJolSchema = z
  .object({
    predictedJolScore: z.number().int().min(0).max(100),
  })
  .strict();

export const SessionIdParamsSchema = z.object({ id: z.uuid() }).strict();

export type StartSessionInput = z.infer<typeof StartSessionSchema>;
export type SubmitJolInput = z.infer<typeof SubmitJolSchema>;
