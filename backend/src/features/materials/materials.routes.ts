import { Router, type RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { UnsupportedMediaTypeError } from '../../common/errors/AppError.js';
import { getAuth, requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { singleFileUpload } from '../../common/middlewares/upload.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { MaterialsController } from './materials.controller.js';
import {
  CreatePdfMaterialFieldsSchema,
  CreateTextMaterialSchema,
  MATERIAL_MAX_PDF_BYTES,
  MaterialIdParamsSchema,
} from './materials.schema.js';
import type { MaterialsService } from './materials.service.js';

export type MaterialsRouterDeps = {
  service: MaterialsService;
  signer: AccessTokenSigner;
  redis: Redis;
};

const HOUR = 60 * 60_000;

/**
 * POST   /materials           JSON (teks) atau multipart (PDF di field `file`); 20/jam per user
 * GET    /materials           materi milik user, terbaru dulu (maks 50)
 * GET    /materials/:id       detail + rubrik
 * GET    /materials/:id/file  signed URL PDF asli (300 detik)
 * DELETE /materials/:id       hapus materi yang belum dipakai sesi
 *
 * Semua endpoint butuh login; kepemilikan dicek di service + repository (bukan di sini).
 */
export function createMaterialsRouter({ service, signer, redis }: MaterialsRouterDeps): Router {
  const router = Router();
  const controller = new MaterialsController(service);

  router.use(requireAuth(signer));

  const jsonCreate = [validate({ body: CreateTextMaterialSchema }), controller.createText];
  const pdfCreate = [
    singleFileUpload({ field: 'file', maxBytes: MATERIAL_MAX_PDF_BYTES, maxFields: 2 }),
    validate({ body: CreatePdfMaterialFieldsSchema }),
    controller.createPdf,
  ];

  // Satu endpoint, dua bentuk body (PRD §8.3). Content-Type lain ditolak.
  const dispatchByContentType: RequestHandler = (req, res, next) => {
    const chain = req.is('application/json') ? jsonCreate : req.is('multipart/form-data') ? pdfCreate : null;
    if (!chain) {
      next(new UnsupportedMediaTypeError('Kirim JSON untuk materi teks atau multipart/form-data untuk PDF'));
      return;
    }
    runChain(chain, req, res, next);
  };

  router.post(
    '/',
    // Ekstraksi rubrik memakai kuota AI: dibatasi per user, bukan per IP (satu kelas bisa berbagi IP sekolah).
    rateLimit({ redis, name: 'materials:create', limit: 20, windowMs: HOUR, key: (req) => getAuth(req.res!).userId }),
    dispatchByContentType,
  );
  router.get('/', controller.list);
  router.get('/:id', validate({ params: MaterialIdParamsSchema }), controller.get);
  router.get('/:id/file', validate({ params: MaterialIdParamsSchema }), controller.fileUrl);
  router.delete('/:id', validate({ params: MaterialIdParamsSchema }), controller.delete);

  return router;
}

/** Menjalankan beberapa handler berurutan; error (sync/async) diteruskan ke error handler Express. */
function runChain(handlers: RequestHandler[], ...[req, res, next]: Parameters<RequestHandler>): void {
  const step = (i: number) => (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    const handler = handlers[i];
    if (!handler) {
      next();
      return;
    }
    try {
      const result = handler(req, res, step(i + 1)) as unknown;
      if (result instanceof Promise) result.catch(next);
    } catch (e) {
      next(e);
    }
  };
  step(0)();
}
