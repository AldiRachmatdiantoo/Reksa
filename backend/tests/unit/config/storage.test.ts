import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildObjectKey,
  isValidObjectKey,
  S3StorageService,
  SIGNED_URL_MAX_TTL_SEC,
} from '../../../src/config/storage.js';

const owner = randomUUID();

const storage = new S3StorageService({
  endpoint: 'http://storage:8333',
  publicEndpoint: 'http://localhost:8333',
  region: 'us-east-1',
  bucket: 'reksa-private',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  forcePathStyle: true,
});

describe('buildObjectKey', () => {
  it('builds <prefix>/<ownerId>/<uuid>.<ext>', () => {
    const key = buildObjectKey('scans', owner, 'webp');
    expect(key).toMatch(new RegExp(`^scans/${owner}/[0-9a-f-]{36}\\.webp$`));
  });

  it('generates a unique key each time', () => {
    expect(buildObjectKey('materials', owner, 'pdf')).not.toBe(buildObjectKey('materials', owner, 'pdf'));
  });

  it('rejects a non-UUID owner id', () => {
    expect(() => buildObjectKey('scans', '../../etc', 'jpg')).toThrow();
  });
});

describe('isValidObjectKey', () => {
  it.each([
    '../materials/x.pdf',
    `scans/${owner}/../../secret.pdf`,
    `scans/${owner}/${randomUUID()}.exe`,
    `other/${owner}/${randomUUID()}.pdf`,
    `/scans/${owner}/${randomUUID()}.pdf`,
    '',
  ])('rejects %j', (key) => {
    expect(isValidObjectKey(key)).toBe(false);
  });
});

describe('S3StorageService.getSignedUrl', () => {
  const key = buildObjectKey('scans', owner, 'webp');

  it('signs against the public endpoint, not the internal one', async () => {
    const url = new URL(await storage.getSignedUrl(key));
    expect(url.host).toBe('localhost:8333');
    expect(url.pathname).toBe(`/reksa-private/${key}`);
  });

  it('defaults to and caps expiry at 300 seconds', async () => {
    const def = new URL(await storage.getSignedUrl(key));
    const tooLong = new URL(await storage.getSignedUrl(key, { expiresInSec: 86_400 }));
    expect(def.searchParams.get('X-Amz-Expires')).toBe(String(SIGNED_URL_MAX_TTL_SEC));
    expect(tooLong.searchParams.get('X-Amz-Expires')).toBe(String(SIGNED_URL_MAX_TTL_SEC));
  });

  it('allows a shorter expiry', async () => {
    const url = new URL(await storage.getSignedUrl(key, { expiresInSec: 60 }));
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
  });

  it('refuses to sign an invalid key', async () => {
    await expect(storage.getSignedUrl('../../etc/passwd')).rejects.toThrow();
  });
});
