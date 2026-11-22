import { Router, type Request } from 'express';
import type { Redis } from 'ioredis';
import { getAuth, requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { ProController } from './pro.controller.js';
import { ActivateProSchema } from './pro.schema.js';
import type { ProService } from './pro.service.js';

export type ProRouterDeps = { service: ProService; signer: AccessTokenSigner; redis: Redis };

const HOUR = 60 * 60_000;
const byUser = (req: Request) => getAuth(req.res!).userId;

/**
 * Dipasang di bawah /me (FR-11):
 * POST /me/activate-pro   { code }; 10 percobaan per jam per user; wajib email terverifikasi
 */
export function createProRouter({ service, signer, redis }: ProRouterDeps): Router {
  const router = Router();
  const controller = new ProController(service);
  router.post(
    '/activate-pro',
    requireAuth(signer),
    rateLimit({ redis, name: 'me:activate-pro', limit: 10, windowMs: HOUR, key: byUser }),
    validate({ body: ActivateProSchema }),
    controller.activate,
  );
  return router;
}
