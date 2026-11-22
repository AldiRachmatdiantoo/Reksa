import { z } from 'zod';

/** GET /history?cursor=&limit= */
export const HistoryQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

/** GET /history/calibration tidak menerima query. */
export const EmptyQuerySchema = z.object({}).strict();

export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

export type HistoryItem = {
  submissionId: string;
  sessionId: string;
  sessionType: 'INITIAL_BLURTING' | 'SPACED_REVIEW';
  /** null jika materinya sudah tidak bisa dibaca. */
  materialTitle: string | null;
  startedAt: string;
  actualDurationSec: number | null;
  validity: string;
  predictedJolScore: number;
  auditStatus: string;
  actualScore: number | null;
  /** Selisih mutlak tebakan dan skor AI, sama seperti ScanView. */
  jolDelta: number | null;
  blindSpotCount: number;
  createdAt: string;
};

export type CalibrationPoint = { submissionId: string; auditedAt: string; predicted: number; actual: number; gap: number };

export type CalibrationTrend = {
  points: CalibrationPoint[];
  summary: { count: number; meanAbsGap: number | null; meanSignedGap: number | null };
};
