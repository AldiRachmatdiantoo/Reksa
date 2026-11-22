import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Router } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFoundHandler } from './common/errors/errorHandler.js';
import type { Env } from './config/env.js';

export type AppDeps = {
  env: Pick<Env, 'CORS_ORIGIN' | 'NODE_ENV'> & Partial<Pick<Env, 'TRUST_PROXY_HOPS'>>;
  logger: Logger;
  /** Router fitur yang dipasang di bawah /api/v1, mis. { '/auth': authRouter }. */
  routes?: Record<string, Router>;
};

export function createApp({ env, logger, routes = {} }: AppDeps): Express {
  const app = express();

  // Backend hanya diakses lewat reverse proxy (lokal: Nginx; produksi: rewrite Vercel lalu load balancer
  // Render). Jumlah hop harus tepat agar req.ip berisi IP klien asli untuk rate limiting, dan header
  // X-Forwarded-For kiriman klien tidak bisa dipakai memalsukan IP.
  app.set('trust proxy', env.TRUST_PROXY_HOPS ?? 1);

  // Satu-satunya sumber header keamanan untuk respons API (nginx mengosongkan
  // header yang sama untuk /api/). Nilainya disamakan dengan header halaman di nginx.
  app.use(
    helmet({
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
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
