import { Router, type Request } from 'express';
import type { Redis } from 'ioredis';
import { getAuth, requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { requireRole } from '../../common/middlewares/rbac.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { InstitutionController } from './institution.controller.js';
import { EducatorIdParamsSchema, EmptyBodySchema, InviteIdParamsSchema, JoinInstitutionSchema } from './institution.schema.js';
import type { InstitutionService } from './institution.service.js';

export type InstitutionRouterDeps = { service: InstitutionService; signer: AccessTokenSigner; redis: Redis };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const byUser = (req: Request) => getAuth(req.res!).userId;

/**
 * Portal admin institusi (FR-10), hanya INSTITUTION_ADMIN:
 * GET    /institution                         pengajar, kelas, agregat per kelas (kelompok < 5 siswa disembunyikan)
 * GET    /institution/concepts                konsep tersulit lintas kelas (materi dengan >= 5 siswa)
 * GET    /institution/invites                 50 kode undangan terakhir
 * POST   /institution/invites                 kode baru, 7 hari; kode mentah hanya di jawaban ini (20/jam)
 * DELETE /institution/invites/:inviteId       cabut kode (idempoten)
 * DELETE /institution/educators/:educatorId   lepas pengajar; kelasnya tetap milik pengajar
 */
export function createInstitutionRouter({ service, signer, redis }: InstitutionRouterDeps): Router {
  const router = Router();
  const controller = new InstitutionController(service);

  router.use(
    requireAuth(signer),
    requireRole('INSTITUTION_ADMIN'),
    rateLimit({ redis, name: 'institution:read', limit: 120, windowMs: MINUTE, key: byUser }),
  );
  router.get('/', controller.overview);
  router.get('/concepts', controller.concepts);
  router.get('/invites', controller.listInvites);
  router.post(
    '/invites',
    validate({ body: EmptyBodySchema }),
    rateLimit({ redis, name: 'institution:invite', limit: 20, windowMs: HOUR, key: byUser }),
    controller.createInvite,
  );
  router.delete('/invites/:inviteId', validate({ params: InviteIdParamsSchema }), controller.revokeInvite);
  router.delete('/educators/:educatorId', validate({ params: EducatorIdParamsSchema }), controller.detachEducator);
  return router;
}

/**
 * Dipasang di bawah /me (FR-10), hanya EDUCATOR:
 * GET  /me/institution   institusi tempat pengajar terhubung, atau null
 * POST /me/institution   { code }; 10 percobaan per jam per user. Kode salah/kedaluwarsa/dicabut: 404 yang sama.
 */
export function createEducatorInstitutionRouter({ service, signer, redis }: InstitutionRouterDeps): Router {
  const router = Router();
  const controller = new InstitutionController(service);
  router.get('/institution', requireAuth(signer), requireRole('EDUCATOR'), controller.myInstitution);
  router.post(
    '/institution',
    requireAuth(signer),
    requireRole('EDUCATOR'),
    // Semua percobaan dihitung, termasuk body salah: ini pintu tebak kode.
    rateLimit({ redis, name: 'me:institution-join', limit: 10, windowMs: HOUR, key: byUser }),
    validate({ body: JoinInstitutionSchema }),
    controller.join,
  );
  return router;
}
