import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  INDEXNOW_KEY,
  parseSeoPushState,
  pushToBaidu,
  pushToIndexNow,
  runSeoPush,
  selectPendingEntries,
  SEO_PUSH_STATE_CONFIG_NAME,
  seoPushEngines,
  startSeoPushScheduler,
} from './seoPushService.js';

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const ARTICLE = (id) => `https://boluo66.top/helpCenter/${id}`;

function fakeDb({ state = null, articles = [] } = {}) {
  const saved = [];
  const db = {
    saved,
    articles,
    query: vi.fn(async (sql, params) => {
      if (/FROM config_json/.test(sql)) return [state === null ? [] : [{ json_content: JSON.stringify(state) }]];
      if (/FROM knowledge_base/.test(sql)) return [db.articles];
      if (/INSERT INTO config_json/.test(sql)) {
        saved.push({ name: params[0], state: JSON.parse(params[1]) });
        state = JSON.parse(params[1]);
        return [{}];
      }
      throw new Error(`unexpected sql: ${sql}`);
    }),
  };
  return db;
}

describe('引擎开关', () => {
  it('IndexNow 默认开启，百度需要令牌，总开关可全部停用', () => {
    expect(seoPushEngines({})).toEqual(['indexnow']);
    expect(seoPushEngines({ BAIDU_PUSH_TOKEN: ' t ' })).toEqual(['baidu', 'indexnow']);
    expect(seoPushEngines({ BAIDU_PUSH_TOKEN: 't', SEO_PUSH_ENABLED: 'False' })).toEqual([]);
  });

  it('非生产运行时不启动调度', () => {
    expect(startSeoPushScheduler({ db: fakeDb(), env: { LIGHTNOTE_RUNTIME_ENV: 'local' } })).toBe(false);
  });

  it('IndexNow 密钥文件与服务端常量一致，放在站点根目录', () => {
    const file = new URL(`../../../web/public/${INDEXNOW_KEY}.txt`, import.meta.url);
    expect(readFileSync(file, 'utf8').trim()).toBe(INDEXNOW_KEY);
  });
});

describe('待推送地址', () => {
  it('没提交过的优先，其次是更新过的，已提交的同版本跳过', () => {
    const entries = [
      { loc: 'a', version: 'static' },
      { loc: 'b', version: 'v2' },
      { loc: 'c', version: 'v1' },
    ];
    expect(selectPendingEntries(entries, { a: 'static', b: 'v1' }).map((e) => e.loc)).toEqual(['c', 'b']);
  });

  it('坏记录只丢弃对应部分', () => {
    expect(parseSeoPushState('not json')).toEqual({ engines: {} });
    expect(
      parseSeoPushState({ engines: { baidu: { lastRunDate: 1, pushed: { a: 'v', b: 3 } }, bad: null } }),
    ).toEqual({ engines: { baidu: { lastRunDate: '', pushed: { a: 'v' } } } });
  });
});

describe('百度普通收录', () => {
  it('先推一条读出剩余额度，再按额度补推，无效地址单独返回', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { remain: 2, success: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { remain: 0, success: 1, not_valid: ['u3'] }));
    const result = await pushToBaidu(['u1', 'u2', 'u3', 'u4'], { token: 'secret', fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [endpoint, init] = fetcher.mock.calls[0];
    expect(endpoint).toBe('http://data.zz.baidu.com/urls?site=https%3A%2F%2Fboluo66.top&token=secret');
    expect(init.body).toBe('u1');
    expect(fetcher.mock.calls[1][1].body).toBe('u2\nu3');
    expect(result).toEqual({ accepted: ['u1', 'u2'], rejected: ['u3'], remain: 0 });
  });

  it('当天额度用完时一条也不记为已提交', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(400, { error: 400, message: 'over quota' }));
    await expect(pushToBaidu(['u1', 'u2'], { token: 't', fetcher })).resolves.toEqual({
      accepted: [],
      rejected: [],
      error: 'BAIDU_PUSH_OVER_QUOTA',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('令牌无效返回稳定错误码', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(401, { error: 401, message: 'token is not valid' }));
    await expect(pushToBaidu(['u1'], { token: 't', fetcher })).resolves.toMatchObject({ error: 'BAIDU_PUSH_HTTP_401' });
  });
});

describe('IndexNow', () => {
  it('200 与 202 都算受理，提交主机、密钥与根目录密钥地址', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(202, null));
    await expect(pushToIndexNow(['u1', 'u2'], { fetcher })).resolves.toEqual({ accepted: ['u1', 'u2'], rejected: [] });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      host: 'boluo66.top',
      key: INDEXNOW_KEY,
      keyLocation: `https://boluo66.top/${INDEXNOW_KEY}.txt`,
      urlList: ['u1', 'u2'],
    });
  });

  it('密钥校验失败不记为已提交', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(403, null));
    await expect(pushToIndexNow(['u1'], { fetcher })).resolves.toEqual({
      accepted: [],
      rejected: [],
      error: 'INDEXNOW_HTTP_403',
    });
  });
});

describe('每日一轮', () => {
  const now = new Date(2026, 10, 2, 9, 0, 0);
  const articles = [
    { id: 'a1', updated_at: new Date(2026, 9, 30, 10, 0, 0) },
    { id: 'a2', updated_at: new Date(2026, 9, 31, 11, 0, 0) },
  ];

  it('记录提交版本，同一天不重复；文章更新后第二天重推，删除的地址清掉', async () => {
    const db = fakeDb({
      state: { engines: { indexnow: { lastRunDate: '2026-11-01', pushed: { [ARTICLE('gone')]: 'old' } } } },
      articles,
    });
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(200, null));

    const first = await runSeoPush({ db, env: {}, fetcher, now });
    expect(first).toEqual([
      { engine: 'indexnow', pending: 8, accepted: 8, rejected: 0, remain: null, error: null },
    ]);
    const pushed = db.saved.at(-1).state.engines.indexnow.pushed;
    expect(db.saved.at(-1).name).toBe(SEO_PUSH_STATE_CONFIG_NAME);
    expect(pushed[ARTICLE('a1')]).toBe('2026-10-30 10:00:00');
    expect(pushed['https://boluo66.top/']).toBe('static');
    expect(pushed).not.toHaveProperty(ARTICLE('gone'));

    await expect(runSeoPush({ db, env: {}, fetcher, now })).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);

    db.articles = [articles[0], { ...articles[1], updated_at: new Date(2026, 10, 2, 8, 0, 0) }];
    await runSeoPush({ db, env: {}, fetcher, now: new Date(2026, 10, 3, 9, 0, 0) });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).urlList).toEqual([ARTICLE('a2')]);
  });

  it('引擎各自记录；请求失败当天不再重试，也不记为已提交', async () => {
    const db = fakeDb({ articles });
    const fetcher = vi.fn(async (url) => {
      if (String(url).startsWith('http://data.zz.baidu.com')) throw Object.assign(new Error('t'), { name: 'TimeoutError' });
      return jsonResponse(200, null);
    });

    const results = await runSeoPush({ db, env: { BAIDU_PUSH_TOKEN: 't' }, fetcher, now });
    expect(results.map((r) => [r.engine, r.accepted, r.error])).toEqual([
      ['baidu', 0, 'SEO_PUSH_TIMEOUT'],
      ['indexnow', 8, null],
    ]);
    const state = db.saved.at(-1).state;
    expect(state.engines.baidu).toEqual({ lastRunDate: '2026-11-02', pushed: {} });
    await expect(runSeoPush({ db, env: { BAIDU_PUSH_TOKEN: 't' }, fetcher, now })).resolves.toEqual([]);
  });
});
