import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query: poolQuery } }));
vi.mock('./ipFilter.js', () => ({ isLocalIp: vi.fn(() => false) }));

const { isSelfTraffic, refreshLogExclude } = await import('./logExclude.js');

describe('日志白名单', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('优先通过稳定设备 ID 匹配，不受浏览器指纹漂移影响', async () => {
    poolQuery.mockResolvedValueOnce([[
      { fingerprint: 'old-fingerprint', device_id: 'stable-device-1' },
    ]]);
    await refreshLogExclude();

    expect(isSelfTraffic({ ip: '14.153.236.243', headers: {
      fingerprint: 'new-fingerprint',
      'x-log-device-id': 'stable-device-1',
    } })).toBe(true);
  });

  it('兼容旧的指纹白名单记录', async () => {
    poolQuery.mockResolvedValueOnce([[
      { fingerprint: 'legacy-fingerprint', device_id: null },
    ]]);
    await refreshLogExclude();

    expect(isSelfTraffic({ ip: '14.153.236.243', headers: {
      fingerprint: 'legacy-fingerprint',
    } })).toBe(true);
  });
});
