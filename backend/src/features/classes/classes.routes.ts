import { Router } from 'express';
import type { Redis } from 'ioredis';
import { getAuth, requireAuth } from '../../common/middlewares/auth.middleware.js';
import { rateLimit } from '../../common/middlewares/rateLimit.middleware.js';
import { requireRole } from '../../common/middlewares/rbac.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import { ClassesController } from './classes.controller.js';
import { ClassIdParamsSchema, ClassMemberParamsSchema, CreateClassSchema, JoinClassSchema, RenameClassSchema } from './classes.schema.js';
import type { ClassesService } from './classes.service.js';

export type ClassesRouterDeps = {
  service: ClassesService;
  signer: AccessTokenSigner;
  redis: Redis;
};

const HOUR = 60 * 60_000;

/**
 * POST   /classes                          EDUCATOR, membuat kelas (kode dibuat server)
 * GET    /classes                          guru: kelas yang diampu; siswa: kelas yang diikuti
 * POST   /classes/join                     STUDENT, { classCode }; 10 percobaan/jam per user
 * GET    /classes/:id                      pemilik atau anggota
 * PATCH  /classes/:id                      pemilik, ganti nama
 * DELETE /classes/:id                      pemilik, hanya bila belum ada anggota
 * POST   /classes/:id/code                 pemilik, kode baru (kode lama tidak berlaku)
 * GET    /classes/:id/members              pemilik
 * DELETE /classes/:id/members/:studentId   pemilik, atau siswa itu sendiri (keluar kelas)
 *
 * Kepemilikan dicek di service + repository. Kelas milik orang lain dijawab 404.
 */
export function createClassesRouter({ service, signer, redis }: ClassesRouterDeps): Router {
  const router = Router();
  const controller = new ClassesController(service);
  const educatorOnly = requireRole('EDUCATOR');

  router.use(requireAuth(signer));

  router.post('/', educatorOnly, validate({ body: CreateClassSchema }), controller.create);
  router.get('/', controller.list);
  router.post(
    '/join',
    requireRole('STUDENT'),
    // Dipasang sebelum validasi agar setiap percobaan (termasuk yang salah format) ikut terhitung.
    rateLimit({ redis, name: 'classes:join', limit: 10, windowMs: HOUR, key: (req) => getAuth(req.res!).userId }),
    validate({ body: JoinClassSchema }),
    controller.join,
  );
  router.get('/:id', validate({ params: ClassIdParamsSchema }), controller.get);
  router.patch('/:id', educatorOnly, validate({ params: ClassIdParamsSchema, body: RenameClassSchema }), controller.rename);
  router.delete('/:id', educatorOnly, validate({ params: ClassIdParamsSchema }), controller.delete);
  router.post('/:id/code', educatorOnly, validate({ params: ClassIdParamsSchema }), controller.rotateCode);
  router.get('/:id/members', educatorOnly, validate({ params: ClassIdParamsSchema }), controller.listMembers);
  router.delete('/:id/members/:studentId', validate({ params: ClassMemberParamsSchema }), controller.removeMember);

  return router;
}
