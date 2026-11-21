import { Router } from 'express';
import type { Redis } from 'ioredis';
import { getAuth, requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { requireRole } from '../../common/middlewares/rbac.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { SessionsController } from './sessions.controller.js';
import { SessionIdParamsSchema, StartSessionSchema, SubmitJolSchema } from './sessions.schema.js';
import type { SessionsService } from './sessions.service.js';

export type SessionsRouterDeps = {
  service: SessionsService;
  signer: AccessTokenSigner;
  redis: Redis;
};

const HOUR = 60 * 60_000;

/**
 * Semua endpoint khusus STUDENT dan hanya untuk sesi milik sendiri (milik orang lain dijawab 404).
 *
 * POST  /sessions              { materialId, preset, classId? } → 201; 409 ACTIVE_SESSION_EXISTS + details.activeSessionId
 * GET   /sessions/active       sesi aktif (FOCUS_ACTIVE / AWAITING_SCAN) atau null, untuk memulihkan timer
 * GET   /sessions/:id          detail sesi; status kedaluwarsa dihitung saat dibaca
 * PATCH /sessions/:id/jol      { predictedJolScore } mengakhiri fokus → AWAITING_SCAN
 * POST  /sessions/:id/cancel   membatalkan sesi aktif → EXPIRED
 * POST  /sessions/:id/qr-bridge          201 { qrToken, expiresInSec: 300 } untuk QR (FR-04); hanya saat AWAITING_SCAN
 * GET   /sessions/:id/qr-bridge/events   SSE untuk laptop: ready → uploaded {submissionId} | timeout
 */
export function createSessionsRouter({ service, signer, redis }: SessionsRouterDeps): Router {
  const router = Router();
  const controller = new SessionsController(service);

  router.use(requireAuth(signer), requireRole('STUDENT'));

  router.post(
    '/',
    rateLimit({ redis, name: 'sessions:start', limit: 30, windowMs: HOUR, key: (req) => getAuth(req.res!).userId }),
    validate({ body: StartSessionSchema }),
    controller.start,
  );
  router.get('/active', controller.getActive);
  router.get('/:id', validate({ params: SessionIdParamsSchema }), controller.get);
  router.patch('/:id/jol', validate({ params: SessionIdParamsSchema, body: SubmitJolSchema }), controller.submitJol);
  router.post('/:id/cancel', validate({ params: SessionIdParamsSchema }), controller.cancel);
  router.post(
    '/:id/qr-bridge',
    rateLimit({ redis, name: 'sessions:qr-bridge', limit: 20, windowMs: HOUR, key: (req) => getAuth(req.res!).userId }),
    validate({ params: SessionIdParamsSchema }),
    controller.issueQrBridge,
  );
  router.get(
    '/:id/qr-bridge/events',
    rateLimit({ redis, name: 'sessions:qr-events', limit: 60, windowMs: HOUR, key: (req) => getAuth(req.res!).userId }),
    validate({ params: SessionIdParamsSchema }),
    controller.qrBridgeEvents,
  );

  return router;
}
