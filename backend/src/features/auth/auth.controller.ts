import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../../common/utils/authCookies.js';
import {
  ChangePasswordSchema,
  ConsentSchema,
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  UpdateProfileSchema,
  VerifyEmailSchema,
} from './auth.schema.js';
import type { AuthService } from './auth.service.js';

/** Satu pesan untuk semua permintaan reset, terdaftar atau tidak (anti enumerasi akun). */
const FORGOT_MESSAGE = 'Kalau email itu terdaftar, tautan untuk mengatur ulang kata sandi sudah dikirim. Cek kotak masuk dan folder spam.';

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

  verifyEmail = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: VerifyEmailSchema });
    await this.service.verifyEmail(body.token);
    res.status(204).end();
  };

  resendVerification = async (_req: Request, res: Response): Promise<void> => {
    await this.service.resendVerification(getAuth(res).userId);
    res.status(202).json({ message: 'Tautan verifikasi sudah dikirim ulang.' });
  };

  forgotPassword = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: ForgotPasswordSchema });
    await this.service.requestPasswordReset(body.email);
    res.status(202).json({ message: FORGOT_MESSAGE });
  };

  resetPassword = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: ResetPasswordSchema });
    await this.service.resetPassword(body.token, body.newPassword);
    res.status(204).end();
  };

  updateProfile = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: UpdateProfileSchema });
    res.json({ user: await this.service.updateProfile(getAuth(res).userId, body.fullName) });
  };

  recordConsent = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: ConsentSchema });
    res.json({ user: await this.service.recordConsent(getAuth(res).userId, body) });
  };

  changePassword = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: ChangePasswordSchema });
    const result = await this.service.changePassword(getAuth(res).userId, body.currentPassword, body.newPassword);
    setAuthCookies(res, result);
    res.json({ user: result.user });
  };
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
