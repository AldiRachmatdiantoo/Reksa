import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { buildObjectKey } from '../../src/config/storage.js';
import { createTestContext } from '../support/testContext.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

const owner = randomUUID();
const body = Buffer.from('fake-webp-bytes');

describe('S3StorageService against a real S3 bucket', () => {
  it('connects to the bucket', async () => {
    await expect(ctx.storage.checkConnection()).resolves.toBeUndefined();
  });

  it('stores an object and serves it through a signed URL', async () => {
    const key = buildObjectKey('scans', owner, 'webp');
    await ctx.storage.putObject({ key, body, contentType: 'image/webp' });

    const res = await fetch(await ctx.storage.getSignedUrl(key));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('content-disposition')).toBe('inline');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(body);
  });

  it('the bucket is private: the same URL without a signature is refused', async () => {
    const key = buildObjectKey('scans', owner, 'webp');
    await ctx.storage.putObject({ key, body, contentType: 'image/webp' });

    const signed = new URL(await ctx.storage.getSignedUrl(key));
    const unsigned = `${signed.origin}${signed.pathname}`;
    expect((await fetch(unsigned)).status).toBe(403);
  });

  it('a tampered signed URL is refused', async () => {
    const key = buildObjectKey('scans', owner, 'webp');
    const other = buildObjectKey('scans', owner, 'webp');
    await ctx.storage.putObject({ key: other, body, contentType: 'image/webp' });

    // Reuse a valid signature for key A to try to read key B.
    const signed = new URL(await ctx.storage.getSignedUrl(key));
    signed.pathname = signed.pathname.replace(key, other);
    expect((await fetch(signed)).status).toBe(403);
  });

  it('an expired signed URL is refused', async () => {
    const key = buildObjectKey('scans', owner, 'webp');
    await ctx.storage.putObject({ key, body, contentType: 'image/webp' });

    const url = await ctx.storage.getSignedUrl(key, { expiresInSec: 1 });
    await new Promise((r) => setTimeout(r, 2_100));
    expect((await fetch(url)).status).toBe(403);
  });

  it('can force a download with Content-Disposition: attachment', async () => {
    const key = buildObjectKey('materials', owner, 'pdf');
    await ctx.storage.putObject({ key, body, contentType: 'application/pdf' });

    const res = await fetch(await ctx.storage.getSignedUrl(key, { disposition: 'attachment' }));
    expect(res.headers.get('content-disposition')).toBe('attachment');
  });

  it('deletes an object', async () => {
    const key = buildObjectKey('materials', owner, 'pdf');
    await ctx.storage.putObject({ key, body, contentType: 'application/pdf' });
    await ctx.storage.deleteObject(key);

    expect((await fetch(await ctx.storage.getSignedUrl(key))).status).toBe(404);
  });

  it('reads an object back into memory, bounded by maxBytes', async () => {
    const key = buildObjectKey('scans', owner, 'webp');
    await ctx.storage.putObject({ key, body, contentType: 'image/webp' });

    await expect(ctx.storage.getObject(key, 1024)).resolves.toEqual(body);
    await expect(ctx.storage.getObject(key, body.length - 1)).rejects.toThrow(/melebihi batas/);
    await expect(ctx.storage.getObject('../../etc/passwd', 1024)).rejects.toThrow();
  });

  it('refuses to write to a key that was not built by buildObjectKey', async () => {
    await expect(
      ctx.storage.putObject({ key: '../../evil.pdf', body, contentType: 'application/pdf' }),
    ).rejects.toThrow();
  });
});
