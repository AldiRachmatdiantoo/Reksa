import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import { ClassIdParamsSchema, LedgerHashParamsSchema, LedgerQuerySchema } from './governance.schema.js';
import type { GovernanceService } from './governance.service.js';

export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}

  ledger = async (_req: Request, res: Response): Promise<void> => {
    const { params, query } = getValidated(res, { params: ClassIdParamsSchema, query: LedgerQuerySchema });
    res.set('Cache-Control', 'no-store');
    res.json(await this.service.ledger(getAuth(res).userId, params.classId, query));
  };

  verify = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: LedgerHashParamsSchema });
    res.json(await this.service.verify(params.hash));
  };
}
