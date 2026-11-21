import type { Express } from 'express';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { inject } from 'vitest';
import { createApp } from '../../src/app.js';
import { MockAiProvider } from '../../src/common/ai/mockAi.provider.js';
import { buildRoutes } from '../../src/container.js';
import { createPrismaClient, type PrismaClient } from '../../src/config/prisma.js';
import { S3StorageService } from '../../src/config/storage.js';
import { MemoryEmailService } from './memoryEmail.js';

export const TEST_ENV = {
  CORS_ORIGIN: 'http://localhost:8080',
  NODE_ENV: 'test' as const,
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters!!',
  JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters!',
};

export type TestContext = {
  app: Express;
  /** Connects as app_service_user, like the real app (RLS applies). */
  prisma: PrismaClient;
  /** Connects as the schema owner; only for setup and cleanup. */
  owner: PrismaClient;
  redis: Redis;
  /** Real S3 bucket (SeaweedFS; same S3 API as Supabase Storage). */
  storage: S3StorageService;
  /** Email yang "terkirim" (verifikasi, reset password). */
  emails: MemoryEmailService;
  reset(): Promise<void>;
  close(): Promise<void>;
};

export function createTestContext(): TestContext {
  const logger = pino({ level: 'silent' });
  const prisma = createPrismaClient(inject('databaseUrl'));
  const owner = createPrismaClient(inject('ownerDatabaseUrl'));
  const redis = new Redis(inject('redisUrl'));
  const storageConfig = inject('storage');
  const storage = new S3StorageService({ ...storageConfig, region: 'us-east-1', forcePathStyle: true });
  const emails = new MemoryEmailService();

  const routes = buildRoutes({
    env: TEST_ENV,
    logger,
    prisma,
    redis,
    storage,
    email: emails,
    ai: new MockAiProvider({ latencyMs: 0 }),
  });
  const app = createApp({ env: TEST_ENV, logger, routes });

  return {
    app,
    prisma,
    owner,
    redis,
    storage,
    emails,
    async reset() {
      emails.clear();
      await owner.$executeRaw`TRUNCATE TABLE users, institutions RESTART IDENTITY CASCADE`;
      await redis.flushdb();
    },
    async close() {
      storage.destroy();
      await Promise.all([prisma.$disconnect(), owner.$disconnect(), redis.quit()]);
    },
  };
}

export type ParsedCookie = { value: string; attributes: Record<string, string | true> };

/** Parses Set-Cookie headers into { name: { value, attributes } } (attribute keys lowercased). */
export function parseSetCookies(header: string | string[] | undefined): Record<string, ParsedCookie> {
  const list = header === undefined ? [] : Array.isArray(header) ? header : [header];
  const result: Record<string, ParsedCookie> = {};
  for (const raw of list) {
    const [pair = '', ...attrs] = raw.split(';').map((p) => p.trim());
    const eq = pair.indexOf('=');
    const name = pair.slice(0, eq);
    const attributes: Record<string, string | true> = {};
    for (const attr of attrs) {
      const i = attr.indexOf('=');
      if (i === -1) attributes[attr.toLowerCase()] = true;
      else attributes[attr.slice(0, i).toLowerCase()] = attr.slice(i + 1);
    }
    result[name] = { value: decodeURIComponent(pair.slice(eq + 1)), attributes };
  }
  return result;
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
}

export const VALID_PASSWORD = 'PasswordKuat123';

/** FR-13: data persetujuan wajib saat daftar (dewasa, jadi tidak butuh izin wali). */
export const CONSENT = { birthYear: 2000, acceptTerms: true } as const;
