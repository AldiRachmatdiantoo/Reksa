import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import { DueSchedulesQuerySchema, ScheduleIdParamsSchema } from './spaced.schema.js';
import type { SpacedService } from './spaced.service.js';

export class SpacedController {
  constructor(private readonly service: SpacedService) {}

  due = async (_req: Request, res: Response): Promise<void> => {
    const { query } = getValidated(res, { query: DueSchedulesQuerySchema });
    res.json(await this.service.listDue(getAuth(res).userId, query.limit));
  };

  start = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: ScheduleIdParamsSchema });
    res.status(201).json({ session: await this.service.startReview(getAuth(res).userId, params.id) });
  };

  complete = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: ScheduleIdParamsSchema });
    res.json({ schedule: await this.service.complete(getAuth(res).userId, params.id) });
  };
}
