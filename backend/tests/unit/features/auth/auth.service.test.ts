import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, BadRequestError, ConflictError, UnauthorizedError } from '../../../../src/common/errors/AppError.js';
import { AccessTokenSigner } from '../../../../src/common/utils/jwt.js';
import type { PasswordHasher } from '../../../../src/common/utils/passwordHasher.js';
import type {
  AuthRepository,
  AuthTokenPurpose,
  RefreshTokenRecord,
  UserRecord,
} from '../../../../src/features/auth/auth.repository.js';
import {
  AuthService,
  EMAIL_VERIFY_TTL_MS,
  hashEmailToken,
  PASSWORD_RESET_TTL_MS,
  type SecurityEvent,
} from '../../../../src/features/auth/auth.service.js';
import { MemoryEmailService } from '../../../support/memoryEmail.js';

/** Fast, deterministic stand-in for Argon2. */
const fakeHasher: PasswordHasher = {
  hash: async (pw) => `hashed:${pw}`,
  verify: async (hash, pw) => hash === `hashed:${pw}`,
};

type StoredToken = RefreshTokenRecord & { tokenHash: string };
type StoredAuthToken = { userId: string; purpose: AuthTokenPurpose; tokenHash: string; expiresAt: Date; usedAt: Date | null };

class InMemoryAuthRepository implements AuthRepository {
  users: UserRecord[] = [];
  tokens: StoredToken[] = [];
  authTokens: StoredAuthToken[] = [];

