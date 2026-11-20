import type { PrismaClient, TxClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ConflictError } from '../../common/errors/AppError.js';
import type { Role } from '../../common/utils/jwt.js';

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: Role;
  tier: 'FREE' | 'PRO';
};

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  familyId: string;
  isRevoked: boolean;
  expiresAt: Date;
};

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  /** Throws ConflictError when the email is already registered. */
  createUser(data: { email: string; passwordHash: string; fullName: string; role: Role }): Promise<UserRecord>;

  createRefreshToken(data: { userId: string; tokenHash: string; familyId: string; expiresAt: Date }): Promise<void>;
  /** Locks the row (SELECT ... FOR UPDATE) so two concurrent refreshes cannot both rotate it. */
  findRefreshTokenByHashForUpdate(tokenHash: string): Promise<RefreshTokenRecord | null>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(id: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;

  withTransaction<T>(fn: (repo: AuthRepository) => Promise<T>): Promise<T>;
}

const userSelect = {
  id: true,
  email: true,
  passwordHash: true,
  fullName: true,
  role: true,
  tier: true,
} as const;

export class PrismaAuthRepository implements AuthRepository {
  constructor(
    private readonly db: PrismaClient | TxClient,
    private readonly inTransaction = false,
  ) {}

  findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { email }, select: userSelect });
  }

  findUserById(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { id }, select: userSelect });
  }

  async createUser(data: { email: string; passwordHash: string; fullName: string; role: Role }): Promise<UserRecord> {
    try {
      return await this.db.user.create({ data, select: userSelect });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('Email sudah terdaftar');
      }
      throw err;
    }
  }

  async createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.db.refreshToken.create({ data });
  }

  async findRefreshTokenByHashForUpdate(tokenHash: string): Promise<RefreshTokenRecord | null> {
    // Prisma's query API has no FOR UPDATE; the tagged template is still parameterized.
    const rows = await this.db.$queryRaw<
      { id: string; user_id: string; family_id: string; is_revoked: boolean; expires_at: Date }[]
    >`SELECT id, user_id, family_id, is_revoked, expires_at
      FROM refresh_tokens
      WHERE token_hash = ${tokenHash}
      FOR UPDATE`;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          userId: row.user_id,
          familyId: row.family_id,
          isRevoked: row.is_revoked,
          expiresAt: new Date(row.expires_at),
        }
      : null;
  }

  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.db.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, familyId: true, isRevoked: true, expiresAt: true },
    });
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await this.db.refreshToken.update({ where: { id }, data: { isRevoked: true } });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db.refreshToken.updateMany({ where: { familyId, isRevoked: false }, data: { isRevoked: true } });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.db.refreshToken.updateMany({ where: { userId, isRevoked: false }, data: { isRevoked: true } });
  }

  withTransaction<T>(fn: (repo: AuthRepository) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this);
    return (this.db as PrismaClient).$transaction((tx) => fn(new PrismaAuthRepository(tx, true)));
  }
}
