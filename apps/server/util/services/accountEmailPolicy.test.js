import { describe, expect, it, vi } from 'vitest';
import { inspectEmailDomain, mailboxNotFoundError, parseAccountEmail } from './accountEmailPolicy.js';
const dnsError = (code) => Promise.reject(Object.assign(new Error(), { code }));
const dns = (mx = []) => ({
  resolveMx: vi.fn().mockResolvedValue(mx),
  resolve4: vi.fn().mockResolvedValue([]),
  resolve6: vi.fn().mockResolvedValue([]),
});
describe('邮箱健康判断', () => {
  it('数字 QQ 邮箱、别名和国际化域名均不按名称猜测有效性', () => {
    expect(parseAccountEmail('123456@qq.com')).toMatchObject({ domain: 'qq.com' });
    expect(parseAccountEmail(' name+tag@EXAMPLE.com ')).toMatchObject({ email: 'name+tag@example.com' });
    expect(parseAccountEmail('person@例子.中国')?.domain).toBe('xn--fsqu00a.xn--fiqs8s');
    expect(parseAccountEmail('"quoted name"@example.com')).not.toBeNull();
  });
  it('巡检支持标准 IP 字面量和单标签域名，不将产品支持范围误当成格式错误', () => {
    for (const address of ['name@[192.0.2.1]', 'name@[IPv6:2001:db8::1]']) {
      expect(parseAccountEmail(address, { healthCheck: true })).toEqual({ email: address, domain: null });
      expect(parseAccountEmail(address)).toBeNull();
    }
    expect(parseAccountEmail('name@ai', { healthCheck: true })).toEqual({ email: 'name@ai', domain: 'ai' });
    expect(parseAccountEmail('name@ai')).toBeNull();
    for (const address of ['name@[999.1.1.1]', 'name@[IPv6:not-an-ip]', 'name@[2001:db8::1]']) {
      expect(parseAccountEmail(address, { healthCheck: true })).toBeNull();
    }
  });
  it.each([
    '',
    'no-address',
    'a@@example.com',
    'a@',
    '.a@example.com',
    'a..b@example.com',
    'name@example.com\r\nBcc:other@example.com',
    'a@-example.com',
    `${'x'.repeat(65)}@example.com`,
  ])('拒绝明确的格式问题：%s', (value) => {
    expect(parseAccountEmail(value)).toBeNull();
  });
  it('有 MX 时不继续探测具体邮箱', async () => {
    const resolver = dns([{ priority: 1, exchange: 'mx.example.com' }]);
    expect(await inspectEmailDomain('example.com', resolver)).toBeNull();
    expect(resolver.resolve4).not.toHaveBeenCalled();
  });
  it('没有 MX 但有 A 地址仍可收信', async () => {
    const resolver = dns();
    resolver.resolveMx.mockImplementation(() => dnsError('ENODATA'));
    resolver.resolve4.mockResolvedValue(['192.0.2.1']);
    expect(await inspectEmailDomain('example.com', resolver)).toBeNull();
  });
  it('临时 DNS 故障、超时和拒绝查询均不判为无效', async () => {
    for (const code of ['ETIMEOUT', 'ESERVFAIL', 'EREFUSED']) {
      const resolver = dns();
      resolver.resolveMx.mockImplementation(() => dnsError(code));
      expect(await inspectEmailDomain('example.com', resolver)).toBeNull();
    }
  });
  it('区分域名不存在和明确的 null MX', async () => {
    const resolver = dns();
    resolver.resolveMx.mockImplementation(() => dnsError('ENOTFOUND'));
    expect(await inspectEmailDomain('example.invalid', resolver)).toBe('DOMAIN_NOT_FOUND');
    expect(await inspectEmailDomain('example.com', dns([{ priority: 0, exchange: '.' }]))).toBe('DOMAIN_NO_MAIL');
  });
  it('MX/A/AAAA 都明确无记录时才能标记无法收信', async () => {
    const resolver = dns();
    resolver.resolveMx.mockImplementation(() => dnsError('ENODATA'));
    resolver.resolve4.mockImplementation(() => dnsError('ENODATA'));
    resolver.resolve6.mockImplementation(() => dnsError('ETIMEOUT'));
    expect(await inspectEmailDomain('example.com', resolver)).toBeNull();
    resolver.resolve6.mockImplementation(() => dnsError('ENODATA'));
    expect(await inspectEmailDomain('example.com', resolver)).toBe('DOMAIN_NO_MAIL');
  });
  it('只接受收件人阶段明确的 5.1.1，策略拒收和发件人问题不算邮箱不存在', () => {
    expect(mailboxNotFoundError({ command: 'RCPT TO', responseCode: 550, response: '550 5.1.1 No such user' })).toBe(
      true,
    );
    expect(mailboxNotFoundError({ command: 'RCPT TO', responseCode: 550, response: '550 5.7.1 blocked' })).toBe(false);
    expect(
      mailboxNotFoundError({ command: 'MAIL FROM', responseCode: 550, response: '550 5.1.1 sender invalid' }),
    ).toBe(false);
  });
});
