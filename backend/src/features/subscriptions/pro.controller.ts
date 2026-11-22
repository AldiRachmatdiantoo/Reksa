import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import { ActivateProSchema } from './pro.schema.js';
import type { ProService } from './pro.service.js';

export class ProController {
  constructor(private readonly service: ProService) {}

  activate = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: ActivateProSchema });
    res.json({ pro: await this.service.activate(getAuth(res).userId, body.code) });
  };
}
