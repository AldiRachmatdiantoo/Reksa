import type { Router } from 'express';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { IAiService } from './common/ai/ai.provider.interface.js';
import { AccessTokenSigner } from './common/utils/jwt.js';
import { Argon2PasswordHasher, type PasswordHasher } from './common/utils/passwordHasher.js';
import type { IEmailService } from './config/email.js';
import type { Env } from './config/env.js';
import type { PrismaClient } from './config/prisma.js';
import type { IStorageService } from './config/storage.js';
import { PrismaAuthRepository } from './features/auth/auth.repository.js';
import { createAuthRouter, createMeRouter } from './features/auth/auth.routes.js';
import { AuthService } from './features/auth/auth.service.js';
import { PrismaClassesRepository } from './features/classes/classes.repository.js';
import { createClassesRouter } from './features/classes/classes.routes.js';
import { ClassesService } from './features/classes/classes.service.js';
import { UnpdfTextExtractor, type PdfTextExtractor } from './common/utils/pdfText.js';
import { PrismaMaterialsRepository } from './features/materials/materials.repository.js';
import { createMaterialsRouter } from './features/materials/materials.routes.js';
import { MaterialsService } from './features/materials/materials.service.js';
import { RedisRubricCache } from './features/materials/rubricCache.js';
import { PrismaQuotaRepository } from './features/essay-scans/quota.repository.js';
import { createQuotaRouter } from './features/essay-scans/quota.routes.js';
import { QuotaService } from './features/essay-scans/quota.service.js';
import { PrismaSessionsRepository } from './features/study-sessions/sessions.repository.js';
import { createSessionsRouter } from './features/study-sessions/sessions.routes.js';
import { SessionsService } from './features/study-sessions/sessions.service.js';

export type ContainerDeps = {
  env: Pick<Env, 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET' | 'CORS_ORIGIN' | 'APP_URL'>;
  logger: Logger;
  prisma: PrismaClient;
  redis: Redis;
  ai: IAiService;
  /** Dipakai fitur materials (PDF) dan essay-scans (foto esai). */
  storage: IStorageService;
  /** Email verifikasi dan reset password (FR-14). Test memakai penampung di memori. */
  email: IEmailService;
  /** Override di test agar tidak menunggu Argon2 penuh. */
  hasher?: PasswordHasher;
  /** Override di test bila perlu; default pdf.js lewat unpdf. */
  pdf?: PdfTextExtractor;
};

/** Merangkai repository → service → router untuk semua fitur. */
export function buildRoutes(deps: ContainerDeps): Record<string, Router> {
  const signer = new AccessTokenSigner(deps.env.JWT_ACCESS_SECRET);

  const authService = new AuthService({
    repo: new PrismaAuthRepository(deps.prisma),
    hasher: deps.hasher ?? new Argon2PasswordHasher(),
    signer,
    refreshTokenKey: deps.env.JWT_REFRESH_SECRET,
    email: deps.email,
    appUrl: (deps.env.APP_URL ?? deps.env.CORS_ORIGIN).replace(/\/+$/, ''),
    onSecurityEvent: (event, data) => {
      const level = event === 'REFRESH_TOKEN_REUSE' ? 'warn' : 'info';
      deps.logger[level]({ securityEvent: event, ...data }, 'Security event');
    },
    onWarning: (message, data) => deps.logger.warn(data, message),
  });

  const materialsService = new MaterialsService({
    repo: new PrismaMaterialsRepository(deps.prisma),
    ai: deps.ai,
    cache: new RedisRubricCache(deps.redis, (err, op) => deps.logger.warn({ err, op }, 'Rubric cache unavailable')),
    storage: deps.storage,
    pdf: deps.pdf ?? new UnpdfTextExtractor(),
    onWarning: (message, data) => deps.logger.warn(data, message),
  });

  const classesService = new ClassesService({ repo: new PrismaClassesRepository(deps.prisma) });
  const sessionsService = new SessionsService({ repo: new PrismaSessionsRepository(deps.prisma) });
  const quotaService = new QuotaService({ repo: new PrismaQuotaRepository(deps.prisma) });

  return {
    '/auth': createAuthRouter({ service: authService, signer, redis: deps.redis }),
    '/me': createMeRouter({ service: authService, signer, redis: deps.redis }),
    '/materials': createMaterialsRouter({ service: materialsService, signer, redis: deps.redis }),
    '/classes': createClassesRouter({ service: classesService, signer, redis: deps.redis }),
    '/sessions': createSessionsRouter({ service: sessionsService, signer, redis: deps.redis }),
    // Dipasang setelah '/me' (auth). Router '/me' tidak punya GET /quota, jadi permintaan diteruskan ke sini.
    '/me/quota': createQuotaRouter({ service: quotaService, signer }),
  };
}
