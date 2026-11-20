import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../../common/utils/authCookies.js';
import { LoginSchema, RegisterSchema } from './auth.schema.js';
import type { AuthService } from './auth.service.js';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: RegisterSchema });
    const result = await this.service.register(body);
    setAuthCookies(res, result);
    res.status(201).json({ user: result.user });
  };

  login = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: LoginSchema });
    const result = await this.service.login(body);
    setAuthCookies(res, result);
    res.json({ user: result.user });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.service.refresh(readRefreshCookie(req));
      setAuthCookies(res, result);
      res.json({ user: result.user });
    } catch (err) {
      clearAuthCookies(res);
      throw err;
    }
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.service.logout(readRefreshCookie(req));
    clearAuthCookies(res);
    res.status(204).end();
  };

  me = async (_req: Request, res: Response): Promise<void> => {
    const user = await this.service.getCurrentUser(getAuth(res).userId);
    res.json({ user });
  };
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
