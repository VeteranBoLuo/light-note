import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({
  default: {
    query: vi.fn(() => {
      throw Error('Real DB is forbidden in tests');
    }),
  },
}));
vi.mock('./organizeSuggestionSources.js', () => ({
  readSuggestionSources: vi.fn(),
  readSuggestionCandidates: vi.fn(),
  readCurrentSuggestionSource: vi.fn(),
}));
vi.mock('./organizeSuggestionActions.js', () => ({ applySuggestionMutation: vi.fn() }));
vi.mock('./organizeSuggestionModel.js', () => ({
  suggestResourceMetadata: vi.fn(),
  estimateResourceMetadataTokens: vi.fn(() => 2000),
}));
vi.mock('../personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: vi.fn().mockResolvedValue() }));
vi.mock('../aiExecution/context.js', () => ({ getActiveAiExecution: vi.fn(() => ({ providerCallCount: 0 })) }));
vi.mock('../aiExecution/service.js', () => ({ runAiExecution: vi.fn() }));
vi.mock('../organizeAiSuggestionFeature.js', () => ({ isOrganizeAiSuggestionsEnabled: vi.fn(() => true) }));
import {
  readSuggestionSources,
  readSuggestionCandidates,
  readCurrentSuggestionSource,
} from './organizeSuggestionSources.js';
import { applySuggestionMutation } from './organizeSuggestionActions.js';
import { suggestResourceMetadata } from './organizeSuggestionModel.js';
import { getActiveAiExecution } from '../aiExecution/context.js';
import { runAiExecution } from '../aiExecution/service.js';
import { isOrganizeAiSuggestionsEnabled } from '../organizeAiSuggestionFeature.js';
import {
  applySuggestionBatch,
  getArchiveDraft,
  getSuggestionRun,
  previewSuggestionRun,
  createSuggestionRun,
  actOnSuggestion,
  cancelSuggestionRun,
  runSingleSuggestionItem,
} from './organizeSuggestionService.js';
import { buildSnapshot } from './organizeSuggestionRules.js';
const requestId = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
const options = { resourceTypes: ['note'], checks: ['empty', 'duplicate'], scope: 'all' };
const run = {
  id: 'run',
  user_id: 'u',
  status: 'preview',
  summary_json: { total: 101, aiTotal: 0 },
  options_json: options,
};
function database(extra) {
  const c = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    query: vi.fn(async (sql, p = []) => {
      if (sql.includes('WHERE run_version=2') || sql.includes('id<>?')) return [[]];
      if (sql.startsWith('SELECT r.id,r.status')) return extra?.(sql, p) ?? [[{ id: 'run', status: 'running' }]];
      if (sql.includes('FROM user')) return [[{ id: 'u', role: 'user', del_flag: 0 }]];
      const result = extra?.(sql, p);
      if (result !== undefined) return result;
      if (sql.startsWith('INSERT') || sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
      throw Error(`Unexpected SQL: ${sql}`);
    }),
  };
  return c;
}
const snap = (id = '1') =>
  buildSnapshot('note', { id, title: '未命名文档', type: 'html', content: '', update_time: '2020-01-01' });
beforeEach(() => {
  vi.clearAllMocks();
  isOrganizeAiSuggestionsEnabled.mockReturnValue(true);
});
describe('整理范围与生命周期', () => {
  it('预检冻结全部 101 项，两页完整读取而不调用 AI', async () => {
    readSuggestionCandidates
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => snap(String(i + 1))))
      .mockResolvedValueOnce([snap('101')]);
    const db = database((sql) => (sql.includes('request_id=?') ? [[]] : undefined));
    const result = await previewSuggestionRun(db, { userId: 'u', input: options, requestId });
    expect(result.summary).toMatchObject({ total: 101, ruleTotal: null, aiTotal: null, estimatedTokensUpper: null });
    expect(readSuggestionCandidates).toHaveBeenCalledTimes(2);
    expect(readSuggestionCandidates.mock.calls[1][3].after).toBe('100');
    expect(db.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO organize_suggestion_items'))).toHaveLength(
      2,
    );
    expect(suggestResourceMetadata).not.toHaveBeenCalled();
    expect(runAiExecution).not.toHaveBeenCalled();
    expect(db.commit).toHaveBeenCalledOnce();
  });
  it('标签与空内容混选时，书签不计入规则检查数量', async () => {
    const bookmark = buildSnapshot('bookmark', { id: 'b', name: 'Example', tags: [{ id: 't', name: 'Existing' }] });
    readSuggestionCandidates.mockResolvedValueOnce([bookmark]).mockResolvedValueOnce([snap()]);
    const db = database((sql) =>
      sql.includes('request_id=?') ? [[]] : sql.includes('FROM tag WHERE') ? [[]] : undefined,
    );
    const result = await previewSuggestionRun(db, {
      userId: 'u',
      input: { resourceTypes: ['bookmark', 'note'], checks: ['tags', 'empty'], scope: 'recent' },
      requestId,
    });
    expect(result.summary).toMatchObject({ total: 2, ruleTotal: null });
    expect(suggestResourceMetadata).not.toHaveBeenCalled();
  });
  it('仅标题的新预检不读取书签或文件', async () => {
    readSuggestionCandidates.mockResolvedValueOnce([snap()]);
    const db = database((sql) => (sql.includes('request_id=?') ? [[]] : undefined));
    const result = await previewSuggestionRun(db, {
      userId: 'u',
      input: { resourceTypes: ['bookmark', 'note', 'file'], checks: ['title'], scope: 'recent' },
      requestId,
    });
    expect(result.options.resourceTypes).toEqual(['note']);
    expect(readSuggestionCandidates).toHaveBeenCalledTimes(1);
    expect(readSuggestionCandidates.mock.calls[0][2]).toBe('note');
  });
  it('重复预检请求读取同一冻结范围，参数不同则冲突', async () => {
    const db = database((sql) =>
      sql.includes('request_id=?') ? [[{ ...run, options_json: { ...options, items: [] } }]] : undefined,
    );
    expect((await previewSuggestionRun(db, { userId: 'u', input: options, requestId })).id).toBe('run');
    expect(readSuggestionSources).not.toHaveBeenCalled();
    await expect(
      previewSuggestionRun(db, { userId: 'u', input: { ...options, scope: 'recent' }, requestId }),
    ).rejects.toMatchObject({ code: 'ORGANIZE_REQUEST_CONFLICT' });
  });
  it('纯规则任务直接完成，重复开始不插入或再分析', async () => {
    const db = database((sql) => (sql.includes('FROM organize_suggestion_runs') ? [[{ ...run }]] : undefined));
    expect((await createSuggestionRun(db, { userId: 'u', id: 'run', requestId })).status).toBe('completed');
    const done = database((sql) =>
      sql.includes('FROM organize_suggestion_runs') ? [[{ ...run, status: 'completed' }]] : undefined,
    );
    await createSuggestionRun(done, { userId: 'u', id: 'run', requestId });
    expect(done.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(runAiExecution).not.toHaveBeenCalled();
  });
  it('AI 关闭时仍交付规则结果，AI 项单独标记失败', async () => {
    isOrganizeAiSuggestionsEnabled.mockReturnValue(false);
    const db = database((sql) =>
      sql.includes('FROM organize_suggestion_runs')
        ? [[{ ...run, summary_json: { total: 2, aiTotal: 1 } }]]
        : undefined,
    );
    expect((await createSuggestionRun(db, { userId: 'u', id: 'run', requestId })).status).toBe('completed');
    expect(db.query.mock.calls.some(([sql]) => sql.includes("ai_status='failed'"))).toBe(true);
  });
  it('取消仅关闭等待项，保留规则建议和运行中的项', async () => {
    const db = database((sql) =>
      sql.includes('FROM organize_suggestion_runs') ? [[{ ...run, status: 'running' }]] : undefined,
    );
    await cancelSuggestionRun(db, { userId: 'u', id: 'run' });
    const changes = db.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'));
    expect(changes[0][0]).toContain("i.ai_status='queued'");
    expect(changes[1][0]).toContain("ai_status='queued'");
  });
  it('旧版本建议不能覆盖外部编辑', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM organize_suggestion_runs')) return [[{ ...run, status: 'completed' }]];
      if (sql.includes('FROM organize_suggestions'))
        return [[{ item_id: 'i', kind: 'title', status: 'pending', payload_json: { after: '新标题' } }]];
      if (sql.includes('FROM organize_suggestion_items'))
        return [[{ id: 'i', resource_type: 'note', resource_id: '1', version_hash: 'old', ai_status: 'completed' }]];
      if (sql.startsWith('SELECT id FROM note')) return [[{ id: '1' }]];
    });
    readCurrentSuggestionSource.mockResolvedValue({ ...snap(), version: 'external' });
    await expect(
      actOnSuggestion(db, { userId: 'u', runId: 'run', suggestionId: 's', action: 'apply', requestId }),
    ).rejects.toMatchObject({ code: 'ORGANIZE_RESOURCE_CHANGED' });
    expect(applySuggestionMutation).not.toHaveBeenCalled();
    expect(db.rollback).toHaveBeenCalledOnce();
  });
  it('应用成功后更新资源基线，重复应用不会再次写入', async () => {
    const item = { id: 'i', resource_type: 'note', resource_id: '1', version_hash: 'before', ai_status: 'completed' };
    let applied = false;
    const db = database((sql) => {
      if (sql.includes('FROM organize_suggestion_runs')) return [[{ ...run, status: 'completed' }]];
      if (sql.startsWith('SELECT * FROM organize_suggestions'))
        return [
          [{ item_id: 'i', kind: 'title', status: applied ? 'applied' : 'pending', payload_json: { after: '新标题' } }],
        ];
      if (sql.includes('FROM organize_suggestion_items')) return [[item]];
      if (sql.startsWith('SELECT id FROM note')) return [[{ id: '1' }]];
      if (sql.includes("SET status='applied'")) {
        applied = true;
        return [{ affectedRows: 1 }];
      }
    });
    readCurrentSuggestionSource
      .mockResolvedValueOnce({ ...snap(), version: 'before' })
      .mockResolvedValueOnce({ ...snap(), version: 'after' });
    applySuggestionMutation.mockResolvedValue({ applied: '新标题' });
    const input = { userId: 'u', runId: 'run', suggestionId: 's', action: 'apply', requestId };
    await actOnSuggestion(db, input);
    expect(db.query.mock.calls.find(([sql]) => sql.includes('SET version_hash='))[1][0]).toBe('after');
    await actOnSuggestion(db, input);
    expect(applySuggestionMutation).toHaveBeenCalledOnce();
  });
  it('未部署新表的 Worker 不调用模型', async () => {
    const db = database(() => {
      throw Object.assign(Error('missing'), { code: 'ER_NO_SUCH_TABLE' });
    });
    expect(await runSingleSuggestionItem('worker', db)).toBe(false);
    expect(suggestResourceMetadata).not.toHaveBeenCalled();
  });
});
it('一个资源的标题和标签共享一次外发，交付先于计费完成', async () => {
  let lease;
  const source = { ...snap(), version: 'v', source: { title: '未命名文档', text: 'Vue 组件通信' } };
  readCurrentSuggestionSource.mockResolvedValue(source);
  const db = database((sql, p) => {
    if (sql.startsWith('SELECT i.*'))
      return [
        [
          {
            id: 'i',
            run_id: 'run',
            user_id: 'u',
            resource_type: 'note',
            resource_id: '1',
            version_hash: 'v',
            ai_kinds_json: ['tags', 'title'],
            ai_status: 'queued',
          },
        ],
      ];
    if (sql.includes("SET ai_status='running'")) {
      lease = p[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM organize_suggestion_runs')) return [[run]];
    if (sql.startsWith('SELECT lease_token')) return [[{ lease_token: lease }]];
    if (sql.startsWith('SELECT * FROM organize_suggestions'))
      return [
        [
          { id: 't', kind: 'tags', payload_json: { kind: 'tags' } },
          { id: 'n', kind: 'title', payload_json: { kind: 'title' } },
        ],
      ];
    if (sql.includes('COUNT(*)')) return [[{ total: 0 }]];
    if (sql.includes('FROM tag')) return [[]];
  });
  const model = vi
    .fn()
    .mockResolvedValue({ title: { name: 'Vue 通信', evidence: 'Vue' }, tags: [{ id: null, name: 'Vue' }] });
  const execution = vi.fn(async (_config, callback) => {
    const value = await callback();
    expect(db.query.mock.calls.some(([sql, p]) => sql.includes('SET ai_status=?') && p[0] === 'completed')).toBe(true);
    return value;
  });
  await runSingleSuggestionItem('worker', db, {
    dispatch: async (_db, _id, cb) => cb({ connection: db, user: { id: 'u', role: 'user' } }),
    restrictions: async () => [],
    model,
    runExecution: execution,
  });
  expect(model).toHaveBeenCalledOnce();
  expect(model.mock.calls[0][1]).toEqual(['tags', 'title']);
  expect(execution).toHaveBeenCalledOnce();
  expect(execution.mock.calls[0][0]).toMatchObject({
    organizeRunId: expect.any(String),
    organizeItemId: expect.any(String),
  });
  const claims = db.query.mock.calls.map(([sql]) => sql).filter((sql) => sql.includes('FOR UPDATE'));
  expect(claims.length).toBeGreaterThanOrEqual(2);
  expect(claims.every((sql) => !/SKIP LOCKED|NOWAIT/.test(sql))).toBe(true);
  expect(db.commit).toHaveBeenCalled();
});
it('过期运行租约不再次调用 Provider，避免崩溃重试重复收费', async () => {
  const db = database((sql) => {
    if (sql.startsWith('SELECT i.*'))
      return [[{ id: 'i', run_id: 'run', user_id: 'u', ai_status: 'running', lease_token: 'old' }]];
    if (sql.includes('FROM organize_suggestion_runs')) return [[run]];
    if (sql.startsWith('SELECT lease_token')) return [[{ lease_token: 'old' }]];
    if (sql.startsWith('SELECT * FROM organize_suggestions')) return [[]];
    if (sql.includes('COUNT(*)')) return [[{ total: 0 }]];
  });
  const model = vi.fn();
  expect(await runSingleSuggestionItem('worker', db, { model })).toBe(true);
  expect(model).not.toHaveBeenCalled();
  expect(db.query.mock.calls.find(([sql]) => sql.includes('SET ai_status=?'))[1]).toContain(
    'ORGANIZE_WORKER_INTERRUPTED',
  );
});

describe('新版 AI 暂停与租约边界', () => {
  function setup({ started = false, stale = false, ended = false, code = 'AI_QUOTA_EXCEEDED' } = {}) {
    let token;
    const current = buildSnapshot('note', { id: '1', title: '测试', content: '需要分析的正文', type: 'html' });
    readCurrentSuggestionSource.mockResolvedValue(current);
    const live = { ...run, run_version: 2, rule_phase: 'completed', status: ended ? 'ended' : 'running' };
    const db = database((sql, p) => {
      if (sql.startsWith('SELECT r.id,r.status')) return [[{ ...live, status: 'running' }]];
      if (sql.startsWith('SELECT i.*'))
        return [
          [
            {
              id: 'i',
              run_id: 'run',
              user_id: 'u',
              resource_id: '1',
              resource_type: 'note',
              version_hash: current.version,
              ai_kinds_json: ['tags'],
              ai_status: 'queued',
            },
          ],
        ];
      if (sql.includes("SET ai_status='running',lease_token=?")) token = p[0];
      if (sql.startsWith('SELECT lease_token')) return [[{ lease_token: token }]];
      if (sql.includes('FROM organize_suggestion_runs')) return [[live]];
      if (sql.includes('FROM tag')) return [[]];
      if (sql.startsWith('SELECT * FROM organize_suggestions'))
        return [[{ id: 's', kind: 'tags', payload_json: { kind: 'tags' } }]];
      if (sql.includes('COUNT(*)')) return [[{ total: 1 }]];
      if (sql.includes('AND lease_token=?') && stale) return [{ affectedRows: 0 }];
    });
    getActiveAiExecution.mockReturnValue({ providerCallCount: started ? 1 : 0 });
    const model = vi.fn(async () => {
      throw Object.assign(new Error('余额不足'), { code });
    });
    const dependencies = {
      dispatch: async (_db, _id, cb) => cb({ connection: db, user: { id: 'u', role: 'user' } }),
      restrictions: async () => [],
      model,
      runExecution: async (_config, cb) => cb(),
    };
    return { db, model, dependencies };
  }
  it('尚未外发的额度失败退回队列并暂停，不取消其他项', async () => {
    const { db, dependencies } = setup();
    await runSingleSuggestionItem('worker', db, dependencies);
    const updates = db.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'));
    expect(updates.some(([sql, p]) => sql.includes('AND lease_token=?') && p[0] === 'queued')).toBe(true);
    expect(updates.some(([sql]) => sql.includes("status='paused'"))).toBe(true);
    expect(updates.some(([sql]) => sql.includes("status='cancelled'"))).toBe(false);
  });
  it('已经外发的失败不重新排队，只暂停剩余项目', async () => {
    const { db, dependencies } = setup({ started: true });
    await runSingleSuggestionItem('worker', db, dependencies);
    expect(db.query.mock.calls.some(([sql, p]) => sql.includes('SET ai_status=?') && p[0] === 'failed')).toBe(true);
    expect(db.query.mock.calls.some(([sql, p]) => sql.includes('SET ai_status=?') && p[0] === 'queued')).toBe(false);
    expect(db.query.mock.calls.some(([sql]) => sql.includes("status='paused'"))).toBe(true);
  });
  it('迟到额度错误不能覆盖新租约或暂停已完成任务', async () => {
    const { db, dependencies } = setup({ stale: true });
    await runSingleSuggestionItem('worker', db, dependencies);
    expect(db.query.mock.calls.some(([sql]) => sql.includes("status='paused'"))).toBe(false);
  });
  it('AI 服务超时暂停剩余队列，外发结果不确定的当前项不重试', async () => {
    const { db, dependencies } = setup({ started: true, code: 'AI_GATEWAY_TIMEOUT' });
    await runSingleSuggestionItem('worker', db, dependencies);
    expect(db.query.mock.calls.some(([sql, p]) => sql.includes("status='paused'") && p[0] === 'unavailable')).toBe(
      true,
    );
    expect(db.query.mock.calls.some(([sql, p]) => sql.includes('SET ai_status=?') && p[0] === 'failed')).toBe(true);
  });
  it('任务已结束时不被额度错误重新激活', async () => {
    const { db, dependencies } = setup({ ended: true });
    await runSingleSuggestionItem('worker', db, dependencies);
    expect(db.query.mock.calls.some(([sql, p]) => sql.includes('AND lease_token=?') && p[0] === 'cancelled')).toBe(
      true,
    );
    expect(db.query.mock.calls.some(([sql]) => sql.includes("status='paused'"))).toBe(false);
  });
});

it.each(['unchanged', 'changed', 'ended', 'lease_lost'])('书签材料在外发锁外准备，外发前复核 %s', async (state) => {
  const current = buildSnapshot('bookmark', { id: 'b', name: '字体页面', description: '', url: 'https://example.com' });
  readCurrentSuggestionSource.mockResolvedValue(current);
  if (state === 'changed')
    readCurrentSuggestionSource
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ ...current, version: 'new-version' });
  let lease;
  const db = database((sql, p) => {
    if (sql.startsWith('SELECT r.id,r.status')) return [[{ id: 'run', status: 'running', run_version: 2 }]];
    if (sql.startsWith('SELECT i.*'))
      return [
        [
          {
            id: 'i',
            run_id: 'run',
            user_id: 'u',
            resource_type: 'bookmark',
            resource_id: 'b',
            version_hash: current.version,
            ai_kinds_json: ['tags'],
            ai_status: 'queued',
          },
        ],
      ];
    if (sql.includes("SET ai_status='running'")) {
      lease = p[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM organize_suggestion_runs'))
      return [[{ ...run, status: state === 'ended' ? 'ended' : 'running' }]];
    if (sql.startsWith('SELECT lease_token')) return [[{ lease_token: state === 'lease_lost' ? 'other' : lease }]];
    if (sql.startsWith('SELECT * FROM organize_suggestions'))
      return [[{ id: 't', kind: 'tags', payload_json: { kind: 'tags' } }]];
    if (sql.includes('COUNT(*)')) return [[{ total: 0 }]];
    if (sql.includes('FROM tag')) return [[]];
  });
  let inDispatch = false;
  const prepared = { pageInfo: '开源字体项目' };
  const prepare = vi.fn(async () => {
    expect(inDispatch).toBe(false);
    return prepared;
  });
  const model = vi.fn(async (_snapshot, _kinds, _tags, evidence) => {
    expect(inDispatch).toBe(true);
    expect(evidence).toBe(prepared);
    return { tags: [], tagOutcome: 'already_associated' };
  });
  const runExecution = vi.fn(async (_config, callback) => callback());
  await runSingleSuggestionItem('worker', db, {
    prepare,
    model,
    runExecution,
    restrictions: async () => [],
    dispatch: async (_db, _id, callback) => {
      inDispatch = true;
      return callback({ connection: db, user: { id: 'u', role: 'user' } });
    },
  });
  expect(prepare).toHaveBeenCalledOnce();
  expect(runExecution).toHaveBeenCalledTimes(state === 'unchanged' ? 1 : 0);
  expect(model).toHaveBeenCalledTimes(state === 'unchanged' ? 1 : 0);
  if (state === 'unchanged')
    expect(
      db.query.mock.calls.some(
        ([sql, p]) => sql.startsWith('UPDATE organize_suggestions SET status=') && p[0] === 'not_applicable',
      ),
    ).toBe(true);
});

describe('标签图标应用一致性', () => {
  const safeSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h1v1"/></svg>';
  const choice = {
    iconName: 'lucide:book',
    iconUrl: `data:image/svg+xml;base64,${Buffer.from(safeSvg).toString('base64')}`,
    color: 'currentColor',
  };
  const original = buildSnapshot('tag', { id: 'tag1', name: '阅读', icon_url: '' });
  const row = {
    id: 'suggestion1',
    kind: 'tag_icon',
    status: 'pending',
    item_id: 'item1',
    payload_json: { candidates: [choice], after: choice },
  };
  const args = {
    userId: 'u',
    runId: 'run',
    suggestionId: row.id,
    requestId,
    action: 'apply',
    value: { iconName: choice.iconName, color: choice.color },
  };
  function tagDb(status = 'pending') {
    return database((sql, params) => {
      if (sql.includes('FROM organize_suggestions')) {
        expect(params).toContain('u');
        return [[{ ...row, status }]];
      }
      if (sql.includes('FROM organize_suggestion_runs')) return [[{ ...run, status: 'completed' }]];
      if (sql.includes('FROM organize_suggestion_items'))
        return [[{ id: 'item1', resource_type: 'tag', resource_id: 'tag1', version_hash: original.version }]];
      if (sql.startsWith('SELECT id FROM tag')) {
        expect(params).toEqual(['tag1', 'u']);
        return [[{ id: 'tag1' }]];
      }
    });
  }
  it.each([null, { ...original, version: 'renamed' }, { ...original, version: 'icon_changed' }])(
    '标签删除、改名或改图标时拒绝旧建议',
    async (current) => {
      readCurrentSuggestionSource.mockResolvedValue(current);
      const db = tagDb();
      await expect(actOnSuggestion(db, args)).rejects.toMatchObject({ code: 'ORGANIZE_RESOURCE_CHANGED' });
      expect(applySuggestionMutation).not.toHaveBeenCalled();
      expect(db.rollback).toHaveBeenCalledOnce();
    },
  );
  it('使用已保存候选，不依赖外部网络，更新结果与建议同事务', async () => {
    readCurrentSuggestionSource.mockResolvedValue(original);
    applySuggestionMutation.mockResolvedValue({ applied: choice });
    const db = tagDb();
    expect(await actOnSuggestion(db, args)).toMatchObject({ status: 'applied' });
    expect(applySuggestionMutation).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        kind: 'tag_icon',
        preparedIcon: expect.objectContaining({ iconName: choice.iconName }),
      }),
    );
    expect(db.commit).toHaveBeenCalledOnce();
  });
  it('重复应用不解析或再次写入图标', async () => {
    expect(await actOnSuggestion(tagDb('applied'), args)).toEqual({ status: 'applied' });
    expect(applySuggestionMutation).not.toHaveBeenCalled();
  });
});

