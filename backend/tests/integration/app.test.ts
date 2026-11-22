import { Router } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const app = createApp({
  env: { CORS_ORIGIN: 'http://localhost:8080', NODE_ENV: 'test' },
  logger: pino({ level: 'silent' }),
});

describe('app skeleton', () => {
  it('GET /api/v1/health returns ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('sets Helmet security headers and hides x-powered-by', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/tidak-ada');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 without a stack trace for malformed JSON', async () => {
    const res = await request(app).post('/api/v1/health').set('Content-Type', 'application/json').send('{"broken":');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });

  it('rejects JSON bodies over 100kb', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(120 * 1024) }));
    expect(res.status).toBe(413);
  });

  it('only allows the configured CORS origin', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});

describe('client IP behind proxies (TRUST_PROXY_HOPS)', () => {
  const echo = Router().get('/', (req, res) => void res.json({ ip: req.ip }));
  const behind = (hops: number) =>
    createApp({
      env: { CORS_ORIGIN: 'http://localhost:8080', NODE_ENV: 'test', TRUST_PROXY_HOPS: hops },
      logger: pino({ level: 'silent' }),
      routes: { '/ip': echo },
    });

  it('takes the client address added by the first of two proxies, ignoring anything the client wrote before it', async () => {
    // Klien memalsukan 6.6.6.6; rewrite Vercel menambahkan IP klien asli (198.51.100.7), lalu IP-nya sendiri ditambahkan sebelum Render.
    const res = await request(behind(2)).get('/api/v1/ip').set('X-Forwarded-For', '6.6.6.6, 198.51.100.7, 203.0.113.1');
    expect(res.body.ip).toBe('198.51.100.7');
  });

  it('with one hop (local Nginx) uses the last forwarded address', async () => {
    const res = await request(behind(1)).get('/api/v1/ip').set('X-Forwarded-For', '6.6.6.6, 198.51.100.7');
    expect(res.body.ip).toBe('198.51.100.7');
  });
});