  async findUserByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async findUserById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async createUser(data: Omit<UserRecord, 'id' | 'tier' | 'emailVerifiedAt'>) {
    if (this.users.some((u) => u.email === data.email)) throw new ConflictError('Email sudah terdaftar');
    const user: UserRecord = { id: randomUUID(), tier: 'FREE', emailVerifiedAt: null, ...data };
    this.users.push(user);
    return user;
  }
  async updateFullName(userId: string, fullName: string) {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return null;
    user.fullName = fullName;
    return user;
  }
  async updatePasswordHash(userId: string, passwordHash: string) {
    const user = this.users.find((u) => u.id === userId);
    if (user) user.passwordHash = passwordHash;
  }
  async markEmailVerified(userId: string, at: Date) {
    const user = this.users.find((u) => u.id === userId);
    if (user && !user.emailVerifiedAt) user.emailVerifiedAt = at;
  }
  async createAuthToken(data: Omit<StoredAuthToken, 'usedAt'>) {
    this.authTokens.push({ ...data, usedAt: null });
  }
  async deleteUnusedAuthTokens(userId: string, purpose: AuthTokenPurpose) {
    this.authTokens = this.authTokens.filter((t) => !(t.userId === userId && t.purpose === purpose && !t.usedAt));
  }
  async consumeAuthToken(tokenHash: string, purpose: AuthTokenPurpose, now: Date) {
    const t = this.authTokens.find(
      (x) => x.tokenHash === tokenHash && x.purpose === purpose && !x.usedAt && x.expiresAt > now,
    );
    if (!t) return null;
    t.usedAt = now;
    return t.userId;
  }
  async createRefreshToken(data: { userId: string; tokenHash: string; familyId: string; expiresAt: Date }) {
    this.tokens.push({ id: randomUUID(), isRevoked: false, ...data });
  }
  async findRefreshTokenByHashForUpdate(tokenHash: string) {
    return this.tokens.find((t) => t.tokenHash === tokenHash) ?? null;
  }
  async findRefreshTokenByHash(tokenHash: string) {
    return this.tokens.find((t) => t.tokenHash === tokenHash) ?? null;
  }
  async revokeRefreshToken(id: string) {
    this.tokens.filter((t) => t.id === id).forEach((t) => (t.isRevoked = true));
  }
  async revokeFamily(familyId: string) {
    this.tokens.filter((t) => t.familyId === familyId).forEach((t) => (t.isRevoked = true));
  }
  async revokeAllUserTokens(userId: string) {
    this.tokens.filter((t) => t.userId === userId).forEach((t) => (t.isRevoked = true));
  }
  async deleteAllRefreshTokens(userId: string) {
    this.tokens = this.tokens.filter((t) => t.userId !== userId);
  }
  withTransaction<T>(fn: (repo: AuthRepository) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const signer = new AccessTokenSigner('a'.repeat(32));
const registerInput = {
  email: 'siswa@reksa.id',
  password: 'PasswordKuat123',
  fullName: 'Siswa Satu',
  role: 'STUDENT' as const,
};

describe('AuthService', () => {
  let repo: InMemoryAuthRepository;
  let events: { event: SecurityEvent; data: Record<string, unknown> }[];
  let now: Date;
  let mail: MemoryEmailService;
  let service: AuthService;

  beforeEach(() => {
    repo = new InMemoryAuthRepository();
    mail = new MemoryEmailService();
    events = [];
    now = new Date('2026-11-20T10:00:00Z');
    service = new AuthService({
      repo,
      hasher: fakeHasher,
      signer,
      refreshTokenKey: 'b'.repeat(32),
      email: mail,
      appUrl: 'https://app.reksa.test',
      now: () => now,
      onSecurityEvent: (event, data) => events.push({ event, data }),
    });
  });

  describe('register', () => {
    it('stores a hashed password and returns a session without the hash', async () => {
      const result = await service.register(registerInput);

      expect(repo.users[0]?.passwordHash).toBe('hashed:PasswordKuat123');
      expect(result.user).toEqual({
        id: repo.users[0]?.id,
        email: 'siswa@reksa.id',
        fullName: 'Siswa Satu',
        role: 'STUDENT',
        tier: 'FREE',
        emailVerified: false,
      });
      expect(JSON.stringify(result.user)).not.toContain('hashed');
      expect(await signer.verify(result.accessToken)).toEqual({ userId: result.user.id, role: 'STUDENT' });
    });

    it('stores only the hash of the refresh token, never the raw value', async () => {
      const result = await service.register(registerInput);
      expect(repo.tokens).toHaveLength(1);
      expect(repo.tokens[0]?.tokenHash).not.toBe(result.refreshToken);
      expect(repo.tokens[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('sets the refresh token to expire in 7 days', async () => {
      await service.register(registerInput);
      expect(repo.tokens[0]?.expiresAt.toISOString()).toBe('2026-11-27T10:00:00.000Z');
    });

    it('rejects a duplicate email', async () => {
      await service.register(registerInput);
      await expect(service.register(registerInput)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('login', () => {
    it('returns a new session for valid credentials', async () => {
      await service.register(registerInput);
      const result = await service.login({ email: registerInput.email, password: registerInput.password });
      expect(result.user.email).toBe(registerInput.email);
      expect(repo.tokens).toHaveLength(2);
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      await service.register(registerInput);
      const wrongPassword = service.login({ email: registerInput.email, password: 'SalahBanget123' });
      const unknownEmail = service.login({ email: 'tidak.ada@reksa.id', password: 'SalahBanget123' });

      await expect(wrongPassword).rejects.toThrow('Email atau password salah');
      await expect(unknownEmail).rejects.toThrow('Email atau password salah');
    });

    it('still runs a password verification when the email does not exist (timing)', async () => {
      const verify = vi.spyOn(fakeHasher, 'verify');
      await expect(service.login({ email: 'tidak.ada@reksa.id', password: 'x' })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      expect(verify).toHaveBeenCalledTimes(1);
      verify.mockRestore();
    });
  });

  describe('refresh', () => {
    it('rotates the token: old one revoked, new one in the same family', async () => {
      const first = await service.register(registerInput);
      const second = await service.refresh(first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(repo.tokens).toHaveLength(2);
      expect(repo.tokens[0]?.isRevoked).toBe(true);
      expect(repo.tokens[1]?.isRevoked).toBe(false);
      expect(repo.tokens[1]?.familyId).toBe(repo.tokens[0]?.familyId);
    });

    it('detects reuse of a rotated token and revokes every session of the user', async () => {
      const first = await service.register(registerInput);
      await service.login({ email: registerInput.email, password: registerInput.password }); // second device
      await service.refresh(first.refreshToken);

      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);

      expect(repo.tokens.every((t) => t.isRevoked)).toBe(true);
      expect(events.map((e) => e.event)).toContain('REFRESH_TOKEN_REUSE');
    });

    it('rejects an expired token', async () => {
      const first = await service.register(registerInput);
      now = new Date('2026-11-27T10:00:01Z');
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects an unknown or missing token', async () => {
      await expect(service.refresh('tidak-dikenal')).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(service.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe('logout', () => {
    it('revokes the whole family of the current device only', async () => {
      const deviceA = await service.register(registerInput);
      const deviceB = await service.login({ email: registerInput.email, password: registerInput.password });
      const rotatedA = await service.refresh(deviceA.refreshToken);

      await service.logout(rotatedA.refreshToken);

      const familyA = repo.tokens[0]?.familyId;
      expect(repo.tokens.filter((t) => t.familyId === familyA).every((t) => t.isRevoked)).toBe(true);
      await expect(service.refresh(deviceB.refreshToken)).resolves.toBeDefined();
    });

    it('treats a replayed token after logout as reuse and revokes all sessions', async () => {
      const deviceA = await service.register(registerInput);
      await service.login({ email: registerInput.email, password: registerInput.password });

      await service.logout(deviceA.refreshToken);
      await expect(service.refresh(deviceA.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);

      expect(repo.tokens.every((t) => t.isRevoked)).toBe(true);
    });

    it('is a no-op without a token', async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();
    });
  });

  describe('getCurrentUser', () => {
    it('returns the public profile', async () => {
      const { user } = await service.register(registerInput);
      await expect(service.getCurrentUser(user.id)).resolves.toEqual(user);
    });

    it('rejects a user that no longer exists', async () => {
      await expect(service.getCurrentUser(randomUUID())).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe('email verification (FR-14)', () => {
    const token = () => mail.tokenFor('siswa@reksa.id', 'verifikasi-email');

    it('sends a verification link on register and stores only the token hash', async () => {
      await service.register(registerInput);

      const raw = token();
      expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(mail.lastTo('siswa@reksa.id')?.text).toContain(`https://app.reksa.test/verifikasi-email?token=${raw}`);
      expect(repo.authTokens).toEqual([
        expect.objectContaining({ purpose: 'EMAIL_VERIFY', tokenHash: hashEmailToken(raw), usedAt: null }),
      ]);
      expect(repo.authTokens[0]?.expiresAt.getTime()).toBe(now.getTime() + EMAIL_VERIFY_TTL_MS);
      expect(JSON.stringify(repo.authTokens)).not.toContain(raw);
    });

    it('still registers when the email cannot be sent', async () => {
      mail.failNext = true;
      const warnings: string[] = [];
      service = new AuthService({
        repo, hasher: fakeHasher, signer, refreshTokenKey: 'b'.repeat(32), email: mail, appUrl: 'x',
        onWarning: (m) => warnings.push(m),
      });
      await expect(service.register(registerInput)).resolves.toBeDefined();
      await vi.waitFor(() => expect(warnings).toContain('Gagal mengirim email'));
    });

    it('verifies once; the same link cannot be used twice', async () => {
      const { user } = await service.register(registerInput);
      const raw = token();

      await service.verifyEmail(raw);
      expect((await service.getCurrentUser(user.id)).emailVerified).toBe(true);
      await expect(service.verifyEmail(raw)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TOKEN' });
    });

    it('rejects an expired link and a reset token used for verification', async () => {
      await service.register(registerInput);
      const raw = token();
      now = new Date(now.getTime() + EMAIL_VERIFY_TTL_MS + 1);
      await expect(service.verifyEmail(raw)).rejects.toBeInstanceOf(AppError);

      await service.requestPasswordReset('siswa@reksa.id');
      const reset = mail.tokenFor('siswa@reksa.id', 'atur-ulang-password');
      await expect(service.verifyEmail(reset)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    });

    it('resending replaces the previous link', async () => {
      const { user } = await service.register(registerInput);
      const first = token();
      await service.resendVerification(user.id);
      const second = token();

      expect(second).not.toBe(first);
      await expect(service.verifyEmail(first)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
      await service.verifyEmail(second);
    });

    it('refuses to resend once verified', async () => {
      const { user } = await service.register(registerInput);
      await service.verifyEmail(token());
      await expect(service.resendVerification(user.id)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('password reset (FR-14)', () => {
    const token = () => mail.tokenFor('siswa@reksa.id', 'atur-ulang-password');

    it('does nothing for an unknown email (no token, no email)', async () => {
      await service.requestPasswordReset('tidak-ada@reksa.id');
      expect(repo.authTokens).toEqual([]);
      expect(mail.sent).toEqual([]);
    });

    it('resets the password, revokes every session, and marks the email verified', async () => {
      const { user } = await service.register(registerInput);
      await service.login({ email: registerInput.email, password: registerInput.password });
      await service.requestPasswordReset('siswa@reksa.id');
      expect(repo.authTokens.find((t) => t.purpose === 'PASSWORD_RESET')?.expiresAt.getTime()).toBe(
        now.getTime() + PASSWORD_RESET_TTL_MS,
      );

      await service.resetPassword(token(), 'PasswordBaru456');

      expect(repo.users[0]?.passwordHash).toBe('hashed:PasswordBaru456');
      expect(repo.tokens).toEqual([]);
      expect((await service.getCurrentUser(user.id)).emailVerified).toBe(true);
      expect(events.map((e) => e.event)).toContain('PASSWORD_RESET');
      await expect(service.login({ email: registerInput.email, password: registerInput.password })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it('rejects a reused or expired reset link without changing the password', async () => {
      await service.register(registerInput);
      await service.requestPasswordReset('siswa@reksa.id');
      const raw = token();
      await service.resetPassword(raw, 'PasswordBaru456');
      await expect(service.resetPassword(raw, 'PasswordLain789')).rejects.toMatchObject({ code: 'INVALID_TOKEN' });

      await service.requestPasswordReset('siswa@reksa.id');
      const late = token();
      now = new Date(now.getTime() + PASSWORD_RESET_TTL_MS + 1);
      await expect(service.resetPassword(late, 'PasswordLain789')).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
      expect(repo.users[0]?.passwordHash).toBe('hashed:PasswordBaru456');
    });
  });

  describe('profile and password change (FR-14)', () => {
    it('updates the full name', async () => {
      const { user } = await service.register(registerInput);
      await expect(service.updateProfile(user.id, 'Nama Baru')).resolves.toMatchObject({ fullName: 'Nama Baru' });
    });

    it('requires the current password and signs out other devices', async () => {
      const { user, refreshToken: otherDevice } = await service.register(registerInput);

      await expect(service.changePassword(user.id, 'salah', 'PasswordBaru456')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_CURRENT_PASSWORD',
      });

      const result = await service.changePassword(user.id, registerInput.password, 'PasswordBaru456');

      expect(repo.users[0]?.passwordHash).toBe('hashed:PasswordBaru456');
      // Perangkat lain keluar, dan percobaan refresh-nya tidak dianggap reuse yang ikut mencabut sesi baru ini.
      await expect(service.refresh(otherDevice)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(events.map((e) => e.event)).not.toContain('REFRESH_TOKEN_REUSE');
      await expect(service.refresh(result.refreshToken)).resolves.toBeDefined();
    });

    it('rejects a new password equal to the old one', async () => {
      const { user } = await service.register(registerInput);
      await expect(service.changePassword(user.id, registerInput.password, registerInput.password)).rejects.toBeInstanceOf(
        BadRequestError,
      );
    });
  });
});
