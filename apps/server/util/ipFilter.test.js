import { describe, it, expect } from 'vitest';
import { isLocalIp } from './ipFilter.js';

describe('isLocalIp(本地/回环过滤)', () => {
  it('识别本地/回环 IP', () => {
    expect(isLocalIp('127.0.0.1')).toBe(true);
    expect(isLocalIp('::1')).toBe(true);
    expect(isLocalIp('::ffff:127.0.0.1')).toBe(true);
    expect(isLocalIp('127.0.0.5')).toBe(true);
    expect(isLocalIp('localhost')).toBe(true);
    expect(isLocalIp('LOCALHOST')).toBe(true);
  });
  it('放行真实公网 IP 与空值', () => {
    expect(isLocalIp('14.155.225.67')).toBe(false);
    expect(isLocalIp('66.249.65.200')).toBe(false);
    expect(isLocalIp('')).toBe(false);
    expect(isLocalIp(undefined)).toBe(false);
  });
});
