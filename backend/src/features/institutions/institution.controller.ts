import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import { EducatorIdParamsSchema, InviteIdParamsSchema, JoinInstitutionSchema } from './institution.schema.js';
import type { InstitutionService } from './institution.service.js';

export class InstitutionController {
  constructor(private readonly service: InstitutionService) {}

  overview = async (_req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    res.json(await this.service.overview(getAuth(res).userId));
  };

  concepts = async (_req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    res.json(await this.service.concepts(getAuth(res).userId));
  };

  listInvites = async (_req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    res.json({ invites: await this.service.listInvites(getAuth(res).userId) });
  };

  createInvite = async (_req: Request, res: Response): Promise<void> => {
    // Kode mentah hanya ada di jawaban ini.
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ invite: await this.service.createInvite(getAuth(res).userId) });
  };

  revokeInvite = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: InviteIdParamsSchema });
    res.json({ invite: await this.service.revokeInvite(getAuth(res).userId, params.inviteId) });
  };

  detachEducator = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: EducatorIdParamsSchema });
    await this.service.detachEducator(getAuth(res).userId, params.educatorId);
    res.status(204).end();
  };

  myInstitution = async (_req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    res.json({ institution: await this.service.myInstitution(getAuth(res).userId) });
  };

  join = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: JoinInstitutionSchema });
    res.json({ institution: await this.service.join(getAuth(res).userId, body.code) });
  };
}
