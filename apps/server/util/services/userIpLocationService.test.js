import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: {} }));
const { createUserIpLocationRefresher } = await import('./userIpLocationService.js');

const user = { id: 'owner', ip: '203.0.113.1', del_flag: 0 };
const clientIp = '203.0.113.2';
const location = { status: '1', city: '测试城市', province: '测试省份', rectangle: 'test-bounds' };

describe('账号 IP 定位的后台补充', () => {
  let query, get, warn, refresh, clock;
  beforeEach(() => {
    query = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    get = vi.fn().mockResolvedValue({ data: location });
    warn = vi.fn();
    clock = 0;
    refresh = createUserIpLocationRefresher({
      db: { query },
      http: { get },
      warn,
      now: () => clock,
      apiKey: () => 'test-key',
    });
  });

  it('成功结果按账号和旧 IP 写入，网络及 SQL 均有等待上限', async () => {
    expect(await refresh(user, clientIp)).toBe(true);
    const [url, options] = get.mock.calls[0];
    expect(url).toBe('https://restapi.amap.com/v3/ip');
    expect(options).toMatchObject({
      params: { ip: clientIp, key: 'test-key' },
      timeout: 1500,
      maxRedirects: 0,
      maxContentLength: 16384,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const [sqlOptions, [saved, ip, id, previousIp]] = query.mock.calls[0];
    expect(sqlOptions.timeout).toBe(1500);
    expect(JSON.parse(saved)).toEqual({ city: '测试城市', province: '测试省份', rectangle: 'test-bounds' });
    expect([ip, id, previousIp]).toEqual([clientIp, 'owner', '203.0.113.1']);
  });

  it('网络异常只记录稳定错误，不记录网址、IP、密钥或原始异常', async () => {
    get.mockRejectedValue(
      Object.assign(new Error('https://example.invalid/?key=private-key ip=203.0.113.2'), { code: 'ECONNREFUSED' }),
    );
    expect(await refresh(user, clientIp)).toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('ECONNREFUSED');
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private-key|203\.0\.113|example/);
  });

  it('持续无响应会被总超时信号中止，释放并发额度', async () => {
    get.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    expect(await refresh(user, clientIp)).toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    clock = 60_000;
    get.mockResolvedValue({ data: location });
    expect(await refresh(user, clientIp)).toBe(true);
  });

  it.each([null, 'not-json', { status: '0' }, { status: '1' }, { ...location, city: {} }])(
    '无效定位结果不覆盖已有资料：%j',
    async (data) => {
      get.mockResolvedValue({ data });
      expect(await refresh(user, clientIp)).toBe(false);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('兼容定位服务的空数组结果', async () => {
    get.mockResolvedValue({ data: { status: '1', city: [], province: [], rectangle: [] } });
    expect(await refresh(user, clientIp)).toBe(true);
    expect(JSON.parse(query.mock.calls[0][1][0])).toEqual({ city: '未知', province: '未知', rectangle: '' });
  });

  it('写入失败有界降级，不抛出未处理拒绝', async () => {
    query.mockRejectedValue(Object.assign(new Error('database unavailable'), { code: 'ER_LOCK_WAIT_TIMEOUT' }));
    expect(await refresh(user, clientIp)).toBe(false);
    expect(warn).toHaveBeenCalledWith('ER_LOCK_WAIT_TIMEOUT');
  });

  it('同账号同 IP 的并发只发一次查询，失败后等待冷却再重试', async () => {
    let rejectLookup;
    get.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectLookup = reject;
      }),
    );
    const first = refresh(user, clientIp);
    const second = refresh(user, clientIp);
    expect(second).toBe(first);
    await Promise.resolve();
    expect(get).toHaveBeenCalledTimes(1);
    rejectLookup(new Error('unavailable'));
    await first;
    expect(await refresh(user, clientIp)).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
    clock = 60_000;
    get.mockResolvedValue({ data: location });
    expect(await refresh(user, clientIp)).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('不同账号不共用写入，过量并发被跳过且完成后可恢复', async () => {
    let finishLookup;
    get.mockReturnValue(
      new Promise((resolve) => {
        finishLookup = resolve;
      }),
    );
    const tasks = Array.from({ length: 4 }, (_, n) => refresh({ ...user, id: `owner-${n}` }, clientIp));
    expect(await refresh({ ...user, id: 'owner-4' }, clientIp)).toBe(false);
    expect(get).toHaveBeenCalledTimes(4);
    finishLookup({ data: location });
    await Promise.all(tasks);
    expect(query.mock.calls.map(([, params]) => params[2])).toEqual(['owner-0', 'owner-1', 'owner-2', 'owner-3']);
    get.mockResolvedValue({ data: location });
    expect(await refresh({ ...user, id: 'owner-4' }, clientIp)).toBe(true);
  });

  it.each([
    [{ ...user, del_flag: 1 }, clientIp],
    [user, user.ip],
    [user, ''],
    [user, 'invalid-ip'],
    [null, clientIp],
  ])('账号或 IP 不适用时不访问外部服务', async (account, ip) => {
    expect(await refresh(account, ip)).toBe(false);
    expect(get).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('没有定位密钥也不影响后台调用方', async () => {
    const withoutKey = createUserIpLocationRefresher({ db: { query }, http: { get }, apiKey: () => '' });
    expect(await withoutKey(user, clientIp)).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });
});
