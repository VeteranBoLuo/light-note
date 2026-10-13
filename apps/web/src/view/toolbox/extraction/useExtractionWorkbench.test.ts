import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
const api = vi.hoisted(() => ({
  getExtraction: vi.fn(),
  listExtractions: vi.fn(),
  getExtractionRecords: vi.fn(),
  createExtraction: vi.fn(),
  extractionAction: vi.fn(),
  reviewExtraction: vi.fn(),
  getNextPendingCell: vi.fn(),
  fetchToolboxCatalog: vi.fn(),
}));
vi.mock('@/api/extraction', () => api);
vi.mock('@/api/toolbox', () => ({ fetchToolboxCatalog: api.fetchToolboxCatalog }));
vi.mock('@/utils/extractionHandoff', () => ({ takeExtraction: () => null }));
vi.mock('@/api/noteDetailPrefetch', () => ({ buildNoteDetailRequestScope: (user: any) => user.id }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, te: () => true }) }));
vi.mock('@/store', () => ({ useUserStore: () => user }));
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => router,
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: vi.fn() } }));
import { useExtractionWorkbench } from './useExtractionWorkbench';
const user = reactive({ id: 'owner', role: 'user', adminContext: null });
const route = reactive({ query: { id: 'table' } });
const router = { push: vi.fn(), replace: vi.fn() };
const table = () => ({
  id: 'table',
  title: '产品',
  goal: '',
  status: 'preview',
  phase: 'sample',
  plan: {
    recordDefinition: '产品',
    fields: [{ id: 'f1', key: 'name', label: '名称', type: 'text', rule: '名称' }],
    issues: [],
  },
  version: 1,
  dataVersion: 1,
  acceptPartial: false,
  inFlight: false,
  enabled: true,
  counts: { total: 1, pending: 1, excluded: 0 },
  sources: [],
  budget: { remainingExtractionCalls: 0 },
});
const row = (id = 'r') => ({
  id,
  sourceId: 's',
  version: 1,
  reviews: {},
  excluded: false,
  published: true,
  cells: [{ fieldId: 'f1', originalValue: '原值', status: 'found', evidence: [], evidenceIssues: [] }],
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick();
};
let app: ReturnType<typeof createApp>, host: HTMLElement, state: ReturnType<typeof useExtractionWorkbench>;
function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    setup() {
      state = useExtractionWorkbench();
      return () => h('div');
    },
  });
  app.mount(host);
}
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  sessionStorage.clear();
  user.id = 'owner';
  route.query.id = 'table';
  api.listExtractions.mockResolvedValue([]);
  api.fetchToolboxCatalog.mockResolvedValue({ tools: [{ id: 'extraction', availability: { enabled: true } }] });
  api.getExtraction.mockResolvedValue(table());
  api.getExtractionRecords.mockResolvedValue({ records: [row()], total: 1, dataVersion: 1 });
  api.extractionAction.mockResolvedValue(table());
});
describe('资料转表格共享业务状态', () => {
  it('新增空字段不报重名，但填写完整前不能提交；非空重名才提示', async () => {
    mount();
    await flush();
    state.plan.value!.fields.push({ id: 'f2', key: 'weight', label: '', type: 'text', rule: '' });
    expect(state.duplicateFields.value).toBe(false);
    expect(state.invalidPlan.value).toBe(true);
    await state.start();
    expect(api.extractionAction).not.toHaveBeenCalled();

    state.plan.value!.fields[1].label = ' 名称 ';
    expect(state.duplicateFields.value).toBe(true);
    expect(state.invalidPlan.value).toBe(true);
    state.plan.value!.fields[1].label = 'Weight';
    expect(state.duplicateFields.value).toBe(false);
    expect(state.invalidPlan.value).toBe(false);
    await state.start();
    expect(api.extractionAction).toHaveBeenCalledOnce();
    expect(api.extractionAction.mock.calls[0][1].plan.fields[1].label).toBe('Weight');
  });
  it('重复判断忽略大小写、全半角和空白；空记录定义不误报字段重名', async () => {
    mount();
    await flush();
    state.plan.value!.fields[0].label = 'System Name';
    state.plan.value!.fields.push({ id: 'f2', key: 'other', label: 'ＳＹＳＴＥＭ name', type: 'text', rule: '' });
    expect(state.duplicateFields.value).toBe(true);
    state.plan.value!.fields.pop();
    state.plan.value!.recordDefinition = '';
    expect(state.duplicateFields.value).toBe(false);
    expect(state.invalidPlan.value).toBe(true);
  });
  it('用户指定的列头语言原样传入分析任务', async () => {
    route.query.id = '';
    mount();
    await flush();
    state.goal.value = '列头用英文';
    state.resources.value = [{ type: 'note', id: 'n', title: '开发步骤' }];
    api.createExtraction.mockResolvedValue(table());
    await state.prepare();
    expect(api.createExtraction.mock.calls[0][0]).toMatchObject({ goal: '列头用英文', autoAnalyze: true });
  });
  it('缺少初始化时可以保留草稿，但不能提交提取；重试成功后恢复', async () => {
    route.query.id = '';
    api.listExtractions.mockRejectedValueOnce({ code: 'EXTRACTION_SCHEMA_NOT_READY' });
    mount();
    await flush();
    expect(state.availabilityError.value).toBe('extraction.errors.EXTRACTION_SCHEMA_NOT_READY');
    expect(state.creationReady.value).toBe(false);
    state.title.value = '我的草稿';
    await state.prepare();
    expect(api.createExtraction).not.toHaveBeenCalled();
    await state.reloadAvailability();
    expect(state.creationReady.value).toBe(true);
    expect(state.availabilityError.value).toBe('');
    expect(state.title.value).toBe('我的草稿');
  });
  it('开始分析持久化自动衔接意图；网络重试沿用幂等身份，不另发分析请求', async () => {
    route.query.id = '';
    mount();
    await flush();
    state.resources.value = [{ type: 'note', id: 'n', title: '笔记' }];
    api.createExtraction.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(table());
    await state.prepare();
    await state.prepare();
    expect(api.createExtraction).toHaveBeenCalledTimes(2);
    expect(api.createExtraction.mock.calls[0][0]).toEqual(api.createExtraction.mock.calls[1][0]);
    expect(api.createExtraction.mock.calls[0][0]).toMatchObject({
      autoAnalyze: true,
      resourceRefs: [{ type: 'note', id: 'n' }],
    });
    expect(api.extractionAction).not.toHaveBeenCalled();
  });
  it('失败重试保留阶段；修改后的字段用于新样例，不重新生成建议', async () => {
    api.getExtraction.mockResolvedValue({ ...table(), status: 'paused', errorCode: 'EXTRACTION_CONTRACT_INVALID' });
    mount();
    await flush();
    state.plan.value!.fields[0].rule = '完整名称';
    await state.resume();
    expect(api.extractionAction).toHaveBeenCalledOnce();
    expect(api.extractionAction.mock.calls[0][1]).toMatchObject({
      action: 'sample',
      plan: { fields: [{ rule: '完整名称' }] },
    });
  });
  it('功能关闭时允许查看已有数据，但新建提交保持禁用', async () => {
    api.fetchToolboxCatalog.mockResolvedValue({ tools: [{ id: 'extraction', availability: { enabled: false } }] });
    mount();
    await flush();
    expect(state.records.value).toHaveLength(1);
    expect(state.creationReady.value).toBe(false);
    expect(state.availabilityError.value).toBe('extraction.disabled');
    await state.prepare();
    expect(api.createExtraction).not.toHaveBeenCalled();
  });
  it('进入仅读取，编辑字段不调用 AI；提交显式携带版本和幂等身份', async () => {
    mount();
    await flush();
    state.plan.value!.fields[0].label = '产品名称';
    await flush();
    expect(api.extractionAction).not.toHaveBeenCalled();
    await state.start();
    expect(api.extractionAction).toHaveBeenCalledOnce();
    expect(api.extractionAction.mock.calls[0][1]).toMatchObject({
      action: 'extract',
      version: 1,
      plan: { fields: [{ label: '产品名称' }] },
    });
    expect(api.extractionAction.mock.calls[0][1].requestId).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('刷新恢复同一账号与原结构对应的字段草稿，不自动分析', async () => {
    mount();
    await flush();
    state.plan.value!.fields[0].rule = '保留完整型号';
    await flush();
    app.unmount();
    host.remove();
    mount();
    await flush();
    expect(state.plan.value!.fields[0].rule).toBe('保留完整型号');
    expect(api.extractionAction).not.toHaveBeenCalled();
  });
  it('核对冲突保留空字符串草稿和旧版本，不强行覆盖', async () => {
    api.getExtraction.mockResolvedValue({ ...table(), status: 'completed', phase: 'extract' });
    mount();
    await flush();
    state.inspect(state.records.value[0], 'f1');
    state.draft.value = '';
    api.reviewExtraction.mockRejectedValue({ code: 'EXTRACTION_VERSION_CONFLICT' });
    await state.saveReview('review');
    expect(state.draft.value).toBe('');
    expect(state.selected.value!.version).toBe(1);
    expect(state.reviewError.value).toContain('VERSION_CONFLICT');
    await state.saveReview('review');
    expect(api.reviewExtraction.mock.calls[0][2].requestId).toBe(api.reviewExtraction.mock.calls[1][2].requestId);
  });
  it('较早的筛选响应不会覆盖后来的筛选结果', async () => {
    mount();
    await flush();
    let first: any, second: any;
    api.getExtractionRecords
      .mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (second = resolve)));
    state.filter.value = { search: '先' };
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    state.filter.value = { search: '后' };
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    second({ records: [row('new')], total: 1 });
    await flush();
    first({ records: [row('old')], total: 1 });
    await flush();
    expect(state.records.value[0].id).toBe('new');
  });
  it('较早的进度响应不会把已暂停状态改回处理中', async () => {
    mount();
    await flush();
    let first: any, second: any;
    api.getExtraction
      .mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (second = resolve)));
    const older = state.refresh(),
      newer = state.refresh();
    second({ ...table(), status: 'paused', version: 3 });
    await newer;
    first({ ...table(), status: 'processing', version: 2 });
    await older;
    expect(state.table.value!.status).toBe('paused');
    expect(state.table.value!.version).toBe(3);
  });
  it('下一项由完整范围接口定位，可到当前加载页之外', async () => {
    mount();
    await flush();
    state.inspect(state.records.value[0], 'f1');
    api.getNextPendingCell.mockResolvedValue({ record: row('page2'), fieldId: 'f1' });
    state.nextPending();
    await flush();
    expect(state.selected.value!.id).toBe('page2');
    expect(api.getNextPendingCell).toHaveBeenCalledWith('table', {}, 'r', 'f1', 1);
  });
  it('换号清空本地草稿并丢弃旧账号的在途响应', async () => {
    mount();
    await flush();
    state.plan.value!.fields[0].rule = '草稿';
    await flush();
    let resolve: any;
    api.getExtraction.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const refresh = state.refresh();
    user.id = 'other';
    await flush();
    resolve(table());
    await refresh;
    expect(state.table.value).toBeNull();
    expect(state.records.value).toEqual([]);
    expect(Object.keys(sessionStorage).some((k) => k.includes('owner'))).toBe(false);
  });
});
