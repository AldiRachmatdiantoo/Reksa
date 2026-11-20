import type { Router } from 'express';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { IAiService } from './common/ai/ai.provider.interface.js';
import { AccessTokenSigner } from './common/utils/jwt.js';
import { Argon2PasswordHasher, type PasswordHasher } from './common/utils/passwordHasher.js';
import type { Env } from './config/env.js';
import type { PrismaClient } from './config/prisma.js';
import { PrismaAuthRepository } from './features/auth/auth.repository.js';
import { createAuthRouter } from './features/auth/auth.routes.js';
import { AuthService } from './features/auth/auth.service.js';

export type ContainerDeps = {
  env: Pick<Env, 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'>;
  logger: Logger;
  prisma: PrismaClient;
  redis: Redis;
  ai: IAiService;
  /** Override di test agar tidak menunggu Argon2 penuh. */
  hasher?: PasswordHasher;
};

/** Merangkai repository → service → router untuk semua fitur. */
export function buildRoutes(deps: ContainerDeps): Record<string, Router> {
  const signer = new AccessTokenSigner(deps.env.JWT_ACCESS_SECRET);

  const authService = new AuthService({
    repo: new PrismaAuthRepository(deps.prisma),
    hasher: deps.hasher ?? new Argon2PasswordHasher(),
    signer,
    refreshTokenKey: deps.env.JWT_REFRESH_SECRET,
    onSecurityEvent: (event, data) => {
      const level = event === 'REFRESH_TOKEN_REUSE' ? 'warn' : 'info';
      deps.logger[level]({ securityEvent: event, ...data }, 'Security event');
    },
  });

  return {
    '/auth': createAuthRouter({ service: authService, signer, redis: deps.redis }),
  };
}
