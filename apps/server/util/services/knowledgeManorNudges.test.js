import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: { query: vi.fn(), getConnection: vi.fn() } }));
import pool from '../../db/index.js';
import { createManorNudgeService, generateManorNudges, startManorNudgeScheduler } from './knowledgeManorNudges.js';
import {
  MANOR_RECENT_MS,
  manorNudgeCalendar,
  operatedManorToday,
  manorNudgeMeta,
  recentManorOperation,
} from './knowledgeManorNudgePolicy.js';

const NOW = new Date('2026-11-02T13:00:00Z');
const ENV = { KNOWLEDGE_MANOR_ENABLED: 'true', KNOWLEDGE_MANOR_AUDIENCE: 'all' };
const summary = (overrides = {}) => ({
  fresh: false,
  water: 10,
  ripe: 3,
  tankFull: 1,
  compostFull: true,
  crafted: true,
  rewards: 1,
  ...overrides,
});
const owner = (id = 'owner', overrides = {}) => ({
  id,
  role: 'user',
  del_flag: '0',
  updatedAtMs: NOW.getTime() - 24 * 3600000,
  calendarPreferences: { timezone: 'Asia/Shanghai' },
  revision: 1,
  adopted: true,
  summary: summary(),
  ...overrides,
  // Most cases exercise an account that explicitly opted in.
  preferences: { notifyManor: true, ...overrides.preferences },
});

function fixture(records = [owner()]) {
  const state = { records, clock: NOW, env: { ...ENV }, mode: 'open', notifications: new Map() };
  const record = (id) => state.records.find((row) => row.id === id);
  const account = (row) => ({
    id: row.id,
    role: row.role,
    del_flag: row.del_flag,
    preferences: JSON.stringify(row.preferences),
  });
  const db = {
    query: vi.fn(async (sql, params = []) => {
      if (sql.includes('FROM knowledge_manors WHERE updated_at BETWEEN')) {
        const [since, until] = params;
        let rows = state.records
          .filter((row) => row.adopted && row.updatedAtMs >= since * 1000 && row.updatedAtMs <= until * 1000)
          .sort((a, b) => a.updatedAtMs - b.updatedAtMs || a.id.localeCompare(b.id));
        if (params.length > 3)
          rows = rows.filter(
            (row) => row.updatedAtMs > params[2] * 1000 || (row.updatedAtMs === params[2] * 1000 && row.id > params[4]),
          );
        return [rows.slice(0, params.at(-1)).map((row) => ({ userId: row.id, updatedAtMs: row.updatedAtMs }))];
      }
      if (sql.includes('FROM user WHERE id IN'))
        return [state.records.filter((row) => params.includes(row.id)).map(account)];
      if (sql.includes('FROM user_growth_preferences WHERE user_id IN'))
        return [
          state.records
            .filter((row) => params.includes(row.id))
            .map((row) => ({ userId: row.id, ...row.calendarPreferences })),
        ];
      const row = record(params[0]);
      if (sql.includes('FROM user WHERE id=')) return [row ? [account(row)] : []];
      if (sql.includes('FROM knowledge_manors WHERE user_id='))
        return [row ? [{ updatedAtMs: row.updatedAtMs, revision: row.revision }] : []];
      if (sql.includes('FROM user_growth_preferences WHERE user_id=')) return [row ? [row.calendarPreferences] : []];
      if (sql.includes('FROM notification WHERE user_id=')) {
        const saved = state.notifications.get(params[2]);
        return [saved ? [{ id: saved.id }] : []];
      }
      throw new Error('Unexpected fixture SQL');
    }),
  };
  const notify = vi.fn(async (id, payload) => {
    if (state.notifications.has(payload.sourceId)) return null;
    const notification = {
      ...payload,
      id: `notice-${state.notifications.size}`,
      user_id: id,
      source_type: payload.sourceType,
      source_id: payload.sourceId,
    };
    state.notifications.set(payload.sourceId, notification);
    return notification.id;
  });
  const attention = vi.fn(async (id) => record(id).summary);
  const logger = { warn: vi.fn(), log: vi.fn() };
  const service = createManorNudgeService({
    db,
    env: state.env,
    now: () => state.clock,
    attention,
    notify,
    runtimeReader: async () => ({ mode: state.mode }),
    logger,
  });
  return { ...state, state, db, notify, attention, logger, service, first: () => [...state.notifications.values()][0] };
}
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('庄园账号日历与通知时效', () => {
  it.each([
    ['2026-11-02T12:59:59Z', false],
    ['2026-11-02T13:00:00Z', true],
    ['2026-11-02T13:59:59Z', true],
    ['2026-11-02T14:00:00Z', false],
  ])('仅在账号 21 点窗口生成 %s', (clock, inWindow) => {
    expect(manorNudgeCalendar(new Date(clock), { timezone: 'Asia/Shanghai' })).toMatchObject({
      dayKey: '20261102',
      inWindow,
      expiresAt: '2026-11-02T16:00:00.000Z',
    });
  });
  it('复用成长时区并按当地零点过期，不跟随服务器时区或固定偏移', () => {
    expect(
      manorNudgeCalendar(new Date('2026-11-02T02:00:00Z'), { timezone: 'America/New_York', utcOffsetMinutes: 480 }),
    ).toMatchObject({
      dayKey: '20261101',
      utcOffsetMinutes: -300,
      inWindow: true,
      expiresAt: '2026-11-02T05:00:00.000Z',
    });
    const calendar = manorNudgeCalendar(new Date('2026-11-02T02:00:00Z'), { timezone: 'America/New_York' });
    expect(operatedManorToday(new Date('2026-11-01T04:30:00Z').getTime(), calendar)).toBe(true);
    expect(manorNudgeCalendar(NOW, { timezone: 'not-a-timezone' }).timezone).toBe('Asia/Shanghai');
  });
  it('最近操作的两端包含，拒绝未来和超过 14 天', () => {
    expect(recentManorOperation(NOW.getTime() - MANOR_RECENT_MS, NOW)).toBe(true);
    expect(recentManorOperation(NOW.getTime(), NOW)).toBe(true);
    expect(recentManorOperation(NOW.getTime() - MANOR_RECENT_MS - 1, NOW)).toBe(false);
    expect(recentManorOperation(NOW.getTime() + 1, NOW)).toBe(false);
  });
});

