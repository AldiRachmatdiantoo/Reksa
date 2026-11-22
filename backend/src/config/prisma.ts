import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';
import { buildPgPoolConfig, type DatabaseSslCa } from './dbTls.js';

export type { PrismaClient };
export type TxClient = Prisma.TransactionClient;

/** The app connects as app_service_user (least privilege, subject to RLS). */
export function createPrismaClient(databaseUrl: string, sslCa: DatabaseSslCa = 'system'): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(buildPgPoolConfig(databaseUrl, sslCa)),
    log: [
      { level: 'warn', emit: 'stdout' },
      { level: 'error', emit: 'stdout' },
    ],
  });
}

const UserIdSchema = z.uuid();

/**
 * Runs `fn` inside a transaction scoped to one user, so PostgreSQL RLS policies
 * (which read `app.current_user_id`) apply to every query in it.
 *
 * `set_config(..., true)` is transaction-local, so the value never leaks to
 * another request through the connection pool. It is passed as a bound
 * parameter: SET LOCAL cannot take parameters and would force string building.
 *
 * Repositories must still filter by owner explicitly; RLS is the second layer.
 */
export async function withUserContext<T>(
  prisma: PrismaClient,
  userId: string,
  fn: (tx: TxClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeoutMs?: number },
): Promise<T> {
  const safeUserId = UserIdSchema.parse(userId);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.current_user_id', ${safeUserId}, true)`;
      return fn(tx);
    },
    {
      ...(options?.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
      timeout: options?.timeoutMs ?? 10_000,
    },
  );
}
