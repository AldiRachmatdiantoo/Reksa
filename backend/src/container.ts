import { Router } from 'express';
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
import { MockAiProvider } from './common/ai/mockAi.provider.js';
import { CohortService } from './features/governance/cohort.service.js';
import { PrismaInstitutionRepository } from './features/institutions/institution.repository.js';
import { createEducatorInstitutionRouter, createInstitutionRouter } from './features/institutions/institution.routes.js';
import { InstitutionService } from './features/institutions/institution.service.js';
import { RedisCohortCache } from './features/governance/cohortCache.js';
import { PrismaGovernanceRepository } from './features/governance/governance.repository.js';
import { createGovernanceRouter, createLedgerRouter } from './features/governance/governance.routes.js';
import { GovernanceService } from './features/governance/governance.service.js';
import { PrismaLedgerExportRepository } from './features/governance/ledgerExport.repository.js';
import { LedgerExportService } from './features/governance/ledgerExport.service.js';
import { PrismaSpacedRepository } from './features/spaced-repetition/spaced.repository.js';
import { createSpacedRouter } from './features/spaced-repetition/spaced.routes.js';
import { PrismaHistoryRepository } from './features/history/history.repository.js';
import { createHistoryRouter } from './features/history/history.routes.js';
import { HistoryService } from './features/history/history.service.js';
import { SpacedService } from './features/spaced-repetition/spaced.service.js';
import { PrismaMaterialsRepository } from './features/materials/materials.repository.js';
import { createMaterialsRouter } from './features/materials/materials.routes.js';
import { MaterialsService } from './features/materials/materials.service.js';
import { RedisRubricCache } from './features/materials/rubricCache.js';
import { SharpImageProcessor } from './common/utils/imageProcessor.js';
import { AuditWorker, RedisAuditQueue } from './features/essay-scans/audit.queue.js';
import { AuditService } from './features/essay-scans/audit.service.js';
import { RedisQrBridge } from './features/essay-scans/qrBridge.gateway.js';
import { PrismaScansRepository } from './features/essay-scans/scans.repository.js';
import { createScansRouter } from './features/essay-scans/scans.routes.js';
import { SCAN_ALLOWED_MIME_TYPES } from './features/essay-scans/scans.schema.js';
import { ScansService } from './features/essay-scans/scans.service.js';
import { PrismaQuotaRepository } from './features/essay-scans/quota.repository.js';
import { createQuotaRouter } from './features/essay-scans/quota.routes.js';
import { QuotaService } from './features/essay-scans/quota.service.js';
import { PrismaPrivacyRepository } from './features/privacy/privacy.repository.js';
import { createPrivacyRouter } from './features/privacy/privacy.routes.js';
import { PrivacyService } from './features/privacy/privacy.service.js';
import { PrismaProRepository } from './features/subscriptions/pro.repository.js';
import { createProRouter } from './features/subscriptions/pro.routes.js';
import { ProService } from './features/subscriptions/pro.service.js';
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

  const hasher = deps.hasher ?? new Argon2PasswordHasher();
  const authService = new AuthService({
    repo: new PrismaAuthRepository(deps.prisma),
    hasher,
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
  const qrBridge = new RedisQrBridge(deps.redis);
  const sessionsService = new SessionsService({ repo: new PrismaSessionsRepository(deps.prisma), qrBridge });
  const quotaService = new QuotaService({ repo: new PrismaQuotaRepository(deps.prisma) });
  const scansService = new ScansService({
    repo: new PrismaScansRepository(deps.prisma),
    sessions: sessionsService,
    quota: quotaService,
    images: new SharpImageProcessor({ allowedMimeTypes: SCAN_ALLOWED_MIME_TYPES }),
    storage: deps.storage,
    qrBridge,
    queue: new RedisAuditQueue(deps.redis),
    audit: createAuditService(deps),
    onWarning: (message, data) => deps.logger.warn(data, message),
  });

  const governanceRepo = new PrismaGovernanceRepository(deps.prisma);
  const cohortService = new CohortService({
    repo: governanceRepo,
    ai: deps.ai,
    cache: new RedisCohortCache(deps.redis, (err, op) => deps.logger.warn({ err, op }, 'Cohort cache unavailable')),
    aiIsSample: deps.ai instanceof MockAiProvider,
    onWarning: (message, data) => deps.logger.warn(data, message),
  });
  const governanceService = new GovernanceService({
    repo: governanceRepo,
    storage: deps.storage,
    onWarning: (message, data) => deps.logger.warn(data, message),
  });

  const privacyService = createPrivacyService(deps, hasher);
  const proService = new ProService({ repo: new PrismaProRepository(deps.prisma) });
  const institutionService = new InstitutionService({ repo: new PrismaInstitutionRepository(deps.prisma) });

  // Semua yang ada di bawah /me: profil & persetujuan (auth), privasi (FR-13), Pro (FR-11).
  const me = Router();
  me.use(createMeRouter({ service: authService, signer, redis: deps.redis }));
  me.use(createPrivacyRouter({ service: privacyService, signer, redis: deps.redis }));
  me.use(createProRouter({ service: proService, signer, redis: deps.redis }));
  me.use(createEducatorInstitutionRouter({ service: institutionService, signer, redis: deps.redis }));

  return {
    '/auth': createAuthRouter({ service: authService, signer, redis: deps.redis }),
    '/me': me,
    '/materials': createMaterialsRouter({ service: materialsService, signer, redis: deps.redis }),
    '/spaced': createSpacedRouter({
      service: new SpacedService({ repo: new PrismaSpacedRepository(deps.prisma) }),
      signer,
      redis: deps.redis,
    }),
    '/history': createHistoryRouter({
      service: new HistoryService({ repo: new PrismaHistoryRepository(deps.prisma) }),
      signer,
    }),
    '/classes': createClassesRouter({ service: classesService, signer, redis: deps.redis }),
    '/sessions': createSessionsRouter({ service: sessionsService, signer, redis: deps.redis }),
    // Dipasang setelah '/me' (auth). Router '/me' tidak punya GET /quota, jadi permintaan diteruskan ke sini.
    '/me/quota': createQuotaRouter({ service: quotaService, signer }),
    '/scans': createScansRouter({ service: scansService, signer, redis: deps.redis }),
    '/institution': createInstitutionRouter({ service: institutionService, signer, redis: deps.redis }),
    '/governance': createGovernanceRouter({ service: governanceService, cohort: cohortService, signer, redis: deps.redis }),
    '/ledger': createLedgerRouter({
      service: governanceService,
      exports: new LedgerExportService({
        repo: new PrismaLedgerExportRepository(deps.prisma),
        storage: deps.storage,
        exports: privacyService,
        appUrl: (deps.env.APP_URL ?? deps.env.CORS_ORIGIN).replace(/\/+$/, ''),
        onWarning: (message, data) => deps.logger.warn(data, message),
      }),
      signer,
      redis: deps.redis,
    }),
  };
}

export function createPrivacyService(
  deps: Pick<ContainerDeps, 'prisma' | 'storage' | 'logger'>,
  hasher: PasswordHasher = new Argon2PasswordHasher(),
): PrivacyService {
  return new PrivacyService({
    repo: new PrismaPrivacyRepository(deps.prisma),
    storage: deps.storage,
    hasher,
    onWarning: (message, data) => deps.logger.warn(data, message),
  });
}

function createAuditService(deps: Pick<ContainerDeps, 'prisma' | 'storage' | 'ai' | 'logger'>): AuditService {
  return new AuditService({
    repo: new PrismaScansRepository(deps.prisma),
    storage: deps.storage,
    ai: deps.ai,
    onWarning: (message, data) => deps.logger.warn(data, message),
  });
}

/**
 * Worker audit AI (FR-05). Dijalankan server.ts di proses yang sama dengan API; berhenti saat shutdown.
 * Test integrasi memakai `drain()` untuk menjalankan antrean secara deterministik.
 */
export function buildAuditWorker(
  deps: Pick<ContainerDeps, 'prisma' | 'redis' | 'storage' | 'ai' | 'logger'>,
  options: { concurrency?: number; auditService?: AuditService } = {},
): AuditWorker {
  const audit = options.auditService ?? createAuditService(deps);
  return new AuditWorker({
    queue: new RedisAuditQueue(deps.redis),
    handle: (job) => audit.run(job),
    concurrency: options.concurrency ?? 2,
    onError: (err, job) => deps.logger.error({ err, job }, 'Audit job gagal'),
  });
}
