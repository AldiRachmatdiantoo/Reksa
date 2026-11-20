import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, NotFoundError } from './AppError.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError('Endpoint tidak ditemukan'));
};

/** Never sends stack traces or internal messages to the client. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input tidak valid',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  // body-parser errors (malformed JSON, payload too large) carry a 4xx status.
  const status = typeof err?.status === 'number' ? err.status : undefined;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: { code: 'BAD_REQUEST', message: 'Permintaan tidak valid' } });
    return;
  }

  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server' } });
};
