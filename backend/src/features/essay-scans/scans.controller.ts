import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import { ScanIdParamsSchema, UploadScanFieldsSchema } from './scans.schema.js';
import type { ScansService } from './scans.service.js';

export class ScansController {
  constructor(private readonly service: ScansService) {}

  upload = async (req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: UploadScanFieldsSchema });
    const actor = res.locals.auth ? getAuth(res).userId : null;
    const result = await this.service.upload({
      actorUserId: actor,
      sessionId: body.sessionId,
      qrToken: body.qrToken,
      image: req.file?.buffer,
    });
    res.status(202).json(result);
  };

  get = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: ScanIdParamsSchema });
    res.set('Cache-Control', 'no-store');
    res.json({ scan: await this.service.get(getAuth(res).userId, params.id) });
  };

  retry = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: ScanIdParamsSchema });
    res.status(202).json(await this.service.retry(getAuth(res).userId, params.id));
  };
}
