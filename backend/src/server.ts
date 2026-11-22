import { createApp } from './app.js';
import { createAiService } from './common/ai/ai.factory.js';
import { createLogger } from './common/utils/logger.js';
import { loadEnv } from './config/env.js';
import { buildAuditWorker, buildRoutes, createPrivacyService } from './container.js';
import { createEmailService } from './config/email.js';
import { createPrismaClient } from './config/prisma.js';
import { createRedisClient } from './config/redis.js';
import { createStorageService } from './config/storage.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);

  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedisClient(env.REDIS_URL);
  const ai = createAiService(env, {
    onSignal: (signal) => logger.warn({ aiSignal: signal }, 'Audit Stage 2: instruksi mencurigakan atau klaim tanpa bukti'),
  });
  const storage = createStorageService(env);
  const email = createEmailService(env, logger);

  await prisma.$connect();
  await redis.connect();
  await storage.checkConnection();
  const aiModels = env.AI_PROVIDER_MODE === 'gemini' ? { textModel: env.GEMINI_TEXT_MODEL, visionModel: env.GEMINI_VISION_MODEL } : {};
  logger.info({ aiProviderMode: env.AI_PROVIDER_MODE, ...aiModels }, 'Database, Redis, storage, dan AI provider siap');

  const routes = buildRoutes({ env, logger, prisma, redis, ai, storage, email });
  // Worker audit AI (FR-05) di proses yang sama; berhenti sebelum koneksi DB/Redis ditutup.
  const auditWorker = buildAuditWorker({ prisma, redis, storage, ai, logger });
  auditWorker.start();
  // File ekspor (FR-12, FR-13) dihapus setelah 24 jam. Tanpa cron: dicek tiap 15 menit di proses ini.
  const privacy = createPrivacyService({ prisma, storage, logger });
  const sweepExports = () =>
    void privacy
      .cleanupExpiredExports()
      .then((removed) => removed > 0 && logger.info({ removed }, 'File ekspor kedaluwarsa dihapus'))
      .catch((err: unknown) => logger.warn({ err }, 'Pembersihan file ekspor gagal'));
  sweepExports();
  const exportSweeper = setInterval(sweepExports, 15 * 60_000);
  exportSweeper.unref();
  const app = createApp({ env, logger, routes });
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
      clearInterval(exportSweeper);
      await auditWorker.stop();
      storage.destroy();
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
