import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  usage: new Map(),
  reservations: new Map(),
  lockTail: Promise.resolve(),
  failPattern: null,
  queryLog: [],
}));

function usageKey(type, key, periodKey) {
  return `${type}|${key}|${periodKey}`;
}

function maybeFail(sql) {
  if (!state.failPattern || !state.failPattern.test(sql)) return;
  state.failPattern = null;
  const error = new Error('SQL_SECRET_HOST_AND_QUERY_MUST_NOT_BE_LOGGED');
  error.code = 'ECONNRESET';
  throw error;
}

const pool = vi.hoisted(() => ({
  getConnection: vi.fn(async () => {
    let unlock = () => {};
    let active = false;
    let snapshot = null;
    return {
      async beginTransaction() {
        const previous = state.lockTail;
        state.lockTail = new Promise((resolve) => {
          unlock = resolve;
        });
        await previous;
        active = true;
        snapshot = {
          usage: new Map(state.usage),
          reservations: new Map([...state.reservations].map(([key, value]) => [key, { ...value }])),
        };
      },
      async query(sql, params = []) {
        state.queryLog.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
        maybeFail(sql);

        if (/INSERT IGNORE INTO ai_token_reservations/i.test(sql)) {
          const [key, periodKey, reservedTokens] = params;
          if (state.reservations.has(key)) return [{ affectedRows: 0 }, []];
          state.reservations.set(key, {
            status: 'pending',
            period_key: periodKey,
            subjects_json: '[]',
            reserved_tokens: Number(reservedTokens || 0),
            actual_tokens: null,
          });
          return [{ affectedRows: 1 }, []];
        }
        if (/FROM ai_token_reservations/i.test(sql)) {
          const row = state.reservations.get(params[0]);
          return [row ? [{ ...row }] : [], []];
        }
        if (/UPDATE ai_token_reservations\s+SET status = \?/i.test(sql)) {
          const [status, subjectsJson, key] = params;
          const row = state.reservations.get(key);
          if (row) state.reservations.set(key, { ...row, status, subjects_json: subjectsJson });
          return [{ affectedRows: row ? 1 : 0 }, []];
        }
        if (/UPDATE ai_token_reservations\s+SET status = 'reconciled'/i.test(sql)) {
          const [actualTokens, key] = params;
          const row = state.reservations.get(key);
          if (row) {
            state.reservations.set(key, {
              ...row,
              status: 'reconciled',
              actual_tokens: Number(actualTokens || 0),
            });
          }
          return [{ affectedRows: row ? 1 : 0 }, []];
        }
        if (/INSERT INTO ai_token_usage/i.test(sql)) {
          const [type, key, periodKey] = params;
          const mapKey = usageKey(type, key, periodKey);
          if (!state.usage.has(mapKey)) state.usage.set(mapKey, { tokens: 0, calls: 0 });
          return [{ affectedRows: 1 }, []];
        }
        if (/SELECT tokens_used[\s\S]+FROM ai_token_usage/i.test(sql)) {
          const [type, key, periodKey] = params;
          const value = state.usage.get(usageKey(type, key, periodKey));
          return [value ? [{ tokens_used: value.tokens }] : [], []];
        }
        if (/UPDATE ai_token_usage[\s\S]+call_count = call_count \+ 1/i.test(sql)) {
          const [delta, type, key, periodKey] = params;
          const mapKey = usageKey(type, key, periodKey);
          const value = state.usage.get(mapKey) || { tokens: 0, calls: 0 };
          state.usage.set(mapKey, { tokens: value.tokens + Number(delta || 0), calls: value.calls + 1 });
          return [{ affectedRows: 1 }, []];
        }
        if (/UPDATE ai_token_usage[\s\S]+GREATEST\(0, tokens_used \+ \?\)/i.test(sql)) {
          const [delta, type, key, periodKey] = params;
          const mapKey = usageKey(type, key, periodKey);
          const value = state.usage.get(mapKey) || { tokens: 0, calls: 0 };
          state.usage.set(mapKey, {
            tokens: Math.max(0, value.tokens + Number(delta || 0)),
            calls: value.calls,
          });
          return [{ affectedRows: 1 }, []];
        }
        throw new Error(`UNHANDLED_TEST_SQL:${sql}`);
      },
      async commit() {
        if (!active) return;
        active = false;
        unlock();
      },
      async rollback() {
        if (!active) return;
        active = false;
        state.usage = new Map(snapshot.usage);
        state.reservations = new Map(snapshot.reservations);
        unlock();
      },
      release: vi.fn(),
    };
  }),
  query: vi.fn(async (sql, params = []) => {
    state.queryLog.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
    maybeFail(sql);
    if (/SELECT exp FROM user_growth/i.test(sql)) return [[{ exp: 0 }], []];
    if (/SELECT bonus_tokens FROM ai_daily_bonus/i.test(sql)) return [[], []];
    if (/SELECT tokens_used[\s\S]+FROM ai_token_usage/i.test(sql)) {
      const [type, key, periodKey] = params;
      const value = state.usage.get(usageKey(type, key, periodKey));
      return [value ? [{ tokens_used: value.tokens }] : [], []];
    }
    throw new Error(`UNHANDLED_TEST_POOL_SQL:${sql}`);
  }),
}));

