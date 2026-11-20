import { createApp } from './app.js';
import { createAiService } from './common/ai/ai.factory.js';
import { createLogger } from './common/utils/logger.js';
import { loadEnv } from './config/env.js';
import { createPrismaClient } from './config/prisma.js';
import { createRedisClient } from './config/redis.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);

  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedisClient(env.REDIS_URL);
  const ai = createAiService(env);

  await prisma.$connect();
  await redis.connect();
  logger.info({ aiProviderMode: env.AI_PROVIDER_MODE }, 'Database, Redis, dan AI provider siap');

  // prisma, redis, dan ai akan diteruskan ke router fitur mulai Fase 1.
  void ai;

  const app = createApp({ env, logger });
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'REKSA backend berjalan');
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Mematikan server...');

    const forceExit = setTimeout(() => {
      logger.error('Shutdown melebihi 10 detik, keluar paksa');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
      await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
      logger.info('Server berhenti dengan bersih');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  // Logger belum tentu siap (mis. env tidak valid), jadi pakai stderr langsung.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
