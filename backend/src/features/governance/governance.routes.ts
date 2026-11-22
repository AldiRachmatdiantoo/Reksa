import { Router } from 'express';
import type { Redis } from 'ioredis';
import { getAuth, requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { requireRole } from '../../common/middlewares/rbac.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { GovernanceController } from './governance.controller.js';
import { ClassIdParamsSchema, LedgerHashParamsSchema, LedgerQuerySchema } from './governance.schema.js';
import type { GovernanceService } from './governance.service.js';

export type GovernanceRouterDeps = { service: GovernanceService; signer: AccessTokenSigner; redis: Redis };

const MINUTE = 60_000;

/**
 * GET /governance/classes/:classId/ledger?cursor=&limit=&studentId=
 *     EDUCATOR pemilik kelas; pengumpulan DONE + signed URL foto (FR-07). Kelas lain: 404.
 */
export function createGovernanceRouter({ service, signer, redis }: GovernanceRouterDeps): Router {
  const router = Router();
  const controller = new GovernanceController(service);

  router.use(requireAuth(signer), requireRole('EDUCATOR'));
  router.get(
    '/classes/:classId/ledger',
    // Setiap halaman membuat signed URL foto: dibatasi supaya tidak dipakai untuk menyedot foto.
    rateLimit({ redis, name: 'governance:ledger', limit: 120, windowMs: MINUTE, key: (req) => getAuth(req.res!).userId }),
    validate({ params: ClassIdParamsSchema, query: LedgerQuerySchema }),
    controller.ledger,
  );
  return router;
}

/**
 * GET /ledger/verify/:hash   publik, 30/menit per IP. Hanya { valid, sessionDate }: tanpa nama, skor, atau foto.
 */
export function createLedgerRouter({ service, redis }: Omit<GovernanceRouterDeps, 'signer'>): Router {
  const router = Router();
  const controller = new GovernanceController(service);

  router.get(
    '/verify/:hash',
    rateLimit({ redis, name: 'ledger:verify', limit: 30, windowMs: MINUTE }),
    validate({ params: LedgerHashParamsSchema }),
    controller.verify,
  );
  return router;
}
