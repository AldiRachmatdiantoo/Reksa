import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFoundHandler } from './common/errors/errorHandler.js';
import type { Env } from './config/env.js';

export type AppDeps = {
  env: Pick<Env, 'CORS_ORIGIN' | 'NODE_ENV'>;
  logger: Logger;
};

export function createApp({ env, logger }: AppDeps): Express {
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
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== 'test' }));

  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Router fitur dipasang di sini mulai Fase 1, mis.:
  // api.use('/auth', createAuthRouter(deps));

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
