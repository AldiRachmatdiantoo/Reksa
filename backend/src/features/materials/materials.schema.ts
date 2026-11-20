import { z } from 'zod';

export const MATERIAL_MAX_TEXT_CHARS = 15_000;
export const MATERIAL_MAX_PDF_BYTES = 10 * 1024 * 1024;

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
