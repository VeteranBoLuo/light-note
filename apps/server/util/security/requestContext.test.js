import { describe, expect, it } from 'vitest';
import { shouldSkipSecurity } from './requestContext.js';

describe('请求安全检测精确例外', () => {
  it('只跳过爱发电 Webhook 的精确 POST 路径', () => {
    expect(shouldSkipSecurity({ method: 'POST', path: '/support/afdian/webhook' })).toBe(true);
    expect(shouldSkipSecurity({ method: 'POST', originalUrl: '/api/support/afdian/webhook?retry=1' })).toBe(true);
    expect(shouldSkipSecurity({ method: 'GET', path: '/support/afdian/webhook' })).toBe(false);
    expect(shouldSkipSecurity({ method: 'POST', path: '/support/afdian/oauth/unlink' })).toBe(false);
    expect(shouldSkipSecurity({ method: 'POST', path: '/support/afdian/webhook/evil' })).toBe(false);
  });
});

it('浏览器订阅仅在日志摘要中隐藏凭据，原始检测输入仍然保留', async () => {
  const { buildRequestContext } = await import('./requestContext.js');
  const body = {
    subscription: { endpoint: 'sensitive-endpoint', keys: { auth: 'private-auth', p256dh: 'private-key' } },
  };
  const context = buildRequestContext({ method: 'POST', path: '/notification/browser/subscribe', headers: {}, body });
  expect(context.body).toBe(body);
  expect(JSON.stringify(context.payloadSummary)).not.toContain('sensitive-endpoint');
  expect(JSON.stringify(context.payloadSummary)).not.toContain('private-auth');
  expect(shouldSkipSecurity({ method: 'POST', path: '/notification/browser/subscribe' })).toBe(false);
});
