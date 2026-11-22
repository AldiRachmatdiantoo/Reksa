import { Router } from 'express';
import type { Redis } from 'ioredis';
import { getAuth, requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { requireRole } from '../../common/middlewares/rbac.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { SpacedController } from './spaced.controller.js';
import { DueSchedulesQuerySchema, EmptyBodySchema, ScheduleIdParamsSchema } from './spaced.schema.js';
import type { SpacedService } from './spaced.service.js';

export type SpacedRouterDeps = { service: SpacedService; signer: AccessTokenSigner; redis: Redis };

/**
 * GET  /spaced/due?limit=      latihan ulang jatuh tempo + 10 jadwal berikutnya (FR-06)
 * POST /spaced/:id/start       mulai sesi SPACED_REVIEW 5 menit (dinilai AI, tanpa kuota); 404/409 seperti complete
 * POST /spaced/:id/complete    tandai selesai; 404 jika bukan milik user, 409 jika belum jatuh tempo
 */
export function createSpacedRouter({ service, signer, redis }: SpacedRouterDeps): Router {
  const router = Router();
  const controller = new SpacedController(service);

  router.use(requireAuth(signer), requireRole('STUDENT'));
  router.get('/due', validate({ query: DueSchedulesQuerySchema }), controller.due);
  router.post(
    '/:id/start',
    rateLimit({ redis, name: 'spaced:start', limit: 20, windowMs: 60 * 60_000, key: (req) => getAuth(req.res!).userId }),
    validate({ params: ScheduleIdParamsSchema, body: EmptyBodySchema }),
    controller.start,
  );
  router.post(
    '/:id/complete',
    rateLimit({ redis, name: 'spaced:complete', limit: 60, windowMs: 60 * 60_000, key: (req) => getAuth(req.res!).userId }),
    validate({ params: ScheduleIdParamsSchema, body: EmptyBodySchema }),
    controller.complete,
  );
  return router;
}