describe('每日庄园合并通知', () => {
  it.each([
    [true, true, 'manor_water_expiring', 10, 3],
    [false, true, 'manor_digest', 0, 3],
    [true, false, 'manor_water_expiring', 10, 0],
    [false, false, null, 0, 0],
  ])('两个子项 %s/%s 不互相绕过，水滴优先合并', async (water, digest, type, waterCount, ripe) => {
    const f = fixture([owner('owner', { preferences: { notifyManorWater: water, notifyManorDigest: digest } })]);
    await f.service.runBatch();
    expect(f.notify).toHaveBeenCalledTimes(type ? 1 : 0);
    if (type) {
      expect(f.first()).toMatchObject({
        type,
        source_type: 'manor_daily',
        source_id: 'owner:20261102',
        meta: { manor: { water: waterCount, ripe, dayKey: '20261102', expiresAt: '2026-11-02T16:00:00.000Z' } },
      });
      expect(manorNudgeMeta(f.first())).toBeTruthy();
    }
  });
  it.each(['notificationsInApp', 'notifyManor'])('关闭 %s 不统计或生成', async (key) => {
    const f = fixture([owner('owner', { preferences: { [key]: false } })]);
    await f.service.runBatch();
    expect(f.notify).not.toHaveBeenCalled();
    expect(f.attention).not.toHaveBeenCalled();
  });
  it.each([undefined, false, 'true', 1])('未明确开启庄园提醒（%s）时不统计或生成', async (value) => {
    const f = fixture([owner('owner', { preferences: { notifyManor: value } })]);
    await f.service.runBatch();
    expect(f.notify).not.toHaveBeenCalled();
    expect(f.attention).not.toHaveBeenCalled();
  });
  it('关闭入口小红点不影响已明确开启的通知', async () => {
    const f = fixture([owner('owner', { preferences: { manorEntryDot: false } })]);
    expect((await f.service.runBatch()).sent).toBe(1);
    expect((await f.service.preparePush(f.first(), { full: true })).status).toBe('ready');
  });
  it('主动开启后，当天有操作只抑制汇总，不抑制任务水滴', async () => {
    const f = fixture([owner('owner', { updatedAtMs: NOW.getTime() })]);
    await f.service.runBatch();
    expect(f.first().meta.manor).toMatchObject({
      water: 10,
      ripe: 0,
      tankFull: 0,
      compostFull: false,
      crafted: false,
      rewards: 0,
    });
    const noWater = fixture([owner('owner', { updatedAtMs: NOW.getTime(), summary: summary({ water: 0 }) })]);
    await noWater.service.runBatch();
    expect(noWater.notify).not.toHaveBeenCalled();
  });
  it.each([
    { role: 'visitor' },
    { del_flag: '1' },
    { adopted: false },
    { updatedAtMs: NOW.getTime() - MANOR_RECENT_MS - 1 },
    { updatedAtMs: NOW.getTime() + 1 },
    { summary: summary({ fresh: true }) },
    { summary: summary({ water: 0, ripe: 0, tankFull: 0, compostFull: false, crafted: false, rewards: 0 }) },
  ])('不向不合资格或无可收项的账号发送 %j', async (overrides) => {
    const f = fixture([owner('owner', overrides)]);
    await f.service.runBatch();
    expect(f.notify).not.toHaveBeenCalled();
  });
  it('关闭部署、内部范围和维护均阻止新提醒，test 仍可按权限使用', async () => {
    for (const setting of ['disabled', 'internal', 'maintenance']) {
      const f = fixture();
      if (setting === 'disabled') f.state.env.KNOWLEDGE_MANOR_ENABLED = 'false';
      if (setting === 'internal') f.state.env.KNOWLEDGE_MANOR_AUDIENCE = 'internal';
      if (setting === 'maintenance') f.state.mode = 'maintenance';
      await f.service.runBatch();
      expect(f.notify).not.toHaveBeenCalled();
    }
    const f = fixture([owner('tester', { role: 'test' })]);
    f.state.env.KNOWLEDGE_MANOR_AUDIENCE = 'internal';
    expect((await f.service.runBatch()).sent).toBe(1);
  });
  it('重复扫描、主原因切换和删除通知都不释放当天名额', async () => {
    const f = fixture([owner('owner', { summary: summary({ water: 0 }) })]);
    await f.service.runBatch();
    f.state.records[0].summary = summary();
    f.first().del_flag = 1;
    const repeat = await f.service.runBatch();
    expect(repeat.duplicates).toBe(1);
    expect(f.state.notifications.size).toBe(1);
    expect(f.first().type).toBe('manor_digest');
    expect(f.attention).toHaveBeenCalledTimes(1);
  });
  it('窗口外不做完整统计，窗口内重启仍按来源键恢复', async () => {
    const f = fixture();
    f.state.clock = new Date('2026-11-02T12:59:59Z');
    await f.service.runBatch();
    expect(f.attention).not.toHaveBeenCalled();
    f.state.clock = new Date('2026-11-02T13:30:00Z');
    await f.service.runBatch();
    expect(f.state.notifications.size).toBe(1);
    f.state.clock = new Date('2026-11-02T14:00:00Z');
    await f.service.runBatch();
    expect(f.state.notifications.size).toBe(1);
  });
  it('游标覆盖后续候选，单个账号失败不打断剩余账号', async () => {
    const f = fixture([owner('a'), owner('b'), owner('c')]);
    f.attention.mockImplementation(async (id) => {
      if (id === 'a') throw { code: 'ECONNRESET' };
      return summary();
    });
    let after = null,
      sent = 0,
      failed = 0;
    do {
      const r = await f.service.runBatch({ after, limit: 1 });
      after = r.nextCursor;
      sent += r.sent;
      failed += r.failed;
    } while (after);
    expect(sent).toBe(2);
    expect(failed).toBe(1);
    expect(f.logger.warn).toHaveBeenCalledOnce();
  });
  it('统计期间关闭开关或存档发生变化时不写入旧提醒', async () => {
    for (const changed of ['preference', 'save', 'revision']) {
      const f = fixture();
      f.attention.mockImplementation(async () => {
        if (changed === 'preference') f.state.records[0].preferences.notifyManor = false;
        else if (changed === 'save') f.state.records[0].updatedAtMs++;
        else f.state.records[0].revision++;
        return summary();
      });
      await f.service.runBatch();
      expect(f.notify).not.toHaveBeenCalled();
    }
  });
});

