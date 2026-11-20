import { Router } from 'express';
import type { Redis } from 'ioredis';
import { requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { AuthController } from './auth.controller.js';
import { LoginSchema, RegisterSchema } from './auth.schema.js';
import type { AuthService } from './auth.service.js';

export type AuthRouterDeps = {
  service: AuthService;
  signer: AccessTokenSigner;
  redis: Redis;
};

const MINUTE = 60_000;

/**
 * POST   /auth/register  publik, 10/jam per IP
 * POST   /auth/login     publik, 5/menit per IP (PRD §9.1)
 * POST   /auth/refresh   cookie refresh, rotasi + deteksi reuse
 * DELETE /auth/refresh   logout (path sama agar cookie refresh ikut terkirim)
 * GET    /auth/me        butuh access token
 */
export function createAuthRouter({ service, signer, redis }: AuthRouterDeps): Router {
  const router = Router();
  const controller = new AuthController(service);

  router.post(
    '/register',
    rateLimit({ redis, name: 'auth:register', limit: 10, windowMs: 60 * MINUTE }),
    validate({ body: RegisterSchema }),
    controller.register,
  );

  router.post(
    '/login',
    rateLimit({ redis, name: 'auth:login', limit: 5, windowMs: MINUTE }),
    validate({ body: LoginSchema }),
    controller.login,
  );

  router.post('/refresh', rateLimit({ redis, name: 'auth:refresh', limit: 30, windowMs: MINUTE }), controller.refresh);

  router.delete('/refresh', rateLimit({ redis, name: 'auth:logout', limit: 30, windowMs: MINUTE }), controller.logout);

  router.get('/me', requireAuth(signer), controller.me);

  return router;
}