vi.mock('../db/index.js', () => ({ default: pool }));
vi.mock('./growth.js', () => ({
  levelForExp: vi.fn(() => 1),
  rankOf: vi.fn(() => ({ aiTokenDaily: 100_000 })),
  RANKS: [{ aiTokenDaily: 100_000 }, { aiTokenDaily: 800_000 }],
}));

const originalEnv = {
  nodeEnv: process.env.NODE_ENV,
  enforce: process.env.AI_GATE_ENFORCE,
  hashSecret: process.env.AI_QUOTA_HASH_SECRET,
  networkMultiplier: process.env.AI_GUEST_NETWORK_QUOTA_MULTIPLIER,
};

let aiQuota;

async function reloadQuota(overrides = {}) {
  process.env.NODE_ENV = overrides.nodeEnv ?? 'test';
  if (Object.hasOwn(overrides, 'enforce')) {
    if (overrides.enforce == null) delete process.env.AI_GATE_ENFORCE;
    else process.env.AI_GATE_ENFORCE = overrides.enforce;
  } else {
    delete process.env.AI_GATE_ENFORCE;
  }
  if (Object.hasOwn(overrides, 'hashSecret')) {
    if (overrides.hashSecret == null) delete process.env.AI_QUOTA_HASH_SECRET;
    else process.env.AI_QUOTA_HASH_SECRET = overrides.hashSecret;
  } else {
    process.env.AI_QUOTA_HASH_SECRET = 'unit-test-quota-secret';
  }
  if (Object.hasOwn(overrides, 'networkMultiplier')) {
    if (overrides.networkMultiplier == null) delete process.env.AI_GUEST_NETWORK_QUOTA_MULTIPLIER;
    else process.env.AI_GUEST_NETWORK_QUOTA_MULTIPLIER = overrides.networkMultiplier;
  } else {
    delete process.env.AI_GUEST_NETWORK_QUOTA_MULTIPLIER;
  }
  vi.resetModules();
  aiQuota = await import('./aiQuota.js');
  return aiQuota;
}

function visitorRequest(fingerprint = 'device-a', ip = '203.0.113.23') {
  return { headers: { fingerprint }, body: {}, ip, socket: { remoteAddress: ip } };
}

function visitorContext(requestId) {
  return { userId: 'visitor', userRole: 'visitor', requestId };
}

function usageByType(type) {
  return [...state.usage.entries()].filter(([key]) => key.startsWith(`${type}|`)).map(([, value]) => value);
}

beforeEach(async () => {
  state.usage = new Map();
  state.reservations = new Map();
  state.lockTail = Promise.resolve();
  state.failPattern = null;
  state.queryLog = [];
  pool.getConnection.mockClear();
  pool.query.mockClear();
  vi.restoreAllMocks();
  await reloadQuota();
});

afterAll(() => {
  const restore = (name, value) => {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  };
  restore('NODE_ENV', originalEnv.nodeEnv);
  restore('AI_GATE_ENFORCE', originalEnv.enforce);
  restore('AI_QUOTA_HASH_SECRET', originalEnv.hashSecret);
  restore('AI_GUEST_NETWORK_QUOTA_MULTIPLIER', originalEnv.networkMultiplier);
});

