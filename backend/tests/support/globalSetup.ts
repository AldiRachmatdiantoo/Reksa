import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';

const APP_DB_PASSWORD = 'app_test_password';

/**
 * Starts throwaway PostgreSQL + Redis containers, applies the real migrations
 * as the schema owner, then gives app_service_user a login so tests connect
 * exactly like production does (least privilege, subject to RLS).
 */
export default async function setup(project: TestProject) {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('reksa')
      .withUsername('reksa_owner')
      .withPassword('owner_test_password')
      .start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  const ownerUrl = postgres.getConnectionUri();
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, MIGRATION_DATABASE_URL: ownerUrl },
    stdio: 'pipe',
  });

  const alter = await postgres.exec([
    'psql',
    '-U',
    'reksa_owner',
    '-d',
    'reksa',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `ALTER ROLE app_service_user LOGIN PASSWORD '${APP_DB_PASSWORD}'`,
  ]);
  if (alter.exitCode !== 0) throw new Error(`Gagal menyiapkan app_service_user: ${alter.output}`);

  project.provide('ownerDatabaseUrl', ownerUrl);
  project.provide(
    'databaseUrl',
    `postgresql://app_service_user:${APP_DB_PASSWORD}@${postgres.getHost()}:${postgres.getPort()}/reksa`,
  );
  project.provide('redisUrl', redis.getConnectionUrl());

  return async () => {
    await Promise.all([redis.stop(), postgres.stop()]);
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    ownerDatabaseUrl: string;
    redisUrl: string;
  }
}
