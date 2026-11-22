import { createHash, randomUUID } from 'node:crypto';
import { AppError, BadRequestError, ConflictError, UnauthorizedError } from '../../common/errors/AppError.js';
import { REFRESH_TOKEN_TTL_SEC } from '../../common/utils/authCookies.js';
import { generateOpaqueToken, hmacSha256Hex } from '../../common/utils/crypto.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import type { PasswordHasher } from '../../common/utils/passwordHasher.js';
import { effectiveTier } from '../../common/utils/tier.js';
import type { EmailMessage, IEmailService } from '../../config/email.js';
import { maxBirthYear, needsAdultConfirmation, PRIVACY_VERSION, TERMS_VERSION } from '../../config/policies.js';
import type { AuthRepository, AuthTokenPurpose, ConsentRecord, UserRecord } from './auth.repository.js';
import type { AuthUserResponse, ConsentInput, LoginInput, RegisterInput } from './auth.schema.js';
import { resetPasswordMessage, verifyEmailMessage } from './authEmails.js';

export type AuthResult = {
  user: AuthUserResponse;
  accessToken: string;
  refreshToken: string;
};

export type SecurityEvent = 'REFRESH_TOKEN_REUSE' | 'LOGIN_FAILED' | 'PASSWORD_RESET' | 'PASSWORD_CHANGED';

export type AuthServiceDeps = {
  repo: AuthRepository;
  hasher: PasswordHasher;
  signer: AccessTokenSigner;
  /** Key for hashing refresh tokens before storage (JWT_REFRESH_SECRET). */
  refreshTokenKey: string;
  email: IEmailService;
  /** Origin frontend untuk tautan di email, tanpa garis miring di akhir. */
  appUrl: string;
  now?: () => Date;
  onSecurityEvent?: (event: SecurityEvent, data: Record<string, unknown>) => void;
  onWarning?: (message: string, data: Record<string, unknown>) => void;
};

const INVALID_CREDENTIALS = 'Email atau password salah';
const INVALID_LINK = 'Tautan tidak valid, sudah dipakai, atau sudah kedaluwarsa. Minta tautan baru.';

/** PRD FR-14: verifikasi 24 jam, reset password 30 menit. */
export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60_000;
export const PASSWORD_RESET_TTL_MS = 30 * 60_000;

/**
 * Token yang sudah dirotasi lalu muncul lagi dalam jendela ini adalah dua tab (atau permintaan ulang
 * jaringan) yang refresh bersamaan: ditolak dengan REFRESH_RACE tanpa mencabut sesi, karena pemenangnya
 * sudah memasang cookie baru di browser yang sama. Lewat dari jendela ini tetap dianggap token curian.
 * Jendela dibuat pendek supaya celah deteksi pencurian sekecil mungkin (Auth0 dan Okta memakai pola serupa).
 */
export const REFRESH_ROTATION_GRACE_MS = 10_000;

/** 401 khusus balapan refresh: controller tidak menghapus cookie, frontend cukup mengulang permintaannya. */
export class RefreshRaceError extends AppError {
  constructor() {
    super(401, 'REFRESH_RACE', 'Sesi baru saja diperbarui di tab lain');
  }
}

/** Token email 256 bit acak; SHA-256 tanpa kunci sudah cukup (tidak bisa ditebak dari hash). */
export function hashEmailToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Kode error batas usia; frontend memetakan keduanya ke field formulir. */
export const AGE_RESTRICTED = 'AGE_RESTRICTED';
export const ADULT_CONFIRMATION_REQUIRED = 'ADULT_CONFIRMATION_REQUIRED';

export class AuthService {
  private readonly now: () => Date;
  private dummyHash?: Promise<string>;

  constructor(private readonly deps: AuthServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    // Dicek sebelum Argon2 supaya input yang pasti ditolak tidak memakan CPU.
    const consent = this.buildConsent(input.birthYear, input.adultConfirmed);
    const passwordHash = await this.deps.hasher.hash(input.password);
    const user = await this.deps.repo.createUser({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
      ...consent,
    });
    // Pendaftaran tidak gagal hanya karena email verifikasi gagal dibuat; bisa dikirim ulang.
    await this.sendEmailToken(user, 'EMAIL_VERIFY').catch((err: unknown) =>
      this.deps.onWarning?.('Gagal menyiapkan email verifikasi', { userId: user.id, err }),
    );
    return this.issueSession(user);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.deps.repo.findUserByEmail(input.email);

    // Always run one Argon2 verification so response time does not reveal
    // whether the email exists.
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await this.deps.hasher.verify(hash, input.password);

    if (!user || !valid) {
      this.deps.onSecurityEvent?.('LOGIN_FAILED', { userExists: Boolean(user) });
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }
    return this.issueSession(user);
  }

