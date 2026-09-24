import { afterEach, expect, it, vi } from 'vitest';
import { readIdentity, renewIdentity, sameOrigin, respondentHash, requireIdentityConfig } from './identity.js';
afterEach(() => vi.unstubAllEnvs());
it('签名 Cookie 续期保持身份，伪造/过期失败，摘要按表单隔离', () => {
  vi.stubEnv('COLLECTION_FORMS_IDENTITY_SECRET', 'test-collection-secret-0000000000000000000');
  const cookie = vi.fn();
  renewIdentity({ cookie }, null);
  const [name, value, options] = cookie.mock.calls[0];
  expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/api/public/forms' });
  const id = readIdentity({ headers: { cookie: `${name}=${value}` } });
  expect(id).toMatch(/^[a-f0-9]{48}$/);
  renewIdentity({ cookie }, id);
  expect(readIdentity({ headers: { cookie: `${name}=${cookie.mock.calls[1][1]}` } })).toBe(id);
  expect(readIdentity({ headers: { cookie: `${name}=${value.slice(0, -1)}z` } })).toBeNull();
  expect(readIdentity({ headers: { cookie: `${name}=${value.replace(/\.\d{13}\./, '.1000000000000.')}` } })).toBeNull();
  expect(respondentHash('form-a', id)).not.toBe(respondentHash('form-b', id));
});
it('未配置时明确拒绝，生产限定同源协议与主机', () => {
  vi.stubEnv('COLLECTION_FORMS_IDENTITY_SECRET', '');
  expect(requireIdentityConfig).toThrow('暂不可用');
  vi.stubEnv('NODE_ENV', 'production');
  const request = (origin) => ({ headers: { origin }, get: () => 'example.com', protocol: 'https' });
  expect(sameOrigin(request('https://example.com'))).toBe(true);
  expect(sameOrigin(request('http://example.com'))).toBe(false);
  expect(sameOrigin(request('https://other.example'))).toBe(false);
  expect(sameOrigin(request(undefined))).toBe(false);
});
