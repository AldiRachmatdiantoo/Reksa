import type { RequestHandler } from 'express';
import { ForbiddenError } from '../errors/AppError.js';
import type { Role } from '../utils/jwt.js';
import { getAuth } from './auth.middleware.js';

/** Mount after requireAuth. Ownership checks still happen in the service/repository. */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (_req, res, next) => {
    const { role } = getAuth(res);
    if (!allowed.includes(role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
