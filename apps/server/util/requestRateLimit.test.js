import { describe, expect, it } from 'vitest';
import { getGlobalRateLimit, getGlobalRateLimitKey } from './requestRateLimit.js';

const limits = { visitor: 30, authenticated: 60, root: 120 };

describe('global request rate limit', () => {
  it('uses the visitor limit and IP key for anonymous requests', () => {
    const req = { ip: '203.0.113.8', user: { role: 'visitor', isAuthenticated: false } };
    expect(getGlobalRateLimit(req, limits)).toBe(30);
    expect(getGlobalRateLimitKey(req)).toBe('ip:203.0.113.8');
  });

  it('isolates authenticated users behind the same network by account', () => {
    const first = {
      ip: '203.0.113.8',
      user: { id: 'user-a', role: 'user', isAuthenticated: true },
    };
    const second = {
      ip: '203.0.113.8',
      user: { id: 'user-b', role: 'user', isAuthenticated: true },
    };
    expect(getGlobalRateLimit(first, limits)).toBe(60);
    expect(getGlobalRateLimitKey(first)).toBe('account:user-a');
    expect(getGlobalRateLimitKey(second)).toBe('account:user-b');
  });

  it('uses the real root actor while previewing another account', () => {
    const req = {
      ip: '203.0.113.8',
      user: { id: 'visitor', role: 'visitor', isAuthenticated: false },
      billingUser: { id: 'root-user', role: 'root', isAuthenticated: true },
    };
    expect(getGlobalRateLimit(req, limits)).toBe(120);
    expect(getGlobalRateLimitKey(req)).toBe('account:root-user');
  });
});
