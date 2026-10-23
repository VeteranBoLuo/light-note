import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';

const query = vi.fn();
const lookup = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query, getConnection: vi.fn() } }));

await import('../util/common.js');
const { getUserInfo } = await import('./userHandle.js');
const { refreshUserIpLocation } = await import('../util/services/userIpLocationService.js');

const account = { id: 'owner', role: 'user', ip: '203.0.113.1', del_flag: 0, alias: '测试用户' };
const location = { status: '1', city: '测试城市', province: '测试省份', rectangle: '' };
let ipCounter = 2;
let clientIp;
const request = (extra = {}) => ({ user: { id: 'owner', role: 'user' }, ip: clientIp, headers: {}, ...extra });
const response = () => ({ send: vi.fn() });

describe('账号信息读取与登录恢复', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue([[{ ...account }]]);
    lookup.mockReset().mockResolvedValue({ data: location });
    clientIp = `203.0.113.${ipCounter++}`;
    vi.stubEnv('AMAP_API_KEY', 'test-location-key');
    vi.spyOn(axios, 'get').mockImplementation(lookup);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => {
    if (lookup.mock.calls.length) await refreshUserIpLocation(account, clientIp);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('IP 定位网络失败不影响有效账号恢复', async () => {
    lookup.mockRejectedValue(new AggregateError([new Error('network unavailable')], 'lookup failed'));
    const res = response();
    await getUserInfo(request(), res);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200, data: expect.objectContaining({ id: 'owner' }) }),
    );
  });

  it('定位仍未返回时，账号恢复已经成功响应', async () => {
    let finishLookup;
    lookup.mockReturnValue(
      new Promise((resolve) => {
        finishLookup = resolve;
      }),
    );
    const res = response();
    const handling = getUserInfo(request(), res);
    try {
      const responded = await Promise.race([
        handling.then(() => true),
        new Promise((resolve) => setImmediate(() => resolve(false))),
      ]);
      expect(responded).toBe(true);
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
      expect(lookup).toHaveBeenCalledTimes(1);
    } finally {
      finishLookup({ data: location });
      await handling;
    }
  });

  it('后台定位写入失败也不改写已成功的响应', async () => {
    query.mockImplementation(async (sql) => {
      if (typeof sql === 'object') throw Object.assign(new Error('database failed'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
      return [[{ ...account }]];
    });
    const res = response();
    await getUserInfo(request(), res);
    await refreshUserIpLocation(account, clientIp);
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it.each([
    { isAdminPreview: true },
    { isVisitorWorkspace: true },
    { adminContext: { mode: 'maintain' } },
    { user: { id: 'root', role: 'root' }, query: { id: 'owner' } },
  ])('代看或指定他人账号不触发定位及写入：%j', async (extra) => {
    const res = response();
    await getUserInfo(request(extra), res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    expect(lookup).not.toHaveBeenCalled();
    expect(query.mock.calls.every(([sql]) => typeof sql === 'string' && /^\s*SELECT\b/i.test(sql))).toBe(true);
  });

  it('普通账号不能用查询参数读取其他账号', async () => {
    const res = response();
    await getUserInfo(request({ query: { id: 'someone-else' } }), res);
    expect(query.mock.calls.every(([, args]) => args[0] === 'owner')).toBe(true);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200, data: expect.objectContaining({ id: 'owner' }) }),
    );
  });

  it('有效游客仍返回权威 visitor 状态', async () => {
    query.mockResolvedValue([[{ ...account, role: 'visitor' }]]);
    const res = response();
    await getUserInfo(request({ user: { id: 'owner', role: 'visitor' } }), res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'visitor' }));
  });

  it.each([
    ['没有身份', { user: undefined }, null],
    ['账号不存在', {}, []],
  ])('%s仍拒绝恢复，不触发定位', async (_label, extra, rows) => {
    if (rows) query.mockResolvedValue([rows]);
    const res = response();
    await getUserInfo(request(extra), res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(lookup).not.toHaveBeenCalled();
  });

  it('停用账号仍被拒绝，不能因定位降级绕过权限', async () => {
    query.mockResolvedValue([[{ ...account, del_flag: 1 }]]);
    const res = response();
    await getUserInfo(request(), res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 423 }));
    expect(lookup).not.toHaveBeenCalled();
  });

  it('真正的账号读取故障保留失败状态，响应和日志不泄露原始异常', async () => {
    query.mockRejectedValue(
      Object.assign(new Error('SELECT private data password=do-not-log'), { code: 'ER_NO_SUCH_TABLE' }),
    );
    const res = response();
    await getUserInfo(request(), res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 500, data: null }));
    expect(JSON.stringify(res.send.mock.calls)).not.toContain('do-not-log');
    expect(JSON.stringify(console.error.mock.calls)).not.toContain('do-not-log');
    expect(lookup).not.toHaveBeenCalled();
  });
});
