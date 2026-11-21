import { z } from 'zod';
import type { AiRubricOutput } from '../../common/ai/ai.schema.js';

export const MATERIAL_MAX_TEXT_CHARS = 15_000;
export const MATERIAL_MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Teks hasil ekstraksi PDF boleh lebih panjang dari input teks; di atas ini minta user memecah per bab. */
export const MATERIAL_MAX_PDF_TEXT_CHARS = 100_000;
/** Di bawah ini PDF dianggap tidak berisi teks (mis. hasil scan foto). */
export const MATERIAL_MIN_TEXT_CHARS = 40;
export const MATERIAL_LIST_LIMIT = 50;

/** POST /materials dengan body JSON (materi teks mentah). */
export const CreateTextMaterialSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(MATERIAL_MAX_TEXT_CHARS),
    classId: z.uuid().optional(),
  })
  .strict();

/**
 * POST /materials dengan multipart/form-data (file PDF di field `file`).
 * Skema ini hanya untuk field teksnya; file divalidasi terpisah (ukuran + magic bytes).
 */
export const CreatePdfMaterialFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    classId: z.uuid().optional(),
  })
  .strict();

export const MaterialIdParamsSchema = z.object({ id: z.uuid() }).strict();

export type CreateTextMaterialInput = z.infer<typeof CreateTextMaterialSchema>;
export type CreatePdfMaterialFields = z.infer<typeof CreatePdfMaterialFieldsSchema>;

// ---------- Bentuk respons (PRD §8.3) ----------
export type MaterialSource = 'TEXT' | 'PDF';

/** GET /materials/:id dan respons POST /materials. */
export type MaterialView = {
  id: string;
  title: string;
  classId: string | null;
  source: MaterialSource;
  createdAt: string;
  rubric: AiRubricOutput;
};

/** Satu baris di GET /materials. */
export type MaterialSummaryView = {
  id: string;
  title: string;
  classId: string | null;
  source: MaterialSource;
  createdAt: string;
  conceptCount: number;
};
