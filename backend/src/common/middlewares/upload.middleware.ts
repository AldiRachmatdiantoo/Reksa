import type { RequestHandler } from 'express';
import multer from 'multer';
import { BadRequestError, PayloadTooLargeError } from '../errors/AppError.js';

export type SingleFileUploadOptions = {
  /** Nama field multipart untuk file, mis. `file` (materials) atau `image` (essay-scans). */
  field: string;
  maxBytes: number;
  /** Jumlah field teks yang boleh ikut. Field asing tetap ditolak skema Zod `.strict()`. */
  maxFields?: number;
};

/**
 * Menerima tepat satu file multipart ke memori (tidak pernah ke disk) dengan batas ketat.
 * Tipe file TIDAK dipercaya di sini: nama file dan Content-Type dari klien bisa dipalsukan,
 * jadi service wajib mengecek magic bytes (`file-type`) sebelum memakai isinya.
 */
export function singleFileUpload({ field, maxBytes, maxFields = 4 }: SingleFileUploadOptions): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: maxFields,
      fieldSize: 1024,
      parts: maxFields + 1,
      headerPairs: 50,
    },
  }).single(field);

  return (req, res, next) => {
    upload(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(new PayloadTooLargeError(`Ukuran file maksimal ${Math.floor(maxBytes / (1024 * 1024))} MB`));
          return;
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          next(new BadRequestError(`File harus dikirim di field "${field}", satu file saja`));
          return;
        }
        next(new BadRequestError('Form upload tidak valid'));
        return;
      }
      // multipart rusak (boundary salah, stream terputus): selalu 400, tanpa detail internal.
      next(new BadRequestError('Form upload tidak valid'));
    });
  };
}
