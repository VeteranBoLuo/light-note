import { describe, expect, it, vi } from 'vitest';
import {
  isBlockedNetworkAddress,
  lookupPublicAddresses,
  validatePublicWebUrl,
  webUrlSafetyInternals,
} from './webUrlSafety.js';

describe('webUrlSafety', () => {
  it.each([
    '127.0.0.1',
    '169.254.169.254',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '2002:7f00:1::',
  ])('拒绝本机、私网和可封装私网的地址 %s', (address) => {
    expect(isBlockedNetworkAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('允许普通公网地址 %s', (address) => {
    expect(isBlockedNetworkAddress(address)).toBe(false);
  });

  it('在请求前拒绝凭据、内部域名、私网字面地址和渲染器禁用端口', () => {
    expect(() => validatePublicWebUrl('https://user:secret@example.com')).toThrowError('URL_CREDENTIALS_FORBIDDEN');
    expect(() => validatePublicWebUrl('http://service.internal/path')).toThrowError('BLOCKED_HOST');
    expect(() => validatePublicWebUrl('http://[::ffff:7f00:1]/')).toThrowError('BLOCKED_HOST');
    expect(() => validatePublicWebUrl('https://example.com:444/', { allowedPorts: [80, 443] })).toThrowError(
      'BLOCKED_PORT',
    );
    expect(() =>
      validatePublicWebUrl('http://example.com:443/', { allowedPorts: [80, 443], defaultPortsOnly: true }),
    ).toThrowError('BLOCKED_PORT');
  });

  it('DNS 同时返回公网和私网地址时整组拒绝，避免连接阶段挑中私网', async () => {
    const lookup = vi.fn((_host, options, callback) => {
      expect(options).toMatchObject({ all: true, verbatim: true });
      callback(null, [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]);
    });

    await expect(lookupPublicAddresses('example.com', { lookup })).rejects.toMatchObject({
      code: 'BLOCKED_PRIVATE_IP',
    });
  });

  it('IPv6 解析支持压缩写法和 IPv4 尾段', () => {
    expect(webUrlSafetyInternals.expandIpv6('2606:4700:4700::1111')).toBeTypeOf('bigint');
    expect(webUrlSafetyInternals.expandIpv6('::ffff:127.0.0.1')).toBeTypeOf('bigint');
  });
});
