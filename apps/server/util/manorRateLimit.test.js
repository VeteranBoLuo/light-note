import { createServer } from 'node:http';
import express from 'express';
import { it, expect } from 'vitest';
import { manorRateLimiter } from './manorRateLimit.js';

it('普通账号与 Root 使用相同预算，账号和读写独立，拒绝附带重试时间', async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = {
      id: req.headers['x-fixture-user'] || 'a',
      role: req.headers['x-fixture-role'] || 'user',
      isAuthenticated: true,
    };
    next();
  });
  app.get('/read', manorRateLimiter(2), (_req, res) => res.sendStatus(200));
  app.post('/command', manorRateLimiter(2), (_req, res) => res.sendStatus(200));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [id, role] of [
      ['a', 'user'],
      ['root', 'root'],
    ]) {
      const headers = { 'x-fixture-user': id, 'x-fixture-role': role };
      expect((await fetch(`${base}/read`, { headers })).status).toBe(200);
      expect((await fetch(`${base}/read`, { headers })).status).toBe(200);
      const rejected = await fetch(`${base}/read`, { headers });
      expect(rejected.status).toBe(429);
      expect(Number(rejected.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(await rejected.json()).toMatchObject({
        status: 429,
        data: { code: 'MANOR_RATE_LIMITED', retryAfter: 60 },
      });
      expect((await fetch(`${base}/command`, { method: 'POST', headers })).status).toBe(200);
    }
    expect((await fetch(`${base}/read`, { headers: { 'x-fixture-user': 'b' } })).status).toBe(200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
