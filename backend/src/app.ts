import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Router } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFoundHandler } from './common/errors/errorHandler.js';
import type { Env } from './config/env.js';

export type AppDeps = {
  env: Pick<Env, 'CORS_ORIGIN' | 'NODE_ENV'>;
  logger: Logger;
  /** Router fitur yang dipasang di bawah /api/v1, mis. { '/auth': authRouter }. */
  routes?: Record<string, Router>;
};

export function createApp({ env, logger, routes = {} }: AppDeps): Express {
  const app = express();

  // Backend hanya diakses lewat satu reverse proxy (Nginx). Dibutuhkan agar
  // req.ip berisi IP klien asli untuk rate limiting.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      // Docker HEALTHCHECK memanggil /health tiap 30 detik; jangan banjiri log.
      autoLogging: env.NODE_ENV === 'test' ? false : { ignore: (req) => req.url === '/api/v1/health' },
    }),
  );

  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  for (const [path, router] of Object.entries(routes)) {
    api.use(path, router);
  }

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