it('草稿预览按用户、任务和建议读取，缺失或越权不返回正文', async () => {
  const draft = { status: 'ready', content: '草稿正文', title: '网页', charCount: 4, generatedAt: 'now' };
  const db = database((sql, args) => {
    if (sql.includes('SELECT s.payload_json')) {
      expect(args).toEqual(['s', 'run', 'u']);
      return [[{ payload_json: { archiveDraft: draft } }]];
    }
  });
  expect(await getArchiveDraft(db, { userId: 'u', runId: 'run', suggestionId: 's' })).toMatchObject({ content: '草稿正文', char_count: 4 });
  const missing = database(sql => sql.includes('SELECT s.payload_json') ? [[]] : undefined);
  await expect(getArchiveDraft(missing, { userId: 'other', runId: 'run', suggestionId: 's' })).rejects.toMatchObject({ status: 404 });
});

it('整理列表只返回草稿摘要，完整正文留给独立预览', async () => {
  const db = database(sql => {
    if (sql.includes('FROM organize_suggestion_runs')) return [[{ ...run, run_version: 1 }]];
    if (sql.includes('GROUP BY')) return [[]];
    if (sql.includes('SELECT i.*')) return [[{ id: 'i', snapshot_json: { id: 'b' } }]];
    if (sql.includes('SELECT * FROM organize_suggestions')) return [[{ id: 's', item_id: 'i', status: 'pending', payload_json: { kind: 'archive', archiveDraft: { content: '完整私有正文' }, archivePreview: { excerpt: '短摘录' } } }]];
  });
  const result = await getSuggestionRun(db, { userId: 'u', id: 'run' });
  expect(result.items[0].suggestions[0]).toMatchObject({ archivePreview: { excerpt: '短摘录' } });
  expect(JSON.stringify(result)).not.toContain('完整私有正文');
});

