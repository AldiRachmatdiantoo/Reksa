import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import type { Env } from './env.js';

/** PRD §9.1: file privat hanya lewat signed URL berumur maksimal 5 menit. */
export const SIGNED_URL_MAX_TTL_SEC = 300;

export const STORAGE_PREFIXES = ['materials', 'scans'] as const;
export type StoragePrefix = (typeof STORAGE_PREFIXES)[number];

const EXTENSIONS = ['pdf', 'webp', 'jpg', 'png'] as const;
export type StorageExtension = (typeof EXTENSIONS)[number];

/**
 * Allowed key format: `<prefix>/<ownerId>/<uuid>.<ext>`.
 * Keys are always built server-side by buildObjectKey(); this check stops any
 * user-supplied key (path traversal, overwriting someone else's file) from
 * reaching the bucket.
 */
const ObjectKeySchema = z
  .string()
  .regex(
    new RegExp(`^(${STORAGE_PREFIXES.join('|')})/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(${EXTENSIONS.join('|')})$`),
    'Object key tidak valid',
  );

export function buildObjectKey(prefix: StoragePrefix, ownerId: string, ext: StorageExtension): string {
  return ObjectKeySchema.parse(`${prefix}/${z.uuid().parse(ownerId)}/${randomUUID()}.${ext}`);
}

export function isValidObjectKey(key: string): boolean {
  return ObjectKeySchema.safeParse(key).success;
}

export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export type SignedUrlOptions = {
  /** Default dan batas atas: 300 detik. */
  expiresInSec?: number;
  /** `attachment` memaksa unduh; default `inline`. */
  disposition?: 'inline' | 'attachment';
};

/**
 * The only gateway to object storage: MinIO locally, Supabase Storage (S3
 * endpoint) in staging/production. Features must not create their own S3
 * client. Ownership checks (who may access which key) stay in feature services.
 */
export interface IStorageService {
  putObject(input: PutObjectInput): Promise<void>;
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  deleteObject(key: string): Promise<void>;
  /** Readiness check at startup. */
  checkConnection(): Promise<void>;
}

export type S3StorageConfig = {
  endpoint: string;
  /** Endpoint written into signed URLs (must be reachable by the browser). Defaults to `endpoint`. */
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Required for MinIO and Supabase Storage. */
  forcePathStyle: boolean;
};

export class S3StorageService implements IStorageService {
  private readonly client: S3Client;
  /** Presigning makes no network call; a second client only changes the host in the URL. */
  private readonly presignClient: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    const base = {
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    };
    this.client = new S3Client({ ...base, endpoint: config.endpoint });
    this.presignClient = new S3Client({ ...base, endpoint: config.publicEndpoint ?? config.endpoint });
  }

  async putObject({ key, body, contentType }: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: ObjectKeySchema.parse(key),
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  async getSignedUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    const requested = Math.floor(options.expiresInSec ?? SIGNED_URL_MAX_TTL_SEC);
    const expiresIn = Math.min(Math.max(1, requested), SIGNED_URL_MAX_TTL_SEC);
    return presign(
      this.presignClient,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: ObjectKeySchema.parse(key),
        ResponseContentDisposition: options.disposition ?? 'inline',
      }),
      { expiresIn },
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: ObjectKeySchema.parse(key) }));
  }

  async checkConnection(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
  }

  destroy(): void {
    this.client.destroy();
    this.presignClient.destroy();
  }
}

export function createStorageService(
  env: Pick<
    Env,
    | 'STORAGE_ENDPOINT'
    | 'STORAGE_PUBLIC_ENDPOINT'
    | 'STORAGE_REGION'
    | 'STORAGE_BUCKET'
    | 'STORAGE_ACCESS_KEY_ID'
    | 'STORAGE_SECRET_ACCESS_KEY'
    | 'STORAGE_FORCE_PATH_STYLE'
  >,
): S3StorageService {
  return new S3StorageService({
    endpoint: env.STORAGE_ENDPOINT,
    ...(env.STORAGE_PUBLIC_ENDPOINT ? { publicEndpoint: env.STORAGE_PUBLIC_ENDPOINT } : {}),
    region: env.STORAGE_REGION,
    bucket: env.STORAGE_BUCKET,
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
  });
}
