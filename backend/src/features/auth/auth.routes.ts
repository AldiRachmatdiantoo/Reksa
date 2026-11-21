import { createHash } from 'node:crypto';
import { Router, type Request } from 'express';
import type { Redis } from 'ioredis';
import { getAuth, requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { AuthController } from './auth.controller.js';
import {
  ChangePasswordSchema,
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  UpdateProfileSchema,
  VerifyEmailSchema,
} from './auth.schema.js';
import type { AuthService } from './auth.service.js';

export type AuthRouterDeps = {
  service: AuthService;
  signer: AccessTokenSigner;
  redis: Redis;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const byUser = (req: Request) => getAuth(req.res!).userId;

/**
 * Kunci rate limit per email. Body belum divalidasi di titik ini, jadi dinormalkan seperti EmailSchema
 * lalu di-hash: alamat email tidak tersimpan di nama kunci Redis.
 */
const byEmail = (req: Request) => {
  const raw: unknown = (req.body as { email?: unknown } | undefined)?.email;
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return createHash('sha256').update(normalized).digest('hex');
};

/**
 * POST   /auth/register                publik, 10/jam per IP; mengirim email verifikasi
 * POST   /auth/login                   publik, 5/menit per IP (PRD §9.1)
 * POST   /auth/refresh                 cookie refresh, rotasi + deteksi reuse
 * DELETE /auth/refresh                 logout (path sama agar cookie refresh ikut terkirim)
 * GET    /auth/me                      butuh access token
 * POST   /auth/verify-email            publik, { token }; 20/jam per IP
 * POST   /auth/verify-email/resend     login, 3/jam per user
 * POST   /auth/password/forgot         publik, { email }; selalu 202; 10/jam per IP + 3/jam per email
 * POST   /auth/password/reset          publik, { token, newPassword }; 10/15 menit per IP
 */
export function createAuthRouter({ service, signer, redis }: AuthRouterDeps): Router {
  const router = Router();
  const controller = new AuthController(service);

  router.post(
    '/register',
    rateLimit({ redis, name: 'auth:register', limit: 10, windowMs: HOUR }),
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

  router.post(
    '/verify-email',
    rateLimit({ redis, name: 'auth:verify-email', limit: 20, windowMs: HOUR }),
    validate({ body: VerifyEmailSchema }),
    controller.verifyEmail,
  );

  router.post(
    '/verify-email/resend',
    requireAuth(signer),
    rateLimit({ redis, name: 'auth:verify-resend', limit: 3, windowMs: HOUR, key: byUser }),
    controller.resendVerification,
  );

  router.post(
    '/password/forgot',
    rateLimit({ redis, name: 'auth:forgot:ip', limit: 10, windowMs: HOUR }),
    rateLimit({ redis, name: 'auth:forgot:email', limit: 3, windowMs: HOUR, key: byEmail }),
    validate({ body: ForgotPasswordSchema }),
    controller.forgotPassword,
  );

  router.post(
    '/password/reset',
    rateLimit({ redis, name: 'auth:reset', limit: 10, windowMs: 15 * MINUTE }),
    validate({ body: ResetPasswordSchema }),
    controller.resetPassword,
  );

  return router;
}

/**
 * PATCH /me            { fullName }
 * PATCH /me/password   { currentPassword, newPassword }; 5/15 menit per user; perangkat lain dikeluarkan
 */
export function createMeRouter({ service, signer, redis }: AuthRouterDeps): Router {
  const router = Router();
  const controller = new AuthController(service);

  router.use(requireAuth(signer));
  router.patch('/', validate({ body: UpdateProfileSchema }), controller.updateProfile);
  router.patch(
    '/password',
    // Cegah tebak password lama lewat sesi yang tercuri.
    rateLimit({ redis, name: 'me:password', limit: 5, windowMs: 15 * MINUTE, key: byUser }),
    validate({ body: ChangePasswordSchema }),
    controller.changePassword,
  );

  return router;
}
