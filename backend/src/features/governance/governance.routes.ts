import { Router } from 'express';
import type { Redis } from 'ioredis';
import { getAuth, requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { requireRole } from '../../common/middlewares/rbac.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import type { CohortService } from './cohort.service.js';
import { GovernanceController } from './governance.controller.js';
import { ClassIdParamsSchema, ClassMaterialParamsSchema, LedgerExportSchema, LedgerHashParamsSchema, LedgerQuerySchema } from './governance.schema.js';
import type { GovernanceService } from './governance.service.js';
import type { LedgerExportService } from './ledgerExport.service.js';

export type GovernanceRouterDeps = { service: GovernanceService; signer: AccessTokenSigner; redis: Redis };

const MINUTE = 60_000;

/**
 * GET /governance/classes/:classId/ledger?cursor=&limit=&studentId=
 *     EDUCATOR pemilik kelas; pengumpulan DONE + signed URL foto (FR-07). Kelas lain: 404.
 * GET /governance/classes/:classId/blind-spots
 *     Materi yang sudah punya hasil cek di kelas ini (FR-08).
 * GET /governance/classes/:classId/blind-spots/:materialId
 *     Persentase siswa yang melewatkan tiap konsep + saran AI (FR-08). Materi tanpa hasil: 404.
 */
export function createGovernanceRouter({
  service,
  cohort,
  signer,
  redis,
}: GovernanceRouterDeps & { cohort: CohortService }): Router {
  const router = Router();
  const controller = new GovernanceController(service, undefined, cohort);

  router.use(requireAuth(signer), requireRole('EDUCATOR'));
  router.get(
    '/classes/:classId/ledger',
    // Setiap halaman membuat signed URL foto: dibatasi supaya tidak dipakai untuk menyedot foto.
    rateLimit({ redis, name: 'governance:ledger', limit: 120, windowMs: MINUTE, key: (req) => getAuth(req.res!).userId }),
    validate({ params: ClassIdParamsSchema, query: LedgerQuerySchema }),
    controller.ledger,
  );

  // Validasi dulu supaya id yang salah tidak memakan jatah; peta bisa memicu panggilan AI.
  const cohortLimit = rateLimit({ redis, name: 'governance:cohort', limit: 30, windowMs: MINUTE, key: (req) => getAuth(req.res!).userId });
  router.get('/classes/:classId/blind-spots', validate({ params: ClassIdParamsSchema }), cohortLimit, controller.cohortMaterials);
  router.get(
    '/classes/:classId/blind-spots/:materialId',
    validate({ params: ClassMaterialParamsSchema }),
    cohortLimit,
    controller.cohortBlindSpots,
  );
  return router;
}

/**
 * GET  /ledger/verify/:hash   publik, 30/menit per IP. Hanya { valid, sessionDate }: tanpa nama, skor, atau foto.
 * POST /ledger/exports        STUDENT Pro; PDF bukti belajar milik sendiri (FR-12), 5/jam per user.
 */
export function createLedgerRouter({
  service,
  exports,
  signer,
  redis,
}: GovernanceRouterDeps & { exports: LedgerExportService }): Router {
  const router = Router();
  const controller = new GovernanceController(service, exports);

  router.post(
    '/exports',
    requireAuth(signer),
    requireRole('STUDENT'),
    // Validasi dulu: body yang salah tidak memakan jatah 5 ekspor per jam.
    validate({ body: LedgerExportSchema }),
    rateLimit({ redis, name: 'ledger:export', limit: 5, windowMs: 60 * MINUTE, key: (req) => getAuth(req.res!).userId }),
    controller.exportPdf,
  );

  router.get(
    '/verify/:hash',
    rateLimit({ redis, name: 'ledger:verify', limit: 30, windowMs: MINUTE }),
    validate({ params: LedgerHashParamsSchema }),
    controller.verify,
  );
  return router;
}
