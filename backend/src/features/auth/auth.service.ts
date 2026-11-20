import { randomUUID } from 'node:crypto';
import { UnauthorizedError } from '../../common/errors/AppError.js';
import { REFRESH_TOKEN_TTL_SEC } from '../../common/utils/authCookies.js';
import { generateOpaqueToken, hmacSha256Hex } from '../../common/utils/crypto.js';
import type { AccessTokenSigner } from '../../common/utils/jwt.js';
import type { PasswordHasher } from '../../common/utils/passwordHasher.js';
import type { AuthRepository, UserRecord } from './auth.repository.js';
import type { AuthUserResponse, LoginInput, RegisterInput } from './auth.schema.js';

export type AuthResult = {
  user: AuthUserResponse;
  accessToken: string;
  refreshToken: string;
};

export type SecurityEvent = 'REFRESH_TOKEN_REUSE' | 'LOGIN_FAILED';

export type AuthServiceDeps = {
  repo: AuthRepository;
  hasher: PasswordHasher;
  signer: AccessTokenSigner;
  /** Key for hashing refresh tokens before storage (JWT_REFRESH_SECRET). */
  refreshTokenKey: string;
  now?: () => Date;
  onSecurityEvent?: (event: SecurityEvent, data: Record<string, unknown>) => void;
};

const INVALID_CREDENTIALS = 'Email atau password salah';

export class AuthService {
  private readonly now: () => Date;
  private dummyHash?: Promise<string>;

  constructor(private readonly deps: AuthServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    const passwordHash = await this.deps.hasher.hash(input.password);
    const user = await this.deps.repo.createUser({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
    });
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
        await tx.revokeAllUserTokens(token.userId);
        return { kind: 'reuse', userId: token.userId, familyId: token.familyId } as const;
      }

      if (token.expiresAt.getTime() <= this.now().getTime()) {
        await tx.revokeRefreshToken(token.id);
        return { kind: 'invalid' } as const;
      }

      const user = await tx.findUserById(token.userId);
      if (!user) return { kind: 'invalid' } as const;

      await tx.revokeRefreshToken(token.id);
      const refreshToken = await this.storeNewRefreshToken(tx, user.id, token.familyId);
      return { kind: 'ok', user, refreshToken } as const;
    });

    // Throw only after the transaction committed, so the revocation on reuse sticks.
    if (outcome.kind === 'reuse') {
      this.deps.onSecurityEvent?.('REFRESH_TOKEN_REUSE', { userId: outcome.userId, familyId: outcome.familyId });
      throw new UnauthorizedError('Sesi tidak valid, silakan login ulang');
    }
    if (outcome.kind === 'invalid') {
      throw new UnauthorizedError('Sesi tidak valid, silakan login ulang');
    }

    return {
      user: toPublicUser(outcome.user),
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
    const user = await this.deps.repo.findUserById(userId);
    if (!user) throw new UnauthorizedError();
    return toPublicUser(user);
  }

  private async issueSession(user: UserRecord): Promise<AuthResult> {
    const refreshToken = await this.storeNewRefreshToken(this.deps.repo, user.id, randomUUID());
    return {
      user: toPublicUser(user),
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

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.deps.hasher.hash(generateOpaqueToken());
    return this.dummyHash;
  }
}

function toPublicUser(user: UserRecord): AuthUserResponse {
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, tier: user.tier };
}
