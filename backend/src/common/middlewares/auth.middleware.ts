import type { RequestHandler, Response } from 'express';
import { UnauthorizedError } from '../errors/AppError.js';
import { ACCESS_COOKIE } from '../utils/authCookies.js';
import type { AccessTokenClaims, AccessTokenSigner } from '../utils/jwt.js';

export type AuthContext = AccessTokenClaims;

/**
 * Requires a valid access token from the __Host-access_token cookie.
 * Tokens in the Authorization header or query string are deliberately ignored:
 * the token must never be readable by JavaScript.
 */
export function requireAuth(signer: AccessTokenSigner): RequestHandler {
  return async (req, res, next) => {
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      next(new UnauthorizedError());
      return;
    }
    const claims = await signer.verify(token);
    if (!claims) {
      next(new UnauthorizedError('Sesi tidak valid atau sudah berakhir'));
      return;
    }
    res.locals.auth = claims;
    next();
  };
}

/** Use only in handlers mounted after requireAuth. */
export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth) {
    throw new Error('getAuth() dipanggil tanpa requireAuth di depannya');
  }
  return auth;
}
