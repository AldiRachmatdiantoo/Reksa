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
  emailVerifiedAt: Date | null;
  birthYear: number | null;
  termsVersion: string | null;
  privacyVersion: string | null;
  guardianConsent: boolean;
  proExpiresAt: Date | null;
};

/** FR-13: catatan persetujuan yang disimpan saat daftar dan saat setuju ulang. */
export type ConsentRecord = {
  birthYear: number;
  termsVersion: string;
  privacyVersion: string;
  consentedAt: Date;
  guardianConsent: boolean;
};

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  familyId: string;
  isRevoked: boolean;
  /** Kapan token ini diganti lewat rotasi normal; null bila belum dirotasi atau dicabut dengan cara lain. */
  rotatedAt: Date | null;
  expiresAt: Date;
};

export type AuthTokenPurpose = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  /** Throws ConflictError when the email is already registered. */
  createUser(data: { email: string; passwordHash: string; fullName: string; role: Role } & ConsentRecord): Promise<UserRecord>;
  recordConsent(userId: string, consent: ConsentRecord): Promise<UserRecord | null>;
  updateFullName(userId: string, fullName: string): Promise<UserRecord | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  /** Hanya mengisi bila masih kosong, supaya tanggal verifikasi pertama tidak tertimpa. */
  markEmailVerified(userId: string, at: Date): Promise<void>;

  createRefreshToken(data: { userId: string; tokenHash: string; familyId: string; expiresAt: Date }): Promise<void>;
  /** Locks the row (SELECT ... FOR UPDATE) so two concurrent refreshes cannot both rotate it. */
  findRefreshTokenByHashForUpdate(tokenHash: string): Promise<RefreshTokenRecord | null>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(id: string): Promise<void>;
  /** Mencabut token karena sudah diganti token baru (rotasi), sambil mencatat waktunya. */
  markRefreshTokenRotated(id: string, at: Date): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;
  /**
   * Menghapus (bukan menandai revoked) semua refresh token user, untuk ganti/reset password.
   * Token terhapus yang muncul lagi dianggap "tidak dikenal", bukan reuse, jadi perangkat lama
   * hanya keluar dan tidak memicu pencabutan sesi baru milik user.
   */
  deleteAllRefreshTokens(userId: string): Promise<void>;

  createAuthToken(data: { userId: string; purpose: AuthTokenPurpose; tokenHash: string; expiresAt: Date }): Promise<void>;
  /** Token lama yang belum dipakai ikut mati saat token baru diterbitkan atau setelah salah satunya dipakai. */
  deleteUnusedAuthTokens(userId: string, purpose: AuthTokenPurpose): Promise<void>;
  /**
   * Menandai token terpakai secara atomik (satu UPDATE bersyarat), jadi dua permintaan bersamaan
   * dengan token yang sama tidak bisa sama-sama berhasil. Mengembalikan userId, atau null bila
   * token tidak ada, salah tujuan, sudah dipakai, atau kedaluwarsa.
   */
  consumeAuthToken(tokenHash: string, purpose: AuthTokenPurpose, now: Date): Promise<string | null>;

  withTransaction<T>(fn: (repo: AuthRepository) => Promise<T>): Promise<T>;
}

const userSelect = {
  id: true,
  email: true,
  passwordHash: true,
  fullName: true,
  role: true,
  tier: true,
  emailVerifiedAt: true,
  birthYear: true,
  termsVersion: true,
  privacyVersion: true,
  guardianConsent: true,
  proExpiresAt: true,
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

  async createUser(data: { email: string; passwordHash: string; fullName: string; role: Role } & ConsentRecord): Promise<UserRecord> {
    try {
      return await this.db.user.create({ data, select: userSelect });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('Email sudah terdaftar');
      }
      throw err;
    }
  }

  async updateFullName(userId: string, fullName: string): Promise<UserRecord | null> {
    const { count } = await this.db.user.updateMany({ where: { id: userId }, data: { fullName } });
    return count === 0 ? null : this.findUserById(userId);
  }

  async recordConsent(userId: string, consent: ConsentRecord): Promise<UserRecord | null> {
    const { count } = await this.db.user.updateMany({ where: { id: userId }, data: consent });
    return count === 0 ? null : this.findUserById(userId);
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async markEmailVerified(userId: string, at: Date): Promise<void> {
    await this.db.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: at } });
  }

  async createRefreshToken(data: { userId: string; tokenHash: string; familyId: string; expiresAt: Date }): Promise<void> {
    await this.db.refreshToken.create({ data });
  }

  async findRefreshTokenByHashForUpdate(tokenHash: string): Promise<RefreshTokenRecord | null> {
    // Prisma's query API has no FOR UPDATE; the tagged template is still parameterized.
    const rows = await this.db.$queryRaw<
      { id: string; user_id: string; family_id: string; is_revoked: boolean; rotated_at: Date | null; expires_at: Date }[]
    >`SELECT id, user_id, family_id, is_revoked, rotated_at, expires_at
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
          rotatedAt: row.rotated_at ? new Date(row.rotated_at) : null,
          expiresAt: new Date(row.expires_at),
        }
      : null;
  }

  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.db.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, familyId: true, isRevoked: true, rotatedAt: true, expiresAt: true },
    });
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await this.db.refreshToken.update({ where: { id }, data: { isRevoked: true } });
  }

  async markRefreshTokenRotated(id: string, at: Date): Promise<void> {
    await this.db.refreshToken.update({ where: { id }, data: { isRevoked: true, rotatedAt: at } });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db.refreshToken.updateMany({ where: { familyId, isRevoked: false }, data: { isRevoked: true } });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.db.refreshToken.updateMany({ where: { userId, isRevoked: false }, data: { isRevoked: true } });
  }

  async deleteAllRefreshTokens(userId: string): Promise<void> {
    await this.db.refreshToken.deleteMany({ where: { userId } });
  }

  async createAuthToken(data: { userId: string; purpose: AuthTokenPurpose; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.db.authToken.create({ data });
  }

  async deleteUnusedAuthTokens(userId: string, purpose: AuthTokenPurpose): Promise<void> {
    await this.db.authToken.deleteMany({ where: { userId, purpose, usedAt: null } });
  }

  async consumeAuthToken(tokenHash: string, purpose: AuthTokenPurpose, now: Date): Promise<string | null> {
    const { count } = await this.db.authToken.updateMany({
      where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count === 0) return null;
    const token = await this.db.authToken.findUnique({ where: { tokenHash }, select: { userId: true } });
    return token?.userId ?? null;
  }

  withTransaction<T>(fn: (repo: AuthRepository) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this);
    return (this.db as PrismaClient).$transaction((tx) => fn(new PrismaAuthRepository(tx, true)));
  }
}