  /**
   * Refresh token rotation with reuse detection (PRD §9.1).
   * A token that was already rotated or revoked and shows up again means it was
   * probably stolen: every session of that user is revoked.
   */
  async refresh(rawToken: string | undefined): Promise<AuthResult> {
    if (!rawToken) throw new UnauthorizedError();
    const tokenHash = this.hashRefreshToken(rawToken);

    const outcome = await this.deps.repo.withTransaction(async (tx) => {
      const token = await tx.findRefreshTokenByHashForUpdate(tokenHash);
      if (!token) return { kind: 'invalid' } as const;

      if (token.isRevoked) {
        if (token.rotatedAt && this.now().getTime() - token.rotatedAt.getTime() <= REFRESH_ROTATION_GRACE_MS) {
          return { kind: 'race' } as const;
        }
        await tx.revokeAllUserTokens(token.userId);
        return { kind: 'reuse', userId: token.userId, familyId: token.familyId } as const;
      }

      if (token.expiresAt.getTime() <= this.now().getTime()) {
        await tx.revokeRefreshToken(token.id);
        return { kind: 'invalid' } as const;
      }

      const user = await tx.findUserById(token.userId);
      if (!user) return { kind: 'invalid' } as const;

      await tx.markRefreshTokenRotated(token.id, this.now());
      const refreshToken = await this.storeNewRefreshToken(tx, user.id, token.familyId);
      return { kind: 'ok', user, refreshToken } as const;
    });

    if (outcome.kind === 'race') throw new RefreshRaceError();
    // Throw only after the transaction committed, so the revocation on reuse sticks.
    if (outcome.kind === 'reuse') {
      this.deps.onSecurityEvent?.('REFRESH_TOKEN_REUSE', { userId: outcome.userId, familyId: outcome.familyId });
      throw new UnauthorizedError('Sesi tidak valid, silakan login ulang');
    }
    if (outcome.kind === 'invalid') {
      throw new UnauthorizedError('Sesi tidak valid, silakan login ulang');
    }

    return {
      user: this.toPublicUser(outcome.user),
      accessToken: await this.deps.signer.sign({ userId: outcome.user.id, role: outcome.user.role }),
      refreshToken: outcome.refreshToken,
    };
  }

  /** Revokes the whole token family of this device. Idempotent. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const token = await this.deps.repo.findRefreshTokenByHash(this.hashRefreshToken(rawToken));
    if (token) await this.deps.repo.revokeFamily(token.familyId);
  }

  async getCurrentUser(userId: string): Promise<AuthUserResponse> {
    return this.toPublicUser(await this.requireUser(userId));
  }

  // ---------- FR-13: persetujuan ulang ----------

  /** Menyimpan persetujuan atas versi dokumen terbaru. Tahun lahir lama dipakai bila sudah ada. */
  async recordConsent(userId: string, input: ConsentInput): Promise<AuthUserResponse> {
    const user = await this.requireUser(userId);
    const birthYear = user.birthYear ?? input.birthYear;
    if (birthYear === undefined) throw new BadRequestError('Tahun lahir wajib diisi');
    const updated = await this.deps.repo.recordConsent(user.id, this.buildConsent(birthYear, input.adultConfirmed));
    if (!updated) throw new UnauthorizedError();
    return this.toPublicUser(updated);
  }

  // ---------- FR-14: verifikasi email ----------

  async verifyEmail(rawToken: string): Promise<void> {
    const now = this.now();
    const verified = await this.deps.repo.withTransaction(async (tx) => {
      const userId = await tx.consumeAuthToken(hashEmailToken(rawToken), 'EMAIL_VERIFY', now);
      if (!userId) return false;
      await tx.markEmailVerified(userId, now);
      await tx.deleteUnusedAuthTokens(userId, 'EMAIL_VERIFY');
      return true;
    });
    if (!verified) throw invalidLink();
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.requireUser(userId);
    if (user.emailVerifiedAt) throw new ConflictError('Email sudah terverifikasi');
    await this.sendEmailToken(user, 'EMAIL_VERIFY');
  }

  // ---------- FR-14: lupa password ----------

