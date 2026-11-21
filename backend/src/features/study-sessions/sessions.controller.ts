import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import { SessionIdParamsSchema, StartSessionSchema, SubmitJolSchema } from './sessions.schema.js';
import type { SessionsService } from './sessions.service.js';

export class SessionsController {
  constructor(private readonly service: SessionsService) {}

  start = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: StartSessionSchema });
    res.status(201).json({ session: await this.service.start(getAuth(res).userId, body) });
  };

  getActive = async (_req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    res.json({ session: await this.service.getActive(getAuth(res).userId) });
  };

  get = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: SessionIdParamsSchema });
    res.set('Cache-Control', 'no-store');
    res.json({ session: await this.service.get(getAuth(res).userId, params.id) });
  };

  submitJol = async (_req: Request, res: Response): Promise<void> => {
    const { params, body } = getValidated(res, { params: SessionIdParamsSchema, body: SubmitJolSchema });
    res.json({ session: await this.service.submitJol(getAuth(res).userId, params.id, body.predictedJolScore) });
  };

  cancel = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: SessionIdParamsSchema });
    res.json({ session: await this.service.cancel(getAuth(res).userId, params.id) });
  };
}
