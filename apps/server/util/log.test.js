import { describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query } }));
vi.mock('./common.js', () => ({
  resultData: (data, status, msg) => ({ data, status, msg }),
  formatDateTime: () => '',
  insertData: (value) => value,
}));
vi.mock('./logExclude.js', () => ({ isSelfTraffic: () => false }));
vi.mock('./logPolicy.js', () => ({ shouldSkipApiLog: () => false }));

const { sanitizeLogUrl, sanitizeSensitivePayload } = await import('./log.js');

describe('API 日志脱敏', () => {
  it('按规范化后的字段名屏蔽邮箱、令牌和验证码变体', () => {
    const payload = sanitizeSensitivePayload({
      email: 'alice@example.com',
      access_token: 'access-secret',
      'refresh-token': 'refresh-secret',
      verifyCode: '123456',
      nested: { authorization: 'Bearer secret-token', value: 'alice@example.com' },
    });

    expect(payload).toMatchObject({
      email: '[REDACTED]',
      access_token: '[REDACTED]',
      'refresh-token': '[REDACTED]',
      verifyCode: '[REDACTED]',
      nested: { authorization: '[REDACTED]', value: '[REDACTED_EMAIL]' },
    });
  });

  it('深层对象与循环引用不会回落记录原始值', () => {
    const circular = { next: null };
    circular.next = circular;
    const deep = { a: { b: { c: { d: { secret: 'must-not-leak' } } } } };

    expect(sanitizeSensitivePayload(circular)).toEqual({ next: '[REDACTED_CIRCULAR]' });
    expect(JSON.stringify(sanitizeSensitivePayload(deep))).not.toContain('must-not-leak');
    expect(JSON.stringify(sanitizeSensitivePayload(deep))).toContain('REDACTED_DEPTH_LIMIT');
  });

  it('URL 中的敏感查询参数和凭据会被屏蔽', () => {
    const url = sanitizeLogUrl(
      'https://alice:password@example.test/api?email=alice@example.com&access_token=token-1&ok=yes',
    );

    expect(url).not.toContain('alice@example.com');
    expect(url).not.toContain('password');
    expect(url).not.toContain('token-1');
    expect(url).toContain('ok=yes');
  });

  it('嵌在错误文本中的 JSON 令牌也不会漏记', () => {
    const value = sanitizeSensitivePayload('provider error: {"access_token":"token-from-provider"}');

    expect(value).not.toContain('token-from-provider');
    expect(value).toContain('[REDACTED]');
  });
});
