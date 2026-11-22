import { Router } from 'express';
import { requireAuth } from '../../common/middlewares/auth.middleware.js';
import { requireRole } from '../../common/middlewares/rbac.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { HistoryController } from './history.controller.js';
import { EmptyQuerySchema, HistoryQuerySchema } from './history.schema.js';
import type { HistoryService } from './history.service.js';

export type HistoryRouterDeps = { service: HistoryService; signer: AccessTokenSigner };

/**
 * GET /history?cursor=&limit=   riwayat hasil cek milik pelajar, terbaru dulu (FR-05)
 * GET /history/calibration      tren selisih tebakan dan skor AI, khusus Pro (FR-11)
 */
export function createHistoryRouter({ service, signer }: HistoryRouterDeps): Router {
  const router = Router();
  const controller = new HistoryController(service);
  router.use(requireAuth(signer), requireRole('STUDENT'));
  router.get('/', validate({ query: HistoryQuerySchema }), controller.list);
  router.get('/calibration', validate({ query: EmptyQuerySchema }), controller.calibration);
  return router;
}
