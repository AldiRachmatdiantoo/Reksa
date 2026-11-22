import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import { HistoryQuerySchema } from './history.schema.js';
import type { HistoryService } from './history.service.js';

export class HistoryController {
  constructor(private readonly service: HistoryService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const { query } = getValidated(res, { query: HistoryQuerySchema });
    res.json(await this.service.list(getAuth(res).userId, query.cursor, query.limit));
  };

  calibration = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.calibration(getAuth(res).userId));
  };
}