describe('AI quota abuse hardening', () => {
  it('默认强制执行，只有明确 false 才关闭', async () => {
    expect(aiQuota.isEnforcing()).toBe(true);
    const req = visitorRequest();
    for (let index = 0; index < 6; index += 1) {
      await expect(aiQuota.reserve(req, visitorContext(`default-${index}`))).resolves.toMatchObject({ blocked: false });
    }
    await expect(aiQuota.reserve(req, visitorContext('default-blocked'))).resolves.toMatchObject({
      blocked: true,
      reason: 'quota_exceeded',
    });

    await reloadQuota({ enforce: 'false' });
    expect(aiQuota.isEnforcing()).toBe(false);
    await expect(aiQuota.reserve(req, visitorContext('explicit-observe'))).resolves.toMatchObject({ blocked: false });
  });

  it('兼容 fingerprint 头并使用可信网络前缀绑定', () => {
    expect(aiQuota.resolveFingerprint({ headers: { fingerprint: 'legacy-fp' } })).toBe('legacy-fp');
    expect(aiQuota.resolveFingerprint({ headers: { fingerprint: 'legacy-fp', 'x-fingerprint': 'new-fp' } })).toBe(
      'new-fp',
    );
    expect(aiQuota.resolveFingerprint({ headers: {}, body: { fingerprint: 'body-fp' } })).toBe('body-fp');
    expect(aiQuota.resolveFingerprint({ headers: {}, body: {}, ip: '203.0.113.91' })).toBe('203.0.113.91');
    expect(
      aiQuota.resolveNetworkBinding({
        ip: '203.0.113.91',
        headers: { 'x-forwarded-for': '198.51.100.99' },
      }),
    ).toBe('203.0.113.0/24');
    expect(aiQuota.resolveNetworkBinding({ ip: '2001:db8:abcd:1234:9999::1' })).toBe('2001:0db8:abcd:1234::/64');
  });

  it('账本与查询参数只包含 HMAC 标识，不保存原始 IP 或 fingerprint', async () => {
    const rawFingerprint = 'raw-device-fingerprint-private';
    const rawIp = '198.51.100.77';
    const handle = await aiQuota.reserve(visitorRequest(rawFingerprint, rawIp), visitorContext('privacy-1'));
    expect(handle.subjects).toHaveLength(2);
    expect(handle.subjects.every((item) => /^h_[a-f0-9]{48}$/.test(item.key))).toBe(true);
    const persisted = JSON.stringify({ reservations: [...state.reservations.values()], queryLog: state.queryLog });
    expect(persisted).not.toContain(rawFingerprint);
    expect(persisted).not.toContain(rawIp);
    expect(persisted).not.toContain('198.51.100.0/24');
  });

  it('轮换客户端 fingerprint 最终仍被同一可信网络桶拦截', async () => {
    const ip = '203.0.113.45';
    for (let index = 0; index < 3; index += 1) {
      const handle = await aiQuota.reserve(
        visitorRequest(`rotated-device-${index}`, ip),
        visitorContext(`rotate-${index}`),
      );
      expect(handle.blocked).toBe(false);
      await expect(aiQuota.reconcile(handle, 30_000)).resolves.toBe(true);
    }
    const blocked = await aiQuota.reserve(visitorRequest('rotated-device-4', ip), visitorContext('rotate-blocked'));
    expect(blocked).toMatchObject({ blocked: true, type: 'fingerprint', reason: 'quota_exceeded' });
    expect(usageByType('visitor_network')).toEqual([{ tokens: 90_000, calls: 3 }]);
  });

  it('登录用户继续使用成长等级单桶，不受游客网络桶影响', async () => {
    const handle = await aiQuota.reserve(visitorRequest('ignored-for-authenticated', '203.0.113.66'), {
      userId: 'user-1',
      userRole: 'user',
      requestId: 'authenticated-1',
    });
    expect(handle).toMatchObject({ blocked: false, type: 'user', quota: 100_000, reserved: 5000 });
    expect(handle.subjects).toEqual([
      expect.objectContaining({ type: 'user', key: 'user-1', quota: 100_000, used: 0 }),
    ]);
    expect(usageByType('user')).toEqual([{ tokens: 5000, calls: 1 }]);
    expect(usageByType('visitor_device')).toEqual([]);
    expect(usageByType('visitor_network')).toEqual([]);
  });

  it('并发 gate 在同一设备账本只允许一个请求占用最后额度', async () => {
    const req = visitorRequest('concurrent-device');
    for (let index = 0; index < 5; index += 1) {
      await aiQuota.reserve(req, visitorContext(`warmup-${index}`));
    }
    const results = await Promise.all([
      aiQuota.reserve(req, visitorContext('concurrent-a')),
      aiQuota.reserve(req, visitorContext('concurrent-b')),
    ]);
    expect(results.filter((item) => item.blocked)).toHaveLength(1);
    expect(results.filter((item) => !item.blocked)).toHaveLength(1);
    expect(usageByType('visitor_device')).toEqual([{ tokens: 30_000, calls: 6 }]);
  });

  it('重复 requestId 不会二次调用额度，占位结算也只执行一次', async () => {
    const req = visitorRequest('idempotent-device');
    const ctx = visitorContext('same-server-request-id');
    const handle = await aiQuota.reserve(req, ctx);
    await expect(aiQuota.reserve(req, ctx)).rejects.toMatchObject({
      code: 'AI_QUOTA_DUPLICATE_REQUEST',
      status: 409,
    });
    await expect(aiQuota.reconcile(handle, 1000)).resolves.toBe(true);
    await expect(aiQuota.reconcile(handle, 1000)).resolves.toBe(true);
    expect(usageByType('visitor_device')).toEqual([{ tokens: 1000, calls: 1 }]);
    expect(usageByType('visitor_network')).toEqual([{ tokens: 1000, calls: 1 }]);
  });

  it('客户端中途断开时不退还未用占位，避免断开即免费', async () => {
    const handle = await aiQuota.reserve(visitorRequest('aborted-device'), visitorContext('aborted-request'));
    await expect(aiQuota.reconcile(handle, 1000, { aborted: true })).resolves.toBe(true);
    expect(usageByType('visitor_device')).toEqual([{ tokens: 5000, calls: 1 }]);
    expect(usageByType('visitor_network')).toEqual([{ tokens: 5000, calls: 1 }]);
  });

  it('配额存储不可用时失败关闭，且日志不包含底层错误内容', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.failPattern = /INSERT IGNORE INTO ai_token_reservations/i;
    await expect(aiQuota.reserve(visitorRequest(), visitorContext('store-down'))).rejects.toMatchObject({
      code: 'AI_QUOTA_UNAVAILABLE',
      status: 503,
    });
    expect(state.usage.size).toBe(0);
    const logged = JSON.stringify(warning.mock.calls);
    expect(logged).toContain('AI_QUOTA_STORE_UNAVAILABLE');
    expect(logged).not.toContain('SQL_SECRET_HOST_AND_QUERY_MUST_NOT_BE_LOGGED');
  });

  it('结算故障保留占位而不是退成免费调用', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handle = await aiQuota.reserve(visitorRequest('reconcile-device'), visitorContext('reconcile-failure'));
    state.failPattern = /SET tokens_used = GREATEST/i;
    await expect(aiQuota.reconcile(handle, 1000)).resolves.toBe(false);
    expect(usageByType('visitor_device')).toEqual([{ tokens: 5000, calls: 1 }]);
    expect(usageByType('visitor_network')).toEqual([{ tokens: 5000, calls: 1 }]);
    expect(JSON.stringify(warning.mock.calls)).toContain('AI_QUOTA_STORE_UNAVAILABLE');
  });

  it('生产环境缺少 HMAC 密钥时拒绝游客 AI，不使用可预测生产桶', async () => {
    await reloadQuota({ nodeEnv: 'production', hashSecret: null });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(aiQuota.reserve(visitorRequest(), visitorContext('missing-secret'))).rejects.toMatchObject({
      code: 'AI_QUOTA_UNAVAILABLE',
      status: 503,
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(JSON.stringify(warning.mock.calls)).toContain('AI_QUOTA_STORE_UNAVAILABLE');
  });

  it('生产环境拒绝不足 32 字节的弱 HMAC 密钥', async () => {
    await reloadQuota({ nodeEnv: 'production', hashSecret: 'short-secret' });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(aiQuota.reserve(visitorRequest(), visitorContext('weak-secret'))).rejects.toMatchObject({
      code: 'AI_QUOTA_UNAVAILABLE',
      status: 503,
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(JSON.stringify(warning.mock.calls)).not.toContain('short-secret');
  });

  it('状态查询故障不会伪装成 exempt 无限额度', async () => {
    state.failPattern = /SELECT tokens_used/i;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(aiQuota.getStatus(visitorRequest(), visitorContext('status'))).resolves.toMatchObject({
      exempt: false,
      unavailable: true,
      error: 'AI_QUOTA_UNAVAILABLE',
      enforcing: true,
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain('SQL_SECRET_HOST_AND_QUERY_MUST_NOT_BE_LOGGED');
  });
});