describe('庄园外发前复核', () => {
  it('未主动开启的账号，即使存在旧通知也取消外发', async () => {
    const f = fixture();
    await f.service.runBatch();
    delete f.state.records[0].preferences.notifyManor;
    f.attention.mockClear();
    expect((await f.service.preparePush(f.first(), { full: true })).status).toBe('cancelled');
    expect(f.attention).not.toHaveBeenCalled();
  });
  it('只在实际外发前统计，当前数量和开关决定附带内容', async () => {
    const f = fixture();
    await f.service.runBatch();
    f.attention.mockClear();
    expect((await f.service.preparePush(f.first())).status).toBe('ready');
    expect(f.attention).not.toHaveBeenCalled();
    f.state.records[0].summary = summary({ water: 2 });
    f.state.records[0].preferences.notifyManorDigest = false;
    const check = await f.service.preparePush(f.first(), { full: true });
    expect(check.status).toBe('ready');
    expect(check.notification.meta.manor).toMatchObject({ water: 2, ripe: 0, crafted: false });
    expect(f.first().meta.manor.water).toBe(10);
  });
  it.each(['water', 'switch', 'inApp', 'maintenance', 'disabled', 'account'])(
    '领取或资格失效 %s 时取消，不切换主类型',
    async (reason) => {
      const f = fixture();
      await f.service.runBatch();
      if (reason === 'water') f.state.records[0].summary = summary({ water: 0 });
      if (reason === 'switch') f.state.records[0].preferences.notifyManorWater = false;
      if (reason === 'inApp') f.state.records[0].preferences.notificationsInApp = false;
      if (reason === 'maintenance') f.state.mode = 'maintenance';
      if (reason === 'disabled') f.state.env.KNOWLEDGE_MANOR_ENABLED = 'false';
      if (reason === 'account') f.state.records[0].del_flag = '1';
      expect((await f.service.preparePush(f.first(), { full: true })).status).toBe('cancelled');
      expect(f.notify).toHaveBeenCalledOnce();
    },
  );
  it('汇总不因后来出现水滴改类型；当日发生操作后取消汇总', async () => {
    const f = fixture([owner('owner', { summary: summary({ water: 0 }) })]);
    await f.service.runBatch();
    f.state.records[0].summary = summary();
    const check = await f.service.preparePush(f.first(), { full: true });
    expect(check.notification.type).toBe('manor_digest');
    expect(check.notification.meta.manor.water).toBe(0);
    f.state.records[0].updatedAtMs = NOW.getTime();
    expect((await f.service.preparePush(f.first(), { full: true })).status).toBe('cancelled');
  });
  it('跨日、到达原截止时间或换时区已进入下一日都过期', async () => {
    const f = fixture();
    await f.service.runBatch();
    f.state.records[0].calendarPreferences.timezone = 'UTC';
    expect((await f.service.preparePush(f.first())).expiresAtMs).toBe(new Date('2026-11-02T16:00:00Z').getTime());
    f.state.records[0].calendarPreferences.timezone = 'Pacific/Kiritimati';
    expect((await f.service.preparePush(f.first())).status).toBe('expired');
    f.state.records[0].calendarPreferences.timezone = 'Asia/Shanghai';
    f.state.clock = new Date('2026-11-02T16:00:00Z');
    expect((await f.service.preparePush(f.first())).status).toBe('expired');
  });
  it('无效来源、日期、计数与截止时间失败关闭；数据库或统计异常交由重试', async () => {
    const f = fixture();
    await f.service.runBatch();
    const notice = f.first();
    for (const broken of [
      { ...notice, source_type: 'wrong' },
      { ...notice, source_id: 'wrong' },
      { ...notice, meta: { manor: { ...notice.meta.manor, dayKey: '20260230' } } },
      { ...notice, meta: { manor: { ...notice.meta.manor, water: -1 } } },
      { ...notice, meta: { manor: { ...notice.meta.manor, expiresAt: '2026-11-03T16:00:00Z' } } },
    ])
      expect((await f.service.preparePush(broken)).status).toBe('cancelled');
    f.attention.mockRejectedValueOnce({ code: 'ECONNRESET' });
    await expect(f.service.preparePush(notice, { full: true })).rejects.toMatchObject({ code: 'ECONNRESET' });
  });
});

describe('仅生产注册调度，隔离夹具直接调用核心', () => {
  it('核心不允许夹具缺少显式数据库而回退到默认连接池', () => {
    expect(() => createManorNudgeService()).toThrow('MANOR_NUDGE_DATABASE_REQUIRED');
  });
  it.each(['local', 'test', undefined])('运行环境 %s 不注册或访问数据库', async (runtime) => {
    const run = vi.fn(),
      env = { ...ENV, LIGHTNOTE_RUNTIME_ENV: runtime };
    const stop = startManorNudgeScheduler({ env, run });
    await generateManorNudges({ env });
    stop();
    expect(run).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
  it('启动立即检查，随后每五分钟，停止后不再调度', async () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const stop = startManorNudgeScheduler({ env: { LIGHTNOTE_RUNTIME_ENV: 'production' }, run });
    expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
