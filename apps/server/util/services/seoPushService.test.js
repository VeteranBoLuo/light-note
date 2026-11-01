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
const HELP_INDEX = 'https://boluo66.top/helpCenter';

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
    expect(parseSeoPushState({ engines: { baidu: { lastRunDate: 1, pushed: { a: 'v', b: 3 } }, bad: null } })).toEqual({
      engines: { baidu: { lastRunDate: '', pushed: { a: 'v' } } },
    });
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

  it.each([
    { remain: 0 },
    { remain: 0, success: 0 },
    { remain: 0, success: 2 },
    { remain: -1, success: 1 },
    { remain: 0, success: 1, not_valid: 'u1' },
    { remain: 0, success: 0, not_valid: ['outside'] },
    { remain: 0, success: 0, not_valid: ['u1'], not_same_site: ['u1'] },
  ])('响应计数或拒绝列表不一致时不确认成功：%j', async (body) => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(200, body));
    await expect(pushToBaidu(['u1'], { token: 't', fetcher })).resolves.toEqual({
      accepted: [],
      rejected: [],
      error: 'BAIDU_PUSH_INVALID_RESPONSE',
    });
  });

  it('第二批请求中断仍保留第一条的已确认结果', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { remain: 2, success: 1 }))
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    await expect(pushToBaidu(['u1', 'u2'], { token: 't', fetcher })).resolves.toEqual({
      accepted: ['u1'],
      rejected: [],
      remain: 0,
      error: 'SEO_PUSH_TIMEOUT',
    });
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
  it('200 确认受理，提交主机、密钥与根目录密钥地址', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(200, null));
    await expect(pushToIndexNow(['u1', 'u2'], { fetcher })).resolves.toEqual({ accepted: ['u1', 'u2'], rejected: [] });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      host: 'boluo66.top',
      key: INDEXNOW_KEY,
      keyLocation: `https://boluo66.top/${INDEXNOW_KEY}.txt`,
      urlList: ['u1', 'u2'],
    });
  });

  it('202 密钥待校验不确认版本，留待下一自然日重试', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(202, null));
    await expect(pushToIndexNow(['u1'], { fetcher })).resolves.toEqual({
      accepted: [],
      rejected: [],
      error: 'INDEXNOW_KEY_VALIDATION_PENDING',
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

  it('IndexNow 首次只建立历史快照，之后只通知新增、更新和撤回的 URL', async () => {
    const db = fakeDb({ articles });
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(200, null));
    await expect(runSeoPush({ db, env: {}, fetcher, now })).resolves.toEqual([
      { engine: 'indexnow', pending: 0, accepted: 0, rejected: 0, remain: null, error: null },
    ]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.saved.at(-1).state.engines.indexnow.pushed[ARTICLE('a1')]).toBe('2026-10-30 10:00:00');

    db.articles = [
      { ...articles[1], updated_at: new Date(2026, 10, 3, 8, 0, 0) },
      { id: 'a3', updated_at: new Date(2026, 10, 3, 8, 0, 0) },
    ];
    await runSeoPush({ db, env: {}, fetcher, now: new Date(2026, 10, 3, 9, 0, 0) });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).urlList).toEqual([
      ARTICLE('a3'),
      HELP_INDEX,
      ARTICLE('a2'),
      ARTICLE('a1'),
    ]);
    expect(db.saved.at(-1).state.engines.indexnow.pushed).not.toHaveProperty(ARTICLE('a1'));
  });

  it('目录改名或换栏目即使文章时间未变，也通知目录页；内容未变不重复通知', async () => {
    const db = fakeDb({ articles });
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(200, null));
    await runSeoPush({ db, env: {}, fetcher, now });
    db.articles = [{ ...articles[0], title: '三分钟入门', help_section: '快速上手' }, articles[1]];
    await runSeoPush({ db, env: {}, fetcher, now: new Date(2026, 10, 3, 9, 0, 0) });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).urlList).toEqual([HELP_INDEX]);
    await runSeoPush({ db, env: {}, fetcher, now: new Date(2026, 10, 4, 9, 0, 0) });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([202, 403])('IndexNow %s 保留更新和撤回快照，隔天重试并在确认后清理', async (status) => {
    const db = fakeDb({ articles });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(status, null))
      .mockResolvedValue(jsonResponse(200, null));
    await runSeoPush({ db, env: {}, fetcher, now });
    db.articles = [{ ...articles[1], updated_at: new Date(2026, 10, 3, 8, 0, 0) }];
    const nextDay = new Date(2026, 10, 3, 9, 0, 0);
    await runSeoPush({ db, env: {}, fetcher, now: nextDay });
    const failed = db.saved.at(-1).state.engines.indexnow;
    expect(failed.pushed[ARTICLE('a1')]).toBe('2026-10-30 10:00:00');
    expect(failed.pushed[ARTICLE('a2')]).toBe('2026-10-31 11:00:00');
    await expect(runSeoPush({ db, env: {}, fetcher, now: nextDay })).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await runSeoPush({ db, env: {}, fetcher, now: new Date(2026, 10, 4, 9, 0, 0) });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).urlList).toEqual([HELP_INDEX, ARTICLE('a2'), ARTICLE('a1')]);
    const confirmed = db.saved.at(-1).state.engines.indexnow.pushed;
    expect(confirmed).not.toHaveProperty(ARTICLE('a1'));
    expect(confirmed[ARTICLE('a2')]).toBe('2026-11-03 08:00:00');
  });

  it.each([[], null, {}, { pushed: 'broken' }, { pushed: [] }, { pushed: null }])(
    'IndexNow 损坏基线按首次启用重建，不批量提交历史 URL：%j',
    async (indexnow) => {
      const db = fakeDb({ articles, state: { engines: { indexnow } } });
      const fetcher = vi.fn();
      const result = await runSeoPush({ db, env: {}, fetcher, now });
      expect(fetcher).not.toHaveBeenCalled();
      expect(result).toEqual([{ engine: 'indexnow', pending: 0, accepted: 0, rejected: 0, remain: null, error: null }]);
      expect(db.saved.at(-1).state.engines.indexnow.pushed[ARTICLE('a1')]).toBe('2026-10-30 10:00:00');
    },
  );

  it('快照中的非公开或非规范 URL 不能作为删除通知提交，正常公共文章仍可通知', async () => {
    const invalidUrls = [
      'https://other.example/old',
      'invalid',
      'https://boluo66.top/private',
      'https://user:pass@boluo66.top/helpCenter/old',
      'https://boluo66.top/helpCenter/old?token=secret',
      'https://boluo66.top/helpCenter/old#fragment',
      'https://boluo66.top/helpCenter/old/child',
      'https://boluo66.top/helpCenter/old%2Fchild',
      'https://boluo66.top/helpCenter/old%5Cchild',
      'https://boluo66.top/helpCenter/old%3Fchild',
      'https://boluo66.top/helpCenter/old%23child',
      'https://boluo66.top/helpCenter/old%252Fchild',
      'https://boluo66.top/helpCenter/old%00child',
      'https://boluo66.top/helpCenter/%ZZ',
      'https://boluo66.top/helpCenter/%2E%2E/private',
      'https://boluo66.top:443/helpCenter/old',
    ];
    const db = fakeDb({
      articles,
      state: {
        engines: {
          indexnow: {
            lastRunDate: '2026-11-01',
            pushed: { ...Object.fromEntries(invalidUrls.map((url) => [url, 'v1'])), [ARTICLE('gone')]: 'v1' },
          },
        },
      },
    });
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(200, null));
    await runSeoPush({ db, env: {}, fetcher, now });
    const submitted = JSON.parse(fetcher.mock.calls[0][1].body).urlList;
    expect(submitted).toContain(ARTICLE('gone'));
    const persisted = db.saved.at(-1).state.engines.indexnow.pushed;
    for (const url of invalidUrls) {
      expect(submitted).not.toContain(url);
      expect(Object.hasOwn(persisted, url)).toBe(false);
    }
  });

  it('记录提交版本，同一天不重复；文章更新后第二天重推，删除的地址清掉', async () => {
    const db = fakeDb({
      state: { engines: { indexnow: { lastRunDate: '2026-11-01', pushed: { [ARTICLE('gone')]: 'old' } } } },
      articles,
    });
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(200, null));

    const first = await runSeoPush({ db, env: {}, fetcher, now });
    expect(first).toEqual([{ engine: 'indexnow', pending: 9, accepted: 9, rejected: 0, remain: null, error: null }]);
    const pushed = db.saved.at(-1).state.engines.indexnow.pushed;
    expect(db.saved.at(-1).name).toBe(SEO_PUSH_STATE_CONFIG_NAME);
    expect(pushed[ARTICLE('a1')]).toBe('2026-10-30 10:00:00');
    expect(pushed['https://boluo66.top/']).toBe('static');
    expect(pushed).not.toHaveProperty(ARTICLE('gone'));

    await expect(runSeoPush({ db, env: {}, fetcher, now })).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);

    db.articles = [articles[0], { ...articles[1], updated_at: new Date(2026, 10, 2, 8, 0, 0) }];
    await runSeoPush({ db, env: {}, fetcher, now: new Date(2026, 10, 3, 9, 0, 0) });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).urlList).toEqual([HELP_INDEX, ARTICLE('a2')]);
  });

  it('引擎各自记录；请求失败当天不再重试，也不记为已提交', async () => {
    const db = fakeDb({ articles, state: { engines: { indexnow: { lastRunDate: '2026-11-01', pushed: {} } } } });
    const fetcher = vi.fn(async (url) => {
      if (String(url).startsWith('http://data.zz.baidu.com'))
        throw Object.assign(new Error('t'), { name: 'TimeoutError' });
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