  /**
   * Hasilnya sama persis untuk email terdaftar maupun tidak (controller selalu menjawab 202).
   * Email dikirim tanpa ditunggu supaya lama respons tidak membocorkan keberadaan akun.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.deps.repo.findUserByEmail(email);
    if (!user) return;
    await this.sendEmailToken(user, 'PASSWORD_RESET');
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const now = this.now();
    // Hash dulu di luar transaksi: Argon2 lambat dan transaksi tidak boleh lama terbuka.
    const passwordHash = await this.deps.hasher.hash(newPassword);
    const userId = await this.deps.repo.withTransaction(async (tx) => {
      const id = await tx.consumeAuthToken(hashEmailToken(rawToken), 'PASSWORD_RESET', now);
      if (!id) return null;
      await tx.updatePasswordHash(id, passwordHash);
      // Bisa membuka tautan dari email = pemilik email itu.
      await tx.markEmailVerified(id, now);
      await tx.deleteUnusedAuthTokens(id, 'PASSWORD_RESET');
      await tx.deleteAllRefreshTokens(id);
      return id;
    });
    if (!userId) throw invalidLink();
    this.deps.onSecurityEvent?.('PASSWORD_RESET', { userId });
  }

  // ---------- FR-14: profil ----------

  async updateProfile(userId: string, fullName: string): Promise<AuthUserResponse> {
    const user = await this.deps.repo.updateFullName(userId, fullName);
    if (!user) throw new UnauthorizedError();
    return this.toPublicUser(user);
  }

  /**
   * Semua refresh token dicabut (perangkat lain keluar), lalu perangkat ini mendapat sesi baru.
   * Password lama salah dijawab 400, bukan 401: 401 membuat frontend mencoba refresh token.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthResult> {
    const user = await this.requireUser(userId);
    if (!(await this.deps.hasher.verify(user.passwordHash, currentPassword))) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Kata sandi lama salah');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestError('Kata sandi baru harus berbeda dari kata sandi lama');
    }
    const passwordHash = await this.deps.hasher.hash(newPassword);
    await this.deps.repo.withTransaction(async (tx) => {
      await tx.updatePasswordHash(user.id, passwordHash);
      await tx.deleteUnusedAuthTokens(user.id, 'PASSWORD_RESET');
      await tx.deleteAllRefreshTokens(user.id);
    });
    this.deps.onSecurityEvent?.('PASSWORD_CHANGED', { userId: user.id });
    return this.issueSession(user);
  }

  // ---------- internal ----------

  private async requireUser(userId: string): Promise<UserRecord> {
    const user = await this.deps.repo.findUserById(userId);
    if (!user) throw new UnauthorizedError();
    return user;
  }

  /** Token baru menggantikan token lama yang belum dipakai; email dikirim tanpa ditunggu. */
  private async sendEmailToken(user: UserRecord, purpose: AuthTokenPurpose): Promise<void> {
    const raw = generateOpaqueToken();
    const ttl = purpose === 'EMAIL_VERIFY' ? EMAIL_VERIFY_TTL_MS : PASSWORD_RESET_TTL_MS;
    await this.deps.repo.withTransaction(async (tx) => {
      await tx.deleteUnusedAuthTokens(user.id, purpose);
      await tx.createAuthToken({
        userId: user.id,
        purpose,
        tokenHash: hashEmailToken(raw),
        expiresAt: new Date(this.now().getTime() + ttl),
      });
    });
    const message =
      purpose === 'EMAIL_VERIFY'
        ? verifyEmailMessage(user.email, user.fullName, `${this.deps.appUrl}/verifikasi-email?token=${raw}`)
        : resetPasswordMessage(user.email, user.fullName, `${this.deps.appUrl}/atur-ulang-password?token=${raw}`);
    this.deliver(message, { userId: user.id, purpose });
  }

  private deliver(message: EmailMessage, context: Record<string, unknown>): void {
    void this.deps.email.send(message).catch((err: unknown) => {
      this.deps.onWarning?.('Gagal mengirim email', { ...context, err });
    });
  }

  private async issueSession(user: UserRecord): Promise<AuthResult> {
    const refreshToken = await this.storeNewRefreshToken(this.deps.repo, user.id, randomUUID());
    return {
      user: this.toPublicUser(user),
      accessToken: await this.deps.signer.sign({ userId: user.id, role: user.role }),
      refreshToken,
    };
  }

  private async storeNewRefreshToken(repo: AuthRepository, userId: string, familyId: string): Promise<string> {
    const raw = generateOpaqueToken();
    await repo.createRefreshToken({
      userId,
      familyId,
      tokenHash: this.hashRefreshToken(raw),
      expiresAt: new Date(this.now().getTime() + REFRESH_TOKEN_TTL_SEC * 1000),
    });
    return raw;
  }

  private hashRefreshToken(raw: string): string {
    return hmacSha256Hex(raw, this.deps.refreshTokenKey);
  }

  /**
   * FR-13 + batas usia 18 tahun (`policies.ts`). Lahir setelah `maxBirthYear` pasti di bawah 18 dan ditolak;
   * lahir tepat di tahun itu wajib menyatakan sudah 18. Kolom `guardian_consent` tidak dipakai lagi (selalu false).
   */
  private buildConsent(birthYear: number, adultConfirmed: boolean): ConsentRecord {
    const now = this.now();
    if (birthYear > maxBirthYear(now)) {
      throw new AppError(400, AGE_RESTRICTED, 'REKSA saat ini hanya untuk pengguna berusia 18 tahun ke atas.');
    }
    if (needsAdultConfirmation(birthYear, now) && !adultConfirmed) {
      throw new AppError(400, ADULT_CONFIRMATION_REQUIRED, 'Centang pernyataan bahwa kamu sudah berumur 18 tahun untuk melanjutkan.');
    }
    return {
      birthYear,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      consentedAt: now,
      guardianConsent: false,
    };
  }

  private toPublicUser(user: UserRecord): AuthUserResponse {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tier: effectiveTier(user.tier, user.proExpiresAt, this.now()),
      emailVerified: user.emailVerifiedAt !== null,
      proExpiresAt: user.proExpiresAt?.toISOString() ?? null,
      birthYear: user.birthYear,
      consentRequired: user.termsVersion !== TERMS_VERSION || user.privacyVersion !== PRIVACY_VERSION,
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.deps.hasher.hash(generateOpaqueToken());
    return this.dummyHash;
  }
}

function invalidLink(): AppError {
  return new AppError(400, 'INVALID_TOKEN', INVALID_LINK);
}
