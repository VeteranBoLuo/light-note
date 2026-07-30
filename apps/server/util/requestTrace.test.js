import { describe, expect, it, vi } from 'vitest';
import { normalizeRequestId, requestTraceMiddleware } from './requestTrace.js';

describe('requestTrace', () => {
  it('保留合法请求标识，拒绝不可控长文本', () => {
    expect(normalizeRequestId('client-request-123')).toBe('client-request-123');
    expect(normalizeRequestId('x'.repeat(200))).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('回传同一个 X-Request-Id', () => {
    const req = { get: vi.fn(() => 'client-request-456') };
    const res = { setHeader: vi.fn() };
    const next = vi.fn();
    requestTraceMiddleware(req, res, next);
    expect(req.requestId).toBe('client-request-456');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-request-456');
    expect(next).toHaveBeenCalledOnce();
  });
});
