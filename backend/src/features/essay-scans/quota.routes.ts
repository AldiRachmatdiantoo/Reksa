import { Router } from 'express';
import { requireAuth } from '../../common/middlewares/auth.middleware.js';
import { requireRole } from '../../common/middlewares/rbac.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { QuotaController } from './quota.controller.js';
import type { QuotaService } from './quota.service.js';

export type QuotaRouterDeps = { service: QuotaService; signer: AccessTokenSigner };

/**
 * GET /me/quota (STUDENT) → { quota: { tier, used, limit, remaining, resetAt } } (PRD FR-11).
 * Dipasang di container sebagai entri '/me/quota' tersendiri, jadi router `/me` milik `auth` tidak diubah.
 */
export function createQuotaRouter({ service, signer }: QuotaRouterDeps): Router {
  const router = Router();
  const controller = new QuotaController(service);
  router.get('/', requireAuth(signer), requireRole('STUDENT'), controller.get);
  return router;
}
