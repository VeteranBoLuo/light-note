import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query: poolQuery } }));
vi.mock('./ipFilter.js', () => ({ isLocalIp: vi.fn(() => false) }));

const { isSelfTraffic, listLogExclude, refreshLogExclude } = await import('./logExclude.js');

describe('日志白名单', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('优先通过稳定设备 ID 匹配，不受浏览器指纹漂移影响', async () => {
    poolQuery
      .mockResolvedValueOnce([[
        { fingerprint: 'old-fingerprint', device_id: null },
      ]])
      .mockResolvedValueOnce([[
        { device_id: 'stable-device-1' },
      ]]);
    await refreshLogExclude();

    expect(isSelfTraffic({ ip: '14.153.236.243', headers: {
      fingerprint: 'new-fingerprint',
      'x-log-device-id': 'stable-device-1',
    } })).toBe(true);
  });

  it('兼容旧的指纹白名单记录', async () => {
    poolQuery
      .mockResolvedValueOnce([[
        { fingerprint: 'legacy-fingerprint', device_id: null },
      ]])
      .mockResolvedValueOnce([[]]);
    await refreshLogExclude();

    expect(isSelfTraffic({ ip: '14.153.236.243', headers: {
      fingerprint: 'legacy-fingerprint',
    } })).toBe(true);
  });

  it('旧指纹白名单命中后自动关联稳定设备 ID', async () => {
    poolQuery
      .mockResolvedValueOnce([[
        { fingerprint: 'legacy-fingerprint', device_id: null },
      ]])
      .mockResolvedValueOnce([[]]);
    await refreshLogExclude();
    poolQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    expect(isSelfTraffic({ ip: '14.153.236.243', headers: {
      fingerprint: 'legacy-fingerprint',
      'x-log-device-id': 'auto-device-1',
    } })).toBe(true);
    await vi.waitFor(() => expect(poolQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO log_exclude_devices'),
      ['auto-device-1', 'legacy-fingerprint'],
    ));

    // 指纹变化后仍由刚刚自动关联的稳定 ID 命中。
    expect(isSelfTraffic({ ip: '14.153.236.243', headers: {
      fingerprint: 'changed-fingerprint',
      'x-log-device-id': 'auto-device-1',
    } })).toBe(true);
  });

  it('非白名单指纹不会自动登记稳定设备', async () => {
    poolQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
    await refreshLogExclude();
    poolQuery.mockClear();

    expect(isSelfTraffic({ ip: '14.153.236.243', headers: {
      fingerprint: 'unknown-fingerprint',
      'x-log-device-id': 'unknown-device',
    } })).toBe(false);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('一个白名单可返回多个稳定设备标识', async () => {
    poolQuery
      .mockResolvedValueOnce([[
        { fingerprint: 'fingerprint-1', note: null, create_time: '2026-07-16' },
      ]])
      .mockResolvedValueOnce([[
        { fingerprint: 'fingerprint-1', device_id: 'device-a' },
        { fingerprint: 'fingerprint-1', device_id: 'device-b' },
      ]]);

    const rows = await listLogExclude();

    expect(rows[0].device_ids).toEqual(['device-a', 'device-b']);
  });
});
