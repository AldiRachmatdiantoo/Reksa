import { Router, type Request } from 'express';
import type { Redis } from 'ioredis';
import { getAuth, requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { PrivacyController } from './privacy.controller.js';
import { DeleteAccountSchema, EmptyBodySchema } from './privacy.schema.js';
import type { PrivacyService } from './privacy.service.js';

export type PrivacyRouterDeps = { service: PrivacyService; signer: AccessTokenSigner; redis: Redis };

const MINUTE = 60_000;
const byUser = (req: Request) => getAuth(req.res!).userId;

/**
 * Dipasang di bawah /me (FR-13):
 * POST   /me/export   arsip data pribadi (ZIP) lewat signed URL 300 detik; 1 kali per 24 jam (dicek di DB)
 * DELETE /me          { password }; menghapus akun dan seluruh datanya, cookie dihapus
 */
export function createPrivacyRouter({ service, signer, redis }: PrivacyRouterDeps): Router {
  const router = Router();
  const controller = new PrivacyController(service);

  router.post(
    '/export',
    requireAuth(signer),
    // Lapisan cepat sebelum batas harian di database; mencegah banjir permintaan berat.
    rateLimit({ redis, name: 'me:export', limit: 3, windowMs: 60 * MINUTE, key: byUser }),
    validate({ body: EmptyBodySchema }),
    controller.exportAccount,
  );

  router.delete(
    '/',
    requireAuth(signer),
    rateLimit({ redis, name: 'me:delete', limit: 5, windowMs: 15 * MINUTE, key: byUser }),
    validate({ body: DeleteAccountSchema }),
    controller.deleteAccount,
  );

  return router;
}
