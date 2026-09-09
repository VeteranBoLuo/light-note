import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./organizeSuggestionLifecycle.js', async (original) => ({
  ...(await original()),
  runRuleBatch: vi.fn(async () => false),
}));
vi.mock('./organizeSuggestionSources.js', async (original) => ({
  ...(await original()),
  readCurrentSuggestionSource: vi.fn(),
}));
vi.mock('../organizeAiSuggestionFeature.js', () => ({ isOrganizeAiSuggestionsEnabled: () => true }));
import { runSingleSuggestionItem } from './organizeSuggestionService.js';
import { readCurrentSuggestionSource } from './organizeSuggestionSources.js';
import { lifecycleState } from './organizeSuggestionLifecycle.js';
const snap = {
  id: '1',
  type: 'file',
  title: '面试准备.md',
  version: 'same',
  tags: [],
  source: { title: '面试准备.md', text: '面试准备与可视化', evidenceSegments: [] },
  reading: { state: 'text', complete: true },
};
function fixture(initial = 'queued', runStatus = 'running') {
  const item = {
    id: 'item',
    user_id: 'u',
    run_id: 'run',
    resource_type: 'file',
    resource_id: '1',
    ai_status: initial,
    version_hash: 'same',
    snapshot_json: JSON.stringify(snap),
    ai_kinds_json: '["tags"]',
  };
  const run = { id: 'run', user_id: 'u', status: runStatus, run_version: 2, rule_phase: 'completed' };
  const query = vi.fn(async (sql, args = []) => {
    if (sql.startsWith('SELECT r.id,r.status')) return [[run]];
    if (sql.startsWith('SELECT i.*')) return [[{ ...item }]];
    if (sql.startsWith('SELECT * FROM organize_suggestion_runs')) return [[run]];
    if (sql.startsWith('SELECT lease_token')) return [[{ lease_token: item.lease_token }]];
    if (sql.startsWith('SELECT * FROM organize_suggestions'))
      return [[{ id: 'suggestion', kind: 'tags', payload_json: '{"kind":"tags"}' }]];
    if (sql.startsWith('SELECT COUNT(*)')) return [[{ total: 0 }]];
    if (sql.startsWith('SELECT id,name FROM tag')) return [[]];
    if (
      sql.startsWith('UPDATE organize_suggestion_items SET ai_status=') &&
      sql.includes('lease_token=?,lease_expires_at')
    ) {
      item.lease_token = args[0];
      item.ai_status = sql.includes("'preparing_content'") ? 'preparing_content' : 'running';
    }
    if (sql.includes('next_check_at=DATE_ADD')) {
      item.ai_status = args[0];
      item.snapshot_json = args[1];
      item.lease_token = null;
    }
    if (sql.startsWith("UPDATE organize_suggestion_items SET ai_status='running'")) item.ai_status = 'running';
    if (sql.startsWith('UPDATE organize_suggestion_items SET ai_status=?,error_code')) item.ai_status = args[0];
    return [{ affectedRows: 1 }];
  });
  return { item, run, db: { query, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn() } };
}
beforeEach(() => {
  vi.clearAllMocks();
  readCurrentSuggestionSource.mockImplementation(async () => structuredClone(snap));
});
it('单 Worker 第一轮释放等待、解析完成后第二轮才调用 AI', async () => {
  const { db, item } = fixture();
  const model = vi.fn(async () => ({ title: null, tags: [{ name: '面试准备' }], tagOutcome: 'suggested' }));
  const runExecution = vi.fn(async (_config, work) => work());
  const prepareFile = vi
    .fn()
    .mockResolvedValueOnce({ waiting: true, reading: { state: 'waiting', sourceId: 'source' } })
    .mockResolvedValueOnce({ source: null, visualPages: [], reading: { state: 'text', complete: true } });
  const dependencies = {
    prepareFile,
    model,
    runExecution,
    restrictions: async () => [],
    dispatch: async (_db, _user, work) => work({ connection: db, user: { id: 'u', role: 'user' } }),
    understandFile: async (_db, _u, current) => current,
  };
  await runSingleSuggestionItem('worker', db, dependencies);
  expect(item.ai_status).toBe('waiting_content');
  expect(item.lease_token).toBeNull();
  expect(runExecution).not.toHaveBeenCalled();
  await runSingleSuggestionItem('worker', db, dependencies);
  expect(model).toHaveBeenCalledTimes(1);
  expect(item.ai_status).toBe('completed');
  expect(runExecution.mock.calls[0][0].providerPlan.stages.model_generation.maxCalls).toBe(1);
});
it('等待项计入暂停、继续能力，不被当成任务已完成', () => {
  expect(
    lifecycleState({ run_version: 2, status: 'paused', rule_phase: 'completed' }, [
      { ai_status: 'waiting_content', total: 5 },
    ]),
  ).toMatchObject({ queued: 5, canResume: true });
  expect(
    lifecycleState({ run_version: 2, status: 'running', rule_phase: 'completed' }, [
      { ai_status: 'preparing_content', total: 1 },
    ]),
  ).toMatchObject({ queued: 1, canPause: true });
});
it('已经外发的过期运行项交付失败，不重复调用 Provider', async () => {
  const { db } = fixture('running');
  const model = vi.fn();
  await runSingleSuggestionItem('worker', db, { model });
  expect(model).not.toHaveBeenCalled();
  expect(db.query.mock.calls.some(([, args]) => args?.includes('ORGANIZE_WORKER_INTERRUPTED'))).toBe(true);
});
it('内容准备阶段崩溃可重新准备，无需重复付费调用', async () => {
  const { db, item } = fixture('preparing_content');
  const prepareFile = vi.fn(async () => ({ waiting: true, reading: { state: 'waiting' } }));
  await runSingleSuggestionItem('worker', db, { prepareFile });
  expect(prepareFile).toHaveBeenCalledTimes(1);
  expect(item.ai_status).toBe('waiting_content');
});
it('内容准备期间结束任务，不再启动付费分析', async () => {
  const { db, run } = fixture();
  const model = vi.fn();
  const prepareFile = async () => {
    run.status = 'ended';
    return { source: null, visualPages: [], reading: { state: 'text', complete: true } };
  };
  await runSingleSuggestionItem('worker', db, { prepareFile, model });
  expect(model).not.toHaveBeenCalled();
  expect(db.query.mock.calls.some(([, args]) => args?.includes('ORGANIZE_RUN_ENDED'))).toBe(true);
});
