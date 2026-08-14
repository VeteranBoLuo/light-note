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
