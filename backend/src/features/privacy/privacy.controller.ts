import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import { clearAuthCookies } from '../../common/utils/authCookies.js';
import { DeleteAccountSchema } from './privacy.schema.js';
import type { PrivacyService } from './privacy.service.js';

export class PrivacyController {
  constructor(private readonly service: PrivacyService) {}

  exportAccount = async (_req: Request, res: Response): Promise<void> => {
    res.status(201).json({ export: await this.service.exportAccount(getAuth(res).userId) });
  };

  deleteAccount = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: DeleteAccountSchema });
    await this.service.deleteAccount(getAuth(res).userId, body.password);
    clearAuthCookies(res);
    res.status(204).end();
  };
}
