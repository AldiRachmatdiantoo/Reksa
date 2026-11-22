import { z } from 'zod';

/** Preset Pomodoro (FR-01). Durasi fokus dalam detik, ditentukan server, bukan klien. */
export const POMODORO_PRESETS = {
  CLASSIC_25_5: { focusSec: 25 * 60, breakSec: 5 * 60 },
  DEEP_45_10: { focusSec: 45 * 60, breakSec: 10 * 60 },
  FOCUS_SPRINT_15_3: { focusSec: 15 * 60, breakSec: 3 * 60 },
} as const;

export const PomodoroPresetSchema = z.enum(['CLASSIC_25_5', 'DEEP_45_10', 'FOCUS_SPRINT_15_3']);

/** Latihan ulang H+3/H+7 (FR-06): fokus 5 menit, ditentukan server. */
export const REVIEW_FOCUS_SEC = 5 * 60;
/** Paling banyak 3 sesi latihan ulang per jadwal (termasuk yang dibatalkan atau kedaluwarsa), karena tanpa kuota. */
export const MAX_REVIEW_SESSIONS_PER_SCHEDULE = 3;

/** POST /sessions. `secondMaterialId` (F3 interleaving): materi kedua yang dicampur, wajib berbeda. */
export const StartSessionSchema = z
  .object({
    materialId: z.uuid(),
    preset: PomodoroPresetSchema,
    classId: z.uuid().optional(),
    secondMaterialId: z.uuid().optional(),
  })
  .strict()
  .refine((v) => v.secondMaterialId === undefined || v.secondMaterialId !== v.materialId, {
    path: ['secondMaterialId'],
    message: 'Materi kedua harus berbeda dari materi pertama',
  });

/** PATCH /sessions/:id/jol (FR-03) */
export const SubmitJolSchema = z
  .object({
    predictedJolScore: z.number().int().min(0).max(100),
  })
  .strict();

export const SessionIdParamsSchema = z.object({ id: z.uuid() }).strict();

export type StartSessionInput = z.infer<typeof StartSessionSchema>;
export type SubmitJolInput = z.infer<typeof SubmitJolSchema>;
export type PomodoroPreset = z.infer<typeof PomodoroPresetSchema>;

// ---------- Aturan sesi sah (PRD v1.3 FR-02) ----------
/** Fokus yang tidak diakhiri dalam durasi preset + 30 menit menjadi EXPIRED. */
export const FOCUS_GRACE_SEC = 30 * 60;
/** Durasi fokus aktual dibatasi paling lama durasi preset + 5 menit. */
export const FOCUS_OVERTIME_CAP_SEC = 5 * 60;
/** Foto wajib diunggah dalam 2 jam setelah tebakan JOL disimpan. */
export const SCAN_UPLOAD_WINDOW_SEC = 2 * 60 * 60;
/** Fokus aktual kurang dari rasio ini terhadap preset ditandai SHORT_FOCUS. */
export const SHORT_FOCUS_RATIO = 0.5;

export type SessionStatus = 'FOCUS_ACTIVE' | 'AWAITING_JOL' | 'AWAITING_SCAN' | 'COMPLETED' | 'EXPIRED';
export type SessionValidity = 'VALID' | 'SHORT_FOCUS';

/** Bentuk sesi di setiap respons /sessions. Semua waktu ISO 8601 UTC dari jam server. */
export type SessionView = {
  id: string;
  materialId: string;
  /** null bila materi tidak lagi bisa dibaca (mis. pelajar sudah keluar dari kelas pemilik materi). */
  materialTitle: string | null;
  /** F3 interleaving: materi kedua, null untuk sesi satu materi. Judul null bila tidak lagi bisa dibaca. */
  secondMaterialId: string | null;
  secondMaterialTitle: string | null;
  classId: string | null;
  sessionType: 'INITIAL_BLURTING' | 'SPACED_REVIEW';
  /** null untuk durasi di luar preset (mis. sesi SPACED_REVIEW nanti). */
  preset: PomodoroPreset | null;
  status: SessionStatus;
  validity: SessionValidity | null;
  plannedDurationSec: number;
  actualDurationSec: number | null;
  predictedJolScore: number | null;
  startedAt: string;
  /** Kapan timer fokus habis menurut server (startedAt + plannedDurationSec). */
  focusEndsAt: string;
  /** Batas akhir mengakhiri fokus sebelum sesi EXPIRED. */
  focusDeadlineAt: string;
  focusEndedAt: string | null;
  /** Batas unggah foto; hanya diisi saat AWAITING_SCAN dan foto belum masuk. */
  scanDeadlineAt: string | null;
  hasSubmission: boolean;
  /** Id hasil cek (GET /scans/:id) setelah foto diunggah. */
  submissionId: string | null;
  completedAt: string | null;
};
