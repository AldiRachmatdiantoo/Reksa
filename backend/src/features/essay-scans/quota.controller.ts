import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import type { QuotaService } from './quota.service.js';

export class QuotaController {
  constructor(private readonly service: QuotaService) {}

  get = async (_req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    res.json({ quota: await this.service.get(getAuth(res).userId) });
  };
}
