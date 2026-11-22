import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

const APP_DB_PASSWORD = 'app_test_password';
const S3_ACCESS_KEY = 's3_test_key';
const S3_SECRET_KEY = 's3_test_secret';
const S3_BUCKET = 'reksa-test';
/** Pinned: MinIO stopped publishing images, SeaweedFS speaks the same S3 API (incl. SigV4 presign). */
const SEAWEEDFS_IMAGE = 'chrislusf/seaweedfs:4.54';
const S3_IDENTITIES = JSON.stringify({
  identities: [
    {
      name: 'reksa-test',
      credentials: [{ accessKey: S3_ACCESS_KEY, secretKey: S3_SECRET_KEY }],
      actions: ['Admin', 'Read', 'Write', 'List', 'Tagging'],
    },
  ],
});

/**
 * Starts throwaway PostgreSQL, Redis and S3 (SeaweedFS) containers, applies the real migrations
 * as the schema owner, then gives app_service_user a login so tests connect
 * exactly like production does (least privilege, subject to RLS).
 */
export default async function setup(project: TestProject) {
  const [postgres, redis, s3server] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('reksa')
      .withUsername('reksa_owner')
      .withPassword('owner_test_password')
      .start(),
    new RedisContainer('redis:7-alpine').start(),
    new GenericContainer(SEAWEEDFS_IMAGE)
      .withCopyContentToContainer([{ content: S3_IDENTITIES, target: '/etc/seaweedfs/s3.json' }])
      .withCommand(['server', '-s3', '-s3.config=/etc/seaweedfs/s3.json', '-dir=/data'])
      .withExposedPorts(8333)
      // Anonymous requests are refused once the S3 gateway is up and enforcing auth.
      .withWaitStrategy(Wait.forHttp('/', 8333).forStatusCode(403))
      .withStartupTimeout(120_000)
      .start(),
  ]);

  const s3Endpoint = `http://${s3server.getHost()}:${s3server.getMappedPort(8333)}`;
  const s3 = new S3Client({
    endpoint: s3Endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
  s3.destroy();

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
  project.provide('databaseUrl', `postgresql://app_service_user:${APP_DB_PASSWORD}@${postgres.getHost()}:${postgres.getPort()}/reksa`);
  project.provide('redisUrl', redis.getConnectionUrl());
  project.provide('storage', {
    endpoint: s3Endpoint,
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  });

  return async () => {
    await Promise.all([redis.stop(), postgres.stop(), s3server.stop()]);
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    ownerDatabaseUrl: string;
    redisUrl: string;
    storage: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  }
}