it('批量限制范围与大小，逐项错误隔离且身份不可由条目覆盖', async () => {
  await expect(applySuggestionBatch(database(), { userId: 'u', runId: 'run', items: [] })).rejects.toMatchObject({ code: 'ORGANIZE_BATCH_INVALID' });
  const ids = [requestId, 'd56a4180-65aa-42ec-a945-5fd21dec0538'];
  const db = database((sql, args) => {
    if (sql.includes('FROM organize_suggestion_runs')) return [[{ ...run, status: 'completed' }]];
    if (sql.includes('FROM organize_suggestions')) {
      expect(args.slice(1)).toEqual(['run', 'u']);
      return [[{ kind: args[0] === ids[0] ? 'empty' : 'archive', status: args[0] === ids[0] ? 'pending' : 'applied' }]];
    }
  });
  const result = await applySuggestionBatch(db, { userId: 'u', runId: 'run', items: ids.map(suggestionId => ({ suggestionId, requestId, userId: 'foreign', runId: 'foreign' })) });
  expect(result.results.map(r => r.status)).toEqual(['failed', 'applied']);
  expect(applySuggestionMutation).not.toHaveBeenCalled();
  await expect(applySuggestionBatch(db, { userId: 'u', runId: 'run', items: Array(21).fill({ suggestionId: ids[0], requestId }) })).rejects.toMatchObject({ code: 'ORGANIZE_BATCH_INVALID' });
});
