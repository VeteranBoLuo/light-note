import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query: poolQuery } }));

const { initLogExclude, isSelfTraffic, refreshLogExclude, rememberInternalDevice } = await import('./logExclude.js');

const PUBLIC_IP = '14.153.236.243';
const ROOT_DEVICE = '7f0c2a4e-5b1d-4c2e-9a3f-1d2e3f4a5b6c';

const rootReq = (headers = {}) => ({
  ip: PUBLIC_IP,
  user: { id: 'root-1', role: 'root', isAuthenticated: true },
  headers,
});
const guestReq = (headers = {}) => ({
  ip: PUBLIC_IP,
  user: { id: 'visitor-1', role: 'visitor', isAuthenticated: false },
  headers,
});

async function loadDevices(deviceIds = []) {
  poolQuery.mockResolvedValueOnce([deviceIds.map((device_id) => ({ device_id }))]);
  await refreshLogExclude();
}

describe('内部设备流量过滤', () => {
  beforeEach(async () => {
    poolQuery.mockReset();
    await loadDevices();
    poolQuery.mockReset();
  });

  it('启动时只建内部设备表并读取设备 ID，不再读写旧指纹表', async () => {
    poolQuery.mockResolvedValueOnce([{}]).mockResolvedValueOnce([[{ device_id: ROOT_DEVICE }]]);

    await initLogExclude();

    const sqls = poolQuery.mock.calls.map(([sql]) => String(sql));
    expect(sqls).toHaveLength(2);
    expect(sqls[0]).toContain('CREATE TABLE IF NOT EXISTS log_exclude_devices');
    expect(sqls[1]).toContain('SELECT device_id FROM log_exclude_devices');
    expect(sqls.some((sql) => /\blog_exclude\b/.test(sql))).toBe(false);
    expect(isSelfTraffic(guestReq({ 'x-log-device-id': ROOT_DEVICE }))).toBe(true);
  });

  it('内部账号登录态携带设备 ID 时自动登记', async () => {
    poolQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    rememberInternalDevice(rootReq({ 'x-log-device-id': ROOT_DEVICE }));

    await vi.waitFor(() =>
      expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE INTO log_exclude_devices'), [
        ROOT_DEVICE,
        '',
      ]),
    );
  });

  it('只带 X-Device-Id 的 test 账号同样登记', async () => {
    poolQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    rememberInternalDevice({
      ip: PUBLIC_IP,
      user: { id: 'test-1', role: 'test', isAuthenticated: true },
      headers: { 'x-device-id': ROOT_DEVICE },
    });

    await vi.waitFor(() => expect(poolQuery).toHaveBeenCalledTimes(1));
    expect(poolQuery.mock.calls[0][1]).toEqual([ROOT_DEVICE, '']);
  });

  it('登记后同设备的未登录流量被排除，内部账号登录态照常记录', async () => {
    poolQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
    expect(isSelfTraffic(guestReq({ 'x-log-device-id': ROOT_DEVICE }))).toBe(false);

    rememberInternalDevice(rootReq({ 'x-log-device-id': ROOT_DEVICE }));
    await vi.waitFor(() => expect(isSelfTraffic(guestReq({ 'x-log-device-id': ROOT_DEVICE }))).toBe(true));

    expect(isSelfTraffic(rootReq({ 'x-log-device-id': ROOT_DEVICE }))).toBe(false);
    // 同一浏览器登录普通账号测试时也不应进入真实用户日志。
    expect(
      isSelfTraffic({
        ip: PUBLIC_IP,
        user: { id: 'user-1', role: 'user', isAuthenticated: true },
        headers: { 'x-device-id': ROOT_DEVICE },
      }),
    ).toBe(true);
  });

  it('已在缓存中的设备不重复写库', async () => {
    await loadDevices([ROOT_DEVICE]);
    poolQuery.mockReset();

    rememberInternalDevice(rootReq({ 'x-log-device-id': ROOT_DEVICE }));
    rememberInternalDevice(rootReq({ 'x-log-device-id': ROOT_DEVICE }));

    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('写入进行中的同设备并发请求只写一次', async () => {
    let resolveInsert = () => {};
    poolQuery.mockReturnValueOnce(new Promise((resolve) => (resolveInsert = resolve)));

    rememberInternalDevice(rootReq({ 'x-log-device-id': ROOT_DEVICE }));
    rememberInternalDevice(rootReq({ 'x-log-device-id': ROOT_DEVICE }));
    expect(poolQuery).toHaveBeenCalledTimes(1);

    resolveInsert([{ affectedRows: 1 }]);
    await vi.waitFor(() => expect(isSelfTraffic(guestReq({ 'x-log-device-id': ROOT_DEVICE }))).toBe(true));
  });

  it('写库失败时不加入缓存，下次请求可重试', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    poolQuery.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce([{ affectedRows: 1 }]);

    rememberInternalDevice(rootReq({ 'x-log-device-id': ROOT_DEVICE }));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(isSelfTraffic(guestReq({ 'x-log-device-id': ROOT_DEVICE }))).toBe(false);

    rememberInternalDevice(rootReq({ 'x-log-device-id': ROOT_DEVICE }));
    await vi.waitFor(() => expect(isSelfTraffic(guestReq({ 'x-log-device-id': ROOT_DEVICE }))).toBe(true));
    expect(poolQuery).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('普通用户、游客和管理员预览中的普通目标都不登记', () => {
    rememberInternalDevice({
      ip: PUBLIC_IP,
      user: { id: 'user-1', role: 'user', isAuthenticated: true },
      headers: { 'x-log-device-id': ROOT_DEVICE },
    });
    rememberInternalDevice(guestReq({ 'x-log-device-id': ROOT_DEVICE }));
    // 角色伪造在未认证请求上不生效。
    rememberInternalDevice({
      ip: PUBLIC_IP,
      user: { id: 'root-1', role: 'root', isAuthenticated: false },
      headers: { 'x-log-device-id': ROOT_DEVICE },
    });

    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('本地/回环请求不登记，且本身始终视为自有流量', () => {
    const localRoot = { ...rootReq({ 'x-log-device-id': ROOT_DEVICE }), ip: '127.0.0.1' };

    rememberInternalDevice(localRoot);

    expect(poolQuery).not.toHaveBeenCalled();
    expect(isSelfTraffic(localRoot)).toBe(true);
  });

  it('没有或不合规的设备 ID 不报错、不登记、不排除', () => {
    expect(() => rememberInternalDevice(rootReq())).not.toThrow();
    expect(() => rememberInternalDevice({ ip: PUBLIC_IP, user: rootReq().user })).not.toThrow();
    rememberInternalDevice(rootReq({ 'x-log-device-id': 'short' }));
    rememberInternalDevice(rootReq({ 'x-log-device-id': `${ROOT_DEVICE}<script>` }));

    expect(poolQuery).not.toHaveBeenCalled();
    expect(isSelfTraffic(guestReq())).toBe(false);
    expect(isSelfTraffic({ ip: PUBLIC_IP })).toBe(false);
    expect(isSelfTraffic(undefined)).toBe(false);
  });

  it('旧指纹请求头不再参与匹配', async () => {
    await loadDevices([ROOT_DEVICE]);

    expect(isSelfTraffic(guestReq({ fingerprint: ROOT_DEVICE }))).toBe(false);
    expect(isSelfTraffic(guestReq({ fingerprint: '-7b8f7238' }))).toBe(false);
  });
});
