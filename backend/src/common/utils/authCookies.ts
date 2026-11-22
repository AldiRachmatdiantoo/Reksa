import type { CookieOptions, Request, Response } from 'express';
import { ACCESS_TOKEN_TTL_SEC } from './jwt.js';

export const ACCESS_COOKIE = '__Host-access_token';
export const REFRESH_COOKIE = '__Secure-refresh_token';

export const REFRESH_TOKEN_TTL_SEC = 7 * 24 * 60 * 60;
/** Refresh cookie hanya dikirim ke endpoint refresh/logout (PRD §9.1). */
export const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';

// __Host- wajib: Secure, Path=/, tanpa Domain.
const accessCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
};

// __Secure- wajib: Secure. Path dibatasi, tanpa Domain.
const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: REFRESH_COOKIE_PATH,
};

export function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...accessCookieOptions, maxAge: ACCESS_TOKEN_TTL_SEC * 1000 });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...refreshCookieOptions,
    maxAge: REFRESH_TOKEN_TTL_SEC * 1000,
  });
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, accessCookieOptions);
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
}
