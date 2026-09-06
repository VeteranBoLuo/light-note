import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({
  default: {
    query: () => {
      throw Error('No real DB');
    },
  },
}));
vi.mock('./organizeSuggestionSources.js', () => ({
  readSuggestionCandidates: vi.fn(),
  readSuggestionSources: vi.fn(),
  readCurrentSuggestionSource: vi.fn(),
}));
vi.mock('../organizeAiSuggestionFeature.js', () => ({ isOrganizeAiSuggestionsEnabled: () => true }));
vi.mock('../aiOutboundDispatchGuard.js', () => ({
  lockActiveUserForUpdate: vi.fn(),
  withActiveUserAiDispatch: vi.fn(),
}));
import {
  previewV2,
  startV2,
  pauseV2,
  resumeV2,
  endV2,
  lifecycleState,
  runRuleBatch,
  insertBatches,
  refreshPendingSource,
} from './organizeSuggestionLifecycle.js';
import { readSuggestionCandidates, readSuggestionSources } from './organizeSuggestionSources.js';
import { buildSnapshot } from './organizeSuggestionRules.js';
const id = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
const options = { resourceTypes: ['note'], checks: ['tags', 'empty', 'duplicate'], scope: 'all', items: [] };
const run = () => ({
  id: 'r',
  user_id: 'u',
  run_version: 2,
  status: 'preparing',
  rule_phase: 'pending',
  summary_json: { total: 2 },
  options_json: options,
});
const dbFor = (handler) => ({
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  query: vi.fn(async (sql, args = []) => {
    const response = handler?.(sql, args);
    if (response !== undefined) return response;
    if (sql.startsWith('INSERT') || sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
    throw Error(`Unexpected SQL ${sql}`);
  }),
});
beforeEach(() => vi.clearAllMocks());
describe('轻量预检', () => {
  it.each([40, 476, 1000])('%i项按批冻结，不读取正文或生成建议', async (count) => {
    readSuggestionCandidates.mockImplementation(async (_db, _user, type, { after = '', limit }) =>
      Array.from({ length: Math.min(limit, Math.max(0, count - Number(after))) }, (_, i) => ({
        type,
        id: String(Number(after) + i + 1),
        title: '资料',
      })),
    );
    const db = dbFor((sql) => (sql.includes('request_id=?') ? [[]] : undefined));
    const result = await previewV2(db, { userId: 'u', input: options, requestId: id });
    expect(result.summary).toMatchObject({ total: count, aiTotal: null, estimatedTokensUpper: null });
    expect(readSuggestionSources).not.toHaveBeenCalled();
    expect(db.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO organize_suggestion_items'))).toHaveLength(
      Math.ceil(count / 100),
    );
    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO organize_suggestions('))).toBe(false);
  });
  it('字节上限也会分批', async () => {
    const db = dbFor();
    await insertBatches(
      db,
      'INSERT VALUES ?',
      Array.from({ length: 3 }, () => ['x'.repeat(300000)]),
    );
    expect(db.query).toHaveBeenCalledTimes(3);
  });
});
describe('任务状态', () => {
  it('暂停保留队列，查询区分规则和在途进度', async () => {
    const row = run();
    const db = dbFor((sql) => (sql.includes('FROM organize_suggestion_runs') ? [[row]] : undefined));
    await pauseV2(db, { userId: 'u', id: 'r' });
    expect(db.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'))).toHaveLength(1);
    expect(
      lifecycleState(
        { ...row, status: 'paused', pause_reason: 'quota' },
        [
          { ai_status: 'running', total: 1 },
          { ai_status: 'queued', total: 3 },
        ],
        [{ rule_status: 'loaded', total: 4 }],
      ),
    ).toMatchObject({ canResume: true, canPause: false, canEnd: true, inFlight: 1, queued: 3, checked: 4 });
  });
  it('没有确认替换时不结束旧任务，确认后才原子启动新任务', async () => {
    const newer = { ...run(), id: 'new', status: 'preview' };
    const old = run();
    const db = dbFor((sql) =>
      sql.includes('id<>?') ? [[old]] : sql.includes('FROM organize_suggestion_runs') ? [[newer]] : undefined,
    );
    await expect(startV2(db, { userId: 'u', id: 'new', requestId: id })).rejects.toMatchObject({
      code: 'ORGANIZE_ACTIVE_RUN_EXISTS',
    });
    expect(db.query.mock.calls.some(([sql]) => sql.includes("status='ended'"))).toBe(false);
    const created = await startV2(db, { userId: 'u', id: 'new', requestId: id, replaceRunId: 'r' });
    expect(created.status).toBe('preparing');
    expect(db.commit).toHaveBeenCalledOnce();
  });
  it('结束只关闭未运行队列，不删除建议', async () => {
    const db = dbFor();
    await endV2(db, run());
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
    expect(db.query.mock.calls[0][0]).toContain("i.ai_status='queued'");
    expect(lifecycleState({ ...run(), status: 'ended' })).toMatchObject({ canResume: false, canEnd: false });
  });
  it('额度不足时继续保持暂停，恢复后只有明确调用继续才激活', async () => {
    const row = { ...run(), status: 'paused', rule_phase: 'completed' };
    const db = dbFor((sql) =>
      sql.includes('FROM user')
        ? [[{ id: 'u', role: 'user' }]]
        : sql.includes('FROM organize_suggestion_items')
          ? [[]]
          : sql.includes('FROM organize_suggestion_runs')
            ? [[row]]
            : undefined,
    );
    await expect(
      resumeV2(
        db,
        { userId: 'u', id: 'r' },
        { restrictions: async () => [], quota: async () => ({ remaining: 0, enforcing: true }) },
      ),
    ).rejects.toMatchObject({ code: 'ORGANIZE_QUOTA_PAUSED' });
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(
      await resumeV2(
        db,
        { userId: 'u', id: 'r' },
        { restrictions: async () => [], quota: async () => ({ remaining: 100000 }) },
      ),
    ).toMatchObject({ status: 'running' });
  });
});
it('规则读取按批恢复，独立空内容结果先交付，全部快照就绪后比较跨批重复', async () => {
  const row = run();
  let loaded = false;
  const snapshots = ['1', '2'].map((id) =>
    buildSnapshot('note', { id, title: '未命名文档', type: 'html', content: '相同正文', update_time: '2020-01-01' }),
  );
  const records = snapshots.map((s, index) => ({
    id: `i${index}`,
    resource_type: 'note',
    resource_id: s.id,
    snapshot_json: s,
    rule_status: index === 0 ? 'loaded' : 'pending',
  }));
  readSuggestionSources.mockResolvedValue([snapshots[1]]);
  const db = dbFor((sql, args) => {
    if (sql.includes('WHERE run_version=2')) return [[row]];
    if (sql.includes('FROM organize_suggestion_runs')) return [[row]];
    if (sql.includes("rule_status='pending'")) return [loaded ? [] : [records[1]]];
    if (sql.includes("rule_status IN ('loaded','completed')")) return [records];
    if (sql.startsWith('UPDATE organize_suggestion_runs SET rule_lease_token=?')) row.rule_lease_token = args[0];
    return undefined;
  });
  await runRuleBatch(db);
  let payloads = db.query.mock.calls
    .filter(([sql]) => sql.startsWith('INSERT IGNORE INTO organize_suggestions'))
    .flatMap(([, args]) => args[0].map((r) => JSON.parse(r[6])));
  expect(payloads.every((s) => s.kind === 'empty')).toBe(true);
  loaded = true;
  await runRuleBatch(db);
  payloads = db.query.mock.calls
    .filter(([sql]) => sql.startsWith('INSERT IGNORE INTO organize_suggestions'))
    .flatMap(([, args]) => args[0].map((r) => JSON.parse(r[6])));
  expect(payloads.filter((s) => s.kind === 'duplicate').every((s) => s.members?.length === 2)).toBe(true);
  expect(payloads.filter((s) => s.kind === 'duplicate')).toHaveLength(2);
});

it('Schema 迁移为旧任务保留已完成阶段，不回填旧取消任务', () => {
  const migration = readFileSync(
    new URL('../../migrations/20260906_organize_run_lifecycle.sql', import.meta.url),
    'utf8',
  );
  const assertions = readFileSync(new URL('../../migrations/schema-assertions.sql', import.meta.url), 'utf8');
  for (const column of [
    'run_version',
    'rule_phase',
    'pause_reason',
    'rule_lease_token',
    'rule_lease_expires_at',
    'rule_status',
    'started_at',
  ]) {
    expect(migration).toContain(column);
    expect(assertions).toContain(column);
  }
  expect(migration).toContain('run_version INT NOT NULL DEFAULT 1');
  expect(migration).toContain("rule_status VARCHAR(24) NOT NULL DEFAULT ''completed''");
  expect(migration).toContain("information_schema.COLUMNS");
  expect(migration).toContain("information_schema.STATISTICS");
  expect(migration).not.toMatch(/UPDATE|DELETE|TRUNCATE/);
});
it('资源变化后重查剩余元信息和关联重复成员，不重写已应用建议', async () => {
  const old = buildSnapshot('note', { id: '1', title: '同名资料', content: '旧正文', type: 'html' });
  const current = buildSnapshot('note', { id: '1', title: '同名资料', content: '新的不同正文', type: 'html' });
  const other = buildSnapshot('note', { id: '2', title: '同名资料', content: '旧正文', type: 'html' });
  const records = [
    {
      id: 'i1',
      resource_id: '1',
      resource_type: 'note',
      rule_status: 'completed',
      snapshot_json: old,
      lease_token: 'lease',
    },
    { id: 'i2', resource_id: '2', resource_type: 'note', rule_status: 'completed', snapshot_json: other },
  ];
  const row = {
    ...run(),
    rule_phase: 'completed',
    options_json: { ...options, checks: ['tags', 'title', 'duplicate'] },
  };
  readSuggestionSources.mockResolvedValue([other]);
  const db = dbFor((sql) =>
    sql.includes('FROM organize_suggestion_runs')
      ? [[row]]
      : sql.includes('FROM organize_suggestion_items')
        ? [records]
        : sql.includes('FROM organize_suggestions')
          ? [
              [
                { id: 'applied-tag', kind: 'tags', status: 'applied' },
                { id: 'pending-title', kind: 'title', status: 'running' },
              ],
            ]
          : undefined,
  );
  const kinds = await refreshPendingSource(db, { id: 'i1', run_id: 'r', user_id: 'u', lease_token: 'lease' }, current);
  expect(kinds).toEqual(['title']);
  expect(readSuggestionSources).toHaveBeenCalledWith(db, 'u', 'note', { ids: ['2'], limit: 100 });
  expect(
    db.query.mock.calls.some(([sql, p]) => sql.startsWith('UPDATE organize_suggestions') && p.includes('applied-tag')),
  ).toBe(false);
  const duplicates = db.query.mock.calls.filter(
    ([sql, p]) => sql.startsWith('UPDATE organize_suggestions') && p.at(-1) === 'duplicate',
  );
  expect(duplicates.every(([, p]) => JSON.parse(p[1]).reason.includes('正文不同'))).toBe(true);
});
