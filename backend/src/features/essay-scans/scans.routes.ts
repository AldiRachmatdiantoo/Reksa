import { Router, type RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { getAuth, requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { requireRole } from '../../common/middlewares/rbac.middleware.js';
import { singleFileUpload } from '../../common/middlewares/upload.middleware.js';
import { getValidated, validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { ScansController } from './scans.controller.js';
import { SCAN_MAX_IMAGE_BYTES, ScanIdParamsSchema, UploadScanFieldsSchema } from './scans.schema.js';
import type { ScansService } from './scans.service.js';

export type ScansRouterDeps = {
  service: ScansService;
  signer: AccessTokenSigner;
  redis: Redis;
};

const HOUR = 60 * 60_000;

/**
 * POST /scans/upload       multipart `image` + tepat satu dari `sessionId` (login STUDENT) atau `qrToken` (HP tanpa login)
 *                          → 202 { submissionId, auditStatus: 'PENDING', quota }
 * GET  /scans/:id          STUDENT pemilik → { scan } (status audit, hasil saat DONE, signed URL foto)
 * POST /scans/:id/retry    STUDENT pemilik, setelah FAILED, maks. 2 kali → 202
 */
export function createScansRouter({ service, signer, redis }: ScansRouterDeps): Router {
  const router = Router();
  const controller = new ScansController(service);
  const student = [requireAuth(signer), requireRole('STUDENT')];

  /** `sessionId` wajib login sebagai STUDENT; `qrToken` sendiri sudah menjadi bukti dari laptop yang login. */
  const authUnlessQr: RequestHandler = (req, res, next) => {
    const { body } = getValidated(res, { body: UploadScanFieldsSchema });
    if (body.qrToken !== undefined) {
      next();
      return;
    }
    requireAuth(signer)(req, res, (err?: unknown) => (err ? next(err) : requireRole('STUDENT')(req, res, next)));
  };

  router.post(
    '/upload',
    // Sebelum multer: batasi per IP supaya unggahan tanpa login tidak bisa membanjiri memori.
    rateLimit({ redis, name: 'scans:upload:ip', limit: 30, windowMs: HOUR }),
    singleFileUpload({ field: 'image', maxBytes: SCAN_MAX_IMAGE_BYTES, maxFields: 2 }),
    validate({ body: UploadScanFieldsSchema }),
    authUnlessQr,
    controller.upload,
  );
  router.get('/:id', ...student, validate({ params: ScanIdParamsSchema }), controller.get);
  router.post(
    '/:id/retry',
    ...student,
    rateLimit({ redis, name: 'scans:retry', limit: 10, windowMs: HOUR, key: (req) => getAuth(req.res!).userId }),
    validate({ params: ScanIdParamsSchema }),
    controller.retry,
  );

  return router;
}
