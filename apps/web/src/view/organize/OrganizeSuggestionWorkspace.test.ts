import { apiBasePost } from '@/http/request';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import zh from '@/i18n/locales/zh-CN';
const navigation = vi.hoisted(() => ({ currentRoute: { value: { query: {} as Record<string, string> } } }));
const api = vi.hoisted(() => ({
  replace: vi.fn().mockResolvedValue(undefined),
  alert: vi.fn(),
  previewRun: vi.fn(),
  previewFileRetry: vi.fn(),
  startRun: vi.fn(),
  getRun: vi.fn(),
  listRuns: vi.fn(),
  cancelRun: vi.fn(),
  pauseRun: vi.fn(),
  resumeRun: vi.fn(),
  actOnRunSuggestion: vi.fn(),
  getOrganizeArchiveDraft: vi.fn(),
  applyRunSuggestionBatch: vi.fn(),
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: api.alert },
}));
vi.mock('@/api/organizeSuggestionApi', () => api);
vi.mock('@/http/request', async (original) => ({
  ...(await original<typeof import('@/http/request')>()),
  apiBasePost: vi.fn(),
}));
vi.mock('@/components/FilePreview.vue', () => ({
  default: { props: ['fileInfo', 'visible'], template: '<div class="file-preview-test">{{ fileInfo.fileName }}</div>' },
}));
vi.mock('@/components/resourcePicker/ResourcePickerPanel.vue', () => ({
  default: {
    props: ['allowedTypes', 'exhaustiveSingleType', 'pageScroll', 'selectedResourceKeys'],
    emits: ['select', 'select-many'],
    template: `<div class="picker-stub" :data-types="allowedTypes.join()" :data-paging="exhaustiveSingleType" :data-selected="selectedResourceKeys?.join()"><button @click="$emit('select', {type:allowedTypes[0],id:'test',title:allowedTypes[0]+'测试资料'})">选择测试资源</button><button @click="$emit('select-many', Array.from({length:1001}, (_, i)=>({type:allowedTypes[0],id:'many'+i})))">超限批量选择</button></div>`,
  },
}));
vi.mock('@/api/tagSpace', () => ({ fetchSelectableTags: vi.fn().mockResolvedValue([{ id: 't', name: 'Vue' }]) }));
vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: navigation.currentRoute,
    push: vi.fn(),
    replace: api.replace,
    resolve: (route: any) => ({
      href: route.path + (route.query ? '?' + new URLSearchParams(route.query).toString() : ''),
    }),
  }),
}));
vi.mock('@/utils/common', () => ({ generateUUID: () => crypto.randomUUID() }));
import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
import Workspace from './OrganizeSuggestionWorkspace.vue';
import { createOrganizeHandoff, clearOrganizeHandoff } from '@/utils/organizeHandoff';
import type { SelectionOperation } from '@/store/resourceSelection';
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'organize-test' }) }));
const result = () => ({
  id: 'r',
  status: 'completed',
  createdAt: '2026-09-05',
  options: {
    resourceTypes: ['bookmark', 'note', 'file'],
    checks: ['tags', 'title', 'empty', 'duplicate'],
    scope: 'all',
  },
  summary: {
    total: 23,
    types: { bookmark: 3, note: 20, file: 0 },
    aiTotal: 0,
    ruleTotal: 23,
    skipped: 0,
    files: { parsed: 0, metadata: 0 },
    estimatedTokensLower: 0,
    estimatedTokensUpper: 0,
    aiEnabled: true,
  },
  progress: [],
  items: [],
  nextCursor: null,
});
const ok = (data: unknown) => ({ status: 200, data });
let app: App | undefined, host: HTMLElement;
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await nextTick();
}
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (e) => e.getAttribute('aria-label') === text || e.textContent?.replace('✓', '').trim() === text,
  )!;
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(Workspace) });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.component('svg-icon', SvgIcon);
  app.mount(host);
  await settle();
}
async function openGroup(key: string) {
  const el = document.querySelector<HTMLButtonElement>(`.group-${key} .group-toggle`)!;
  if (el.getAttribute('aria-expanded') !== 'true') el.click();
  await settle();
}
async function selectOptions(names: string[]) {
  for (const name of names) {
    button(name).click();
    await settle();
  }
}
async function toChecks() {
  await selectOptions(['书签', '笔记', '文件']);
  button('下一步：选项目').click();
  await settle();
}
async function toScope() {
  await toChecks();
  await selectOptions(['标签建议', '笔记标题', '空内容检查', '重复检查', '网页正文存档']);
  button('下一步：定范围').click();
  await settle();
}
beforeEach(() => {
  navigation.currentRoute = reactive({ value: { query: {} as Record<string, string> } });
  vi.clearAllMocks();
  api.alert.mockImplementation((options: any) => options.onOk());
  navigation.currentRoute.value.query = {};
  clearOrganizeHandoff();
  api.listRuns.mockResolvedValue(ok([]));
  api.getRun.mockResolvedValue(ok(result()));
  api.previewRun.mockResolvedValue(ok({ ...result(), status: 'preview' }));
  api.startRun.mockResolvedValue(ok(result()));
  api.actOnRunSuggestion.mockResolvedValue(ok({ status: 'applied' }));
  api.cancelRun.mockResolvedValue(ok({ status: 'cancelled' }));
});
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
  sessionStorage.clear();
});
it('对象和项目默认不勾选，手动选择后返回保留选择', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  expect(document.body.textContent).toContain('想整理哪些对象？');
  expect(button('确认整理范围')).toBeUndefined();
  expect(button('下一步：选项目').disabled).toBe(true);
  expect(document.querySelectorAll('[aria-pressed="true"]').length).toBe(0);
  await toChecks();
  expect(button('下一步：定范围').disabled).toBe(true);
  expect(document.querySelectorAll('[aria-pressed="true"]').length).toBe(0);
  await selectOptions(['标签建议', '笔记标题', '空内容检查', '重复检查', '网页正文存档']);
  button('下一步：定范围').click();
  await settle();
  expect(document.body.textContent).toContain('最近新增');
  button('确认整理范围').click();
  await settle();
  expect(api.previewRun).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: 'recent',
      resourceTypes: ['bookmark', 'note', 'file'],
      checks: ['tags', 'title', 'empty', 'duplicate', 'archive'],
    }),
    expect.any(String),
  );
  expect(api.startRun).not.toHaveBeenCalled();
  button('上一步').click();
  await settle();
  button('上一步').click();
  await settle();
  button('标签建议').click();
  await settle();
  button('下一步：定范围').click();
  await settle();
  button('确认整理范围').click();
  await settle();
  expect(api.previewRun.mock.calls.at(-1)![0].checks).not.toContain('tags');
});
it('预检确认后开始，整次范围包含笔记并可切换', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  await toScope();
  button('确认整理范围').click();
  await settle();
  expect(document.body.textContent).toContain('本次范围 · 23 项资料');
  button('开始整理 23 项').click();
  await settle();
  expect(api.startRun).toHaveBeenCalledWith('r', undefined);
  expect(document.body.textContent).toContain('本次整理 · 23 项');
  const notes = [...document.querySelectorAll<HTMLElement>('[role=tab]')].find((e) => e.textContent?.includes('笔记'));
  notes!.click();
  await settle();
  expect(api.getRun.mock.calls.at(-1)![1].resourceType).toBe('note');
});
it('无 AI 建议也支持手动编辑标题和新增标签', async () => {
  const run = result();
  run.items = [
    {
      id: 'i',
      aiStatus: 'not_needed',
      resource: { id: 'n', type: 'note', title: '未命名文档', source: { folder: '' }, guards: {}, tags: [] },
      suggestions: [
        { id: 's', kind: 'title', status: 'insufficient', reason: '缺少正文依据', before: '未命名文档', after: null },
      ],
    },
  ] as any;
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  await openGroup('manual');
  button('填写标题').click();
  await settle();
  const input = document.querySelector<HTMLInputElement>('.suggestion-edit input')!;
  input.value = '手动标题';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  button('保存并应用').click();
  await settle();
  expect(api.actOnRunSuggestion).toHaveBeenCalledWith('r', 's', 'apply', '手动标题', expect.any(String));
});
it('只展示最新任务，读取失败可以重试且不再显示旧历史入口', async () => {
  api.listRuns.mockRejectedValue(new Error('整理服务尚未就绪'));
  await mount();
  expect(document.body.textContent).toContain('整理服务尚未就绪');
  expect(button('旧标签历史')).toBeUndefined();
  api.listRuns.mockResolvedValue(ok([result(), { ...result(), id: 'old' }]));
  button('重新加载').click();
  await settle();
  expect(api.getRun.mock.calls.at(-1)![0]).toBe('r');
  expect(document.querySelector('[aria-label="整理历史"]')).toBeNull();
});

it('标题单项仅预检笔记，手动选择器和范围摘要同步排除其他类型', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  await toChecks();
  await selectOptions(['笔记标题']);
  expect(document.body.textContent).toContain('书签 · 文件没有适用');
  button('下一步：定范围').click();
  await settle();
  button('确认整理范围').click();
  await settle();
  expect(api.previewRun.mock.calls.at(-1)![0]).toMatchObject({ resourceTypes: ['note'], checks: ['title'] });
  button('上一步').click();
  await settle();
  button('手动选择').click();
  await settle();
  expect(document.querySelector('.picker-stub')?.getAttribute('data-types')).toBe('note');
  expect(button('确认整理范围').disabled).toBe(true);
});
it('仅书签不展示标题和空内容，空选择禁止继续且不发起预检', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  await selectOptions(['书签']);
  button('下一步：选项目').click();
  await settle();
  expect(button('笔记标题')).toBeUndefined();
  expect(button('空内容检查')).toBeUndefined();
  for (const name of ['标签建议', '重复检查', '网页正文存档']) {
    button(name).click();
    await settle();
  }
  await selectOptions(['标签建议', '重复检查', '网页正文存档']);
  expect(button('下一步：定范围').disabled).toBe(true);
  expect(document.body.textContent).toContain('至少选择一个适用项目');
  expect(api.previewRun).not.toHaveBeenCalled();
});
it('预检期间锁定步骤，失败显示真实原因并可在原范围重试', async () => {
  let reject!: (reason: unknown) => void;
  api.previewRun.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  await mount();
  button('重新整理').click();
  await settle();
  await toScope();
  button('确认整理范围').click();
  await settle();
  expect(button('上一步').disabled).toBe(true);
  reject({ message: '预检暂不可用，请重试', status: 503 });
  await settle();
  expect(document.body.textContent).toContain('预检暂不可用，请重试');
  expect(document.body.textContent).toContain('从哪些资料开始？');
  button('确认整理范围').click();
  await settle();
  expect(api.previewRun).toHaveBeenCalledTimes(2);
  expect(api.previewRun.mock.calls[0]).toEqual(api.previewRun.mock.calls[1]);
});
it('重新打开从资源开始；手动范围未选资料不能预检', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  await toScope();
  button('手动选择').click();
  await settle();
  expect(button('确认整理范围').disabled).toBe(true);
  button('关闭').click();
  await settle();
  button('重新整理').click();
  await settle();
  expect(document.body.textContent).toContain('想整理哪些对象？');
  expect(button('下一步：选项目').disabled).toBe(true);
});

it('零资源确认不能开始，返回后必须重新预检', async () => {
  const empty = result();
  empty.summary.total = 0;
  api.previewRun.mockResolvedValue(ok(empty));
  await mount();
  button('重新整理').click();
  await settle();
  await toScope();
  button('确认整理范围').click();
  await settle();
  expect(button('开始整理 0 项').disabled).toBe(true);
  button('上一步').click();
  await settle();
  expect(button('开始整理 0 项')).toBeUndefined();
  expect(api.startRun).not.toHaveBeenCalled();
});

it('使用 HTTP 返回的驼峰字段统计整次 AI 完成数量，而非当前页资源数', async () => {
  const run = {
    ...result(),
    summary: { ...result().summary, total: 60, aiTotal: 22 },
    progress: [
      { resourceType: 'bookmark', aiStatus: 'completed', total: 2 },
      { resourceType: 'file', aiStatus: 'completed', total: 17 },
      { resourceType: 'note', aiStatus: 'completed', total: 3 },
      { resourceType: 'note', aiStatus: 'not_needed', total: 17 },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  const metrics = document.querySelectorAll('.workspace-metric');
  expect(metrics[1].textContent).toContain('已完成全部 22 项分析');
  expect(metrics[1].textContent).toContain('60 项中，22 项需要内容分析');
  expect(button('结束本次整理')).toBeUndefined();
});
it('展示失败和取消计数，等待中的 AI 可取消并继续轮询', async () => {
  const run = {
    ...result(),
    status: 'running',
    summary: { ...result().summary, aiTotal: 5 },
    progress: [
      { resourceType: 'note', aiStatus: 'completed', total: 1 },
      { resourceType: 'note', aiStatus: 'failed', total: 1 },
      { resourceType: 'note', aiStatus: 'cancelled', total: 1 },
      { resourceType: 'note', aiStatus: 'queued', total: 2 },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  expect(document.body.textContent).toContain('失败 1 项 · 已取消 1 项');
  expect(button('结束本次整理')).toBeDefined();
  button('结束本次整理').click();
  await settle();
  expect(api.cancelRun).toHaveBeenCalledWith('r');
});
it('正常检查折叠为摘要，依据不足仍保留手动补充并可展开检查原因', async () => {
  const run = {
    ...result(),
    items: [
      {
        id: 'i',
        aiStatus: 'not_needed',
        resource: { id: 'n', type: 'note', title: '测试笔记', source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [
          { id: 's1', kind: 'empty', status: 'no_suggestion', reason: '有图片，不是空笔记' },
          { id: 's2', kind: 'tags', status: 'insufficient', reason: '可手动添加标签' },
        ],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  await openGroup('manual');
  expect(document.querySelector('.resource-detail-toggle[aria-expanded="true"]')?.getAttribute('aria-label')).toContain('收起详情');
  expect(button('添加标签')).toBeDefined();
  expect(document.body.textContent).toContain('有图片，不是空笔记');
});

it('后台运行时按实际 aiStatus 自动刷新，完成后停止轮询', async () => {
  vi.useFakeTimers();
  try {
    const running = {
      ...result(),
      status: 'running',
      summary: { ...result().summary, aiTotal: 1 },
      progress: [{ resourceType: 'note', aiStatus: 'running', total: 1 }],
    };
    api.listRuns.mockResolvedValue(ok([running]));
    api.getRun.mockResolvedValue(ok(running));
    await mount();
    const calls = api.getRun.mock.calls.length;
    api.getRun.mockResolvedValue(
      ok({ ...running, status: 'completed', progress: [{ resourceType: 'note', aiStatus: 'completed', total: 1 }] }),
    );
    await vi.advanceTimersByTimeAsync(2400);
    await settle();
    expect(api.getRun.mock.calls.length).toBe(calls + 1);
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(api.getRun.mock.calls.length).toBe(calls + 1);
  } finally {
    vi.useRealTimers();
  }
});

it('切换资源时保留旧列表几何占位并禁用，响应回来后原位替换', async () => {
  const run = {
    ...result(),
    items: [
      {
        id: 'old',
        aiStatus: 'completed',
        resource: { id: 'b', type: 'bookmark', title: '旧资源', source: { folder: '' }, guards: {} },
        suggestions: [{ id: 's', kind: 'duplicate', status: 'no_suggestion', reason: '没有重复' }],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  await openGroup('clear');
  let complete!: (value: unknown) => void;
  api.getRun.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const tab = [...document.querySelectorAll<HTMLElement>('[role=tab]')].find((e) => e.textContent?.includes('笔记'))!;
  tab.click();
  await settle();
  expect(document.querySelector('.workspace-resource')?.textContent).toContain('旧资源');
  expect(document.querySelector('.workspace-list-shell [inert]')).not.toBeNull();
  expect(document.querySelector('.workspace-switch-feedback')).not.toBeNull();
  complete(ok({ ...run, items: [] }));
  await settle();
  expect(document.querySelector('.workspace-list-shell [inert]')).toBeNull();
  expect(document.querySelector('.workspace-resource')).toBeNull();
});
it('正常结论与未覆盖检查区分，不用不适用胶囊代替具体解释', async () => {
  const run = {
    ...result(),
    items: ['normal', 'canvas'].map((id) => ({
      id,
      aiStatus: 'not_needed',
      resource: { id, type: 'note', title: id, unsupported: id === 'canvas', source: { folder: '' }, guards: {} },
      suggestions: [
        {
          id: id + 's',
          kind: 'duplicate',
          status: id === 'canvas' ? 'not_applicable' : 'no_suggestion',
          reason: id === 'canvas' ? '画布不参与重复删除判断' : '没有发现重复问题',
        },
      ],
    })),
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  expect(document.body.textContent).toContain('本次检查未发现问题');
  await openGroup('manual');
  await openGroup('clear');
  expect(document.body.textContent).toContain('部分项目暂无法检查');
  document.querySelector<HTMLButtonElement>('.group-clear .resource-detail-toggle')!.click();
  await settle();
  expect(document.querySelector('.group-clear .resource-check-details')?.textContent).toContain('没有发现重复问题');
  expect(document.querySelector('.resource-check-details .b-chip')).toBeNull();
});

it('读取所有分页后按资源唯一归组，后页的待审核建议优先展示', async () => {
  const item = (id: string, status: string) => ({
    id,
    aiStatus: 'completed',
    resource: { id, type: 'bookmark', title: id, source: { folder: '' }, guards: {} },
    suggestions: [{ id: id + '-s', kind: 'tags', status, reason: '说明' }],
  });
  api.listRuns.mockResolvedValue(ok([result()]));
  api.getRun.mockImplementation((_id, params) =>
    Promise.resolve(
      ok({
        ...result(),
        items: params.after
          ? [item('pending', 'pending'), item('manual', 'insufficient')]
          : [item('clear', 'not_applicable')],
        nextCursor: params.after ? null : 'page2',
      }),
    ),
  );
  await mount();
  expect(api.getRun.mock.calls.some(([, params]) => params.after === 'page2')).toBe(true);
  const groups = [...document.querySelectorAll('.result-group')];
  expect(groups.map((g) => g.className)).toEqual([
    'result-group group-priority',
    'result-group group-manual',
    'result-group group-clear',
  ]);
  expect(groups.map((g) => g.querySelector('.group-count')?.textContent)).toEqual(['1', '1', '1']);
  expect(document.querySelector('.group-priority .workspace-resource')?.textContent).toContain('pending');
  expect(document.querySelector('.group-clear .workspace-resource')).toBeNull();
});

it('所有待处理及手动补充资源默认展开，用户收起后刷新保留选择', async () => {
  const run = {
    ...result(),
    items: ['pending', 'info', 'insufficient'].map((status, index) => ({
      id: String(index),
      aiStatus: 'completed',
      resource: { id: String(index), type: 'bookmark', title: status, source: { folder: '' }, guards: {} },
      suggestions: [{ id: 's' + index, kind: 'tags', status, reason: status }],
    })),
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  expect(document.querySelectorAll('.resource-detail-toggle[aria-expanded="true"]')).toHaveLength(3);
  document.querySelector<HTMLButtonElement>('.resource-detail-toggle')!.click();
  await settle();
  button('刷新').click();
  await settle();
  expect(document.querySelectorAll('.resource-detail-toggle[aria-expanded="true"]')).toHaveLength(2);
});

it('手动浏览按类型完整分页，跨类型保留选择并可从已选清单移除', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  await toScope();
  button('手动选择').click();
  await settle();
  expect(document.querySelector('.picker-stub')?.getAttribute('data-paging')).toBe('');
  expect(button('更改范围')).toBeDefined();
  expect(button('全部资源')).toBeUndefined();
  button('选择测试资源').click();
  await settle();
  const tabs = [...document.querySelectorAll<HTMLElement>('.wizard-picker [role=tab]')];
  tabs.find((x) => x.textContent?.includes('笔记'))!.click();
  await settle();
  button('选择测试资源').click();
  await settle();
  expect(document.querySelector('.picker-stub')?.getAttribute('data-selected')).toContain('bookmark:test');
  expect(document.querySelector('.picker-stub')?.getAttribute('data-selected')).toContain('note:test');
  button('超限批量选择').click();
  await settle();
  expect(document.body.textContent).toContain('未加入任何资料');
  button('查看已选 · 2').click();
  await settle();
  expect(document.querySelector('.picker-review')?.textContent).toContain('bookmark测试资料');
  button('移除 bookmark测试资料').click();
  await settle();
  expect(document.querySelector('.picker-stub')?.getAttribute('data-selected')).toBe('note:test');
  button('确认整理范围').click();
  await settle();
  expect(api.previewRun.mock.calls.at(-1)?.[0].items).toEqual([{ type: 'note', id: 'test' }]);
});

it('新版检查未结束时显示待确定，不用零值或完成进度条代替', async () => {
  const row = {
    ...result(),
    runVersion: 2,
    status: 'preparing',
    rulePhase: 'pending',
    checked: 4,
    canPause: true,
    canEnd: true,
    summary: { ...result().summary, aiTotal: null },
  };
  api.listRuns.mockResolvedValue(ok([row]));
  api.getRun.mockResolvedValue(ok(row));
  await mount();
  expect(host.textContent).toContain('等待检查结果');
  expect(host.querySelectorAll('.b-progress')).toHaveLength(1);
  expect(host.querySelector('.b-progress')?.getAttribute('aria-valuenow')).toBe('17');
  expect(host.querySelectorAll('.status-spinning')).toHaveLength(1);
  expect(button('暂停分析')).toBeTruthy();
});
it('暂停动作按服务端能力显示，重复点击不会重复请求；恢复保持当前页签', async () => {
  let resolvePause: any;
  const row = {
    ...result(),
    runVersion: 2,
    status: 'running',
    rulePhase: 'completed',
    canPause: true,
    canResume: false,
    canEnd: true,
    summary: { ...result().summary, aiTotal: 3 },
    progress: [{ resourceType: 'bookmark', aiStatus: 'queued', total: 3 }],
  };
  api.listRuns.mockResolvedValue(ok([row]));
  api.getRun.mockResolvedValue(ok(row));
  api.pauseRun.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvePause = resolve;
      }),
  );
  await mount();
  button('暂停分析').click();
  button('暂停分析').click();
  await settle();
  expect(api.pauseRun).toHaveBeenCalledTimes(1);
  const paused = { ...row, status: 'paused', pauseReason: 'quota', canPause: false, canResume: true };
  api.getRun.mockResolvedValue(ok(paused));
  resolvePause(ok(paused));
  await settle();
  expect(host.textContent).toContain('额度不足');
  expect(button('继续整理')).toBeTruthy();
  api.resumeRun.mockResolvedValue(ok(row));
  api.getRun.mockResolvedValue(ok(row));
  button('继续整理').click();
  await settle();
  expect(api.resumeRun).toHaveBeenCalledWith('r');
});

it('重新进入忽略旧本地展开记录，不重新创建任务', async () => {
  const row = { ...result(), id: 'persist-run' };
  api.listRuns.mockResolvedValue(ok([row]));
  api.getRun.mockResolvedValue(ok(row));
  sessionStorage.setItem(
    'light-note:organize-view:v2',
    JSON.stringify({
      id: 'persist-run',
      type: 'note',
      kind: 'empty',
      views: { 'note:empty': { expanded: [], groups: ['analysis'], seen: [] } },
    }),
  );
  await mount();
  expect(api.getRun).toHaveBeenLastCalledWith(
    'persist-run',
    expect.objectContaining({ resourceType: 'bookmark', kind: '' }),
  );
  expect(api.startRun).not.toHaveBeenCalled();
});

it.each([
  ['bookmark', 'https://example.com/page', 'https://example.com/page'],
  ['note', '', '/noteLibrary/n?from=%2Forganize%3Fissue%3Dai_suggestions'],
])('资源图标和标题打开 %s，不改变检查展开状态', async (type, url, expected) => {
  const run = {
    ...result(),
    items: [
      {
        id: 'i',
        aiStatus: 'not_needed',
        resource: { id: 'n', type, url, title: '测试资料', source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  const opened = vi.spyOn(window, 'open').mockReturnValue(null);
  await mount();
  await openGroup('clear');
  await new Promise((resolve) => setTimeout(resolve, 5));
  const before = document.querySelector('.workspace-resource')?.textContent;
  (document.querySelector('.resource-symbol.b_btn') as HTMLButtonElement).click();
  (document.querySelector('.resource-title-link') as HTMLButtonElement).click();
  expect(opened).toHaveBeenCalledTimes(2);
  const actual = opened.mock.calls[0];
  expect(decodeURI(String(actual[0]))).toBe(expected);
  expect(actual.slice(1)).toEqual(['_blank', 'noopener,noreferrer']);
  expect(document.querySelector('.workspace-resource')?.textContent).toBe(before);
  opened.mockRestore();
});

it('文件在本页使用专用预览组件，不打开新标签页', async () => {
  const run = {
    ...result(),
    items: [
      {
        id: 'i',
        aiStatus: 'not_needed',
        resource: { id: 'f', type: 'file', title: '文档.pdf', source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  vi.mocked(apiBasePost).mockResolvedValue(ok({ id: 'f', file_name: '文档.pdf', file_type: 'pdf' }) as any);
  const opened = vi.spyOn(window, 'open').mockReturnValue(null);
  await mount();
  await openGroup('clear');
  await new Promise((resolve) => setTimeout(resolve, 5));
  (document.querySelector('.resource-title-link') as HTMLButtonElement).click();
  await settle();
  expect(apiBasePost).toHaveBeenCalledWith('/api/file/getFileInfo', { id: 'f' }, { silent: true, feedback: false });
  expect(document.querySelector('.file-preview-test')?.textContent).toBe('文档.pdf');
  expect(opened).not.toHaveBeenCalled();
  opened.mockRestore();
});

function shortcut(type: 'note' | 'bookmark' = 'note', count = 25) {
  const operation = {
    identity: 'organize-test|||||',
    items: Array.from({ length: count }, (_, i) => ({ type, id: String(i), title: '资料' })),
  } as SelectionOperation;
  navigation.currentRoute.value.query.organizeSelection = createOrganizeHandoff(operation);
  api.previewRun.mockImplementation(async (options) =>
    ok({
      ...result(),
      status: 'preview',
      options,
      summary: { ...result().summary, total: count, types: { [type]: count } },
    }),
  );
}
it.each(['note', 'bookmark'] as const)('%s 批量交接超过20项仍完整直达确认，自动预检不启动AI', async (type) => {
  shortcut(type);
  await mount();
  expect(api.previewRun).toHaveBeenCalledOnce();
  expect(api.previewRun.mock.calls[0][0]).toMatchObject({
    resourceTypes: [type],
    checks: ['tags'],
    scope: 'selected',
    tagMode: 'append',
  });
  expect(api.previewRun.mock.calls[0][0].items).toHaveLength(25);
  expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('确认');
  expect(button('开始整理 25 项')).toBeTruthy();
  expect(document.body.textContent).not.toContain('用量说明');
  expect(document.body.textContent).not.toContain('查看用量明细');
  expect(api.startRun).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('.wizard-nav li:nth-child(2) button')!.click();
  await settle();
  expect(document.querySelector('[aria-label="标签建议"]')?.getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('[aria-label="重复检查"]')?.getAttribute('aria-pressed')).toBe('false');
});
it('快捷预检失败停留确认页，可以重试同一范围', async () => {
  shortcut();
  api.previewRun.mockRejectedValueOnce(new Error('范围确认失败'));
  await mount();
  expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('确认');
  expect(button('开始整理 0 项').disabled).toBe(true);
  button('重试范围确认').click();
  await settle();
  expect(api.previewRun).toHaveBeenCalledTimes(2);
  expect(api.startRun).not.toHaveBeenCalled();
  expect(button('开始整理 25 项')).toBeTruthy();
});
it('刷新或错误身份的交接不自动预检，也不会扩大成默认范围', async () => {
  navigation.currentRoute.value.query.organizeSelection = 'expired';
  await mount();
  expect(api.previewRun).not.toHaveBeenCalled();
  expect(document.querySelector('.run-wizard')).toBeNull();
  expect(api.startRun).not.toHaveBeenCalled();
});

it('快捷预检关闭后丢弃迟到结果，再次打开从正常第一步开始', async () => {
  shortcut();
  let resolve!: (value: any) => void;
  api.previewRun.mockReturnValueOnce(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  await mount();
  expect(document.body.textContent).toContain('正在确认所选资料范围');
  button('关闭').click();
  await settle();
  resolve(ok({ ...result(), status: 'preview' }));
  await settle();
  expect(document.querySelector('.run-wizard')).toBeNull();
  button('重新整理').click();
  await settle();
  expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('选对象');
  expect(api.startRun).not.toHaveBeenCalled();
});
it('快捷入口主动改成非显式范围时恢复无标签模式，并重新预检', async () => {
  shortcut();
  await mount();
  button('上一步').click();
  await settle();
  button('更改范围').click();
  await settle();
  button('最近新增').click();
  await settle();
  button('确认整理范围').click();
  await settle();
  expect(api.previewRun).toHaveBeenCalledTimes(2);
  expect(api.previewRun.mock.calls[1][0]).toMatchObject({
    checks: ['tags'],
    scope: 'recent',
    items: [],
    tagMode: 'untagged',
  });
});

it('已有标签的追加建议展示原标签，不误写成无标签或替换', async () => {
  const row = result();
  row.items = [
    {
      id: 'i',
      aiStatus: 'completed',
      ruleStatus: 'completed',
      resource: {
        id: 'b',
        type: 'bookmark',
        title: '字体',
        source: { folder: '' },
        tags: [{ id: 't1', name: '原标签' }],
      },
      suggestions: [
        {
          id: 's',
          kind: 'tags',
          status: 'pending',
          before: [{ id: 't1', name: '原标签' }],
          after: [{ id: 't2', name: '开源项目' }],
          reason: '有内容依据',
        },
      ],
    },
  ] as any;
  api.listRuns.mockResolvedValue(ok([row]));
  api.getRun.mockResolvedValue(ok(row));
  await mount();
  const change = document.querySelector('.suggestion-change');
  expect(change?.textContent).toContain('原标签');
  expect(change?.textContent).toContain('追加');
  expect(change?.textContent).toContain('开源项目');
  expect(change?.textContent).not.toContain('无标签');
});

it('保留的页面收到下一次批量交接后重新预检，旧 token 不会重复消费', async () => {
  shortcut('note');
  await mount();
  expect(api.previewRun).toHaveBeenCalledOnce();
  button('关闭').click();
  await settle();
  shortcut('bookmark', 30);
  await settle();
  expect(api.previewRun).toHaveBeenCalledTimes(2);
  expect(api.previewRun.mock.calls[1][0]).toMatchObject({ resourceTypes: ['bookmark'], tagMode: 'append' });
  expect(button('开始整理 30 项')).toBeTruthy();
  expect(api.startRun).not.toHaveBeenCalled();
});

it('进入快捷确认及取消替换都不结束已有任务', async () => {
  shortcut();
  const running = { ...result(), id: 'old', status: 'running', canEnd: true };
  api.listRuns.mockResolvedValue(ok([running]));
  api.getRun.mockResolvedValue(ok(running));
  api.alert.mockImplementation(() => {});
  await mount();
  expect(api.startRun).not.toHaveBeenCalled();
  expect(api.cancelRun).not.toHaveBeenCalled();
  button('开始整理 25 项').click();
  await settle();
  expect(api.alert).toHaveBeenCalledOnce();
  expect(api.startRun).not.toHaveBeenCalled();
  expect(api.cancelRun).not.toHaveBeenCalled();
  button('关闭').click();
  await settle();
  api.alert.mock.calls[0][0].onOk();
  await settle();
  expect(api.startRun).not.toHaveBeenCalled();
});

it('分析中的资源产生建议后自动展开，主动收起后轮询不重开', async () => {
  const row = {
    ...result(),
    items: [
      {
        id: 'late',
        aiStatus: 'running',
        resource: { id: 'b', type: 'bookmark', title: '字体', source: { folder: '' }, guards: {} },
        suggestions: [],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([row]));
  api.getRun.mockResolvedValue(ok(row));
  await mount();
  const finished = {
    ...row,
    items: [
      {
        ...row.items[0],
        aiStatus: 'completed',
        suggestions: [{ id: 's', kind: 'tags', status: 'pending', reason: '内容依据' }],
      },
    ],
  };
  api.getRun.mockResolvedValue(ok(finished));
  button('刷新').click();
  await settle();
  expect(document.querySelector('.resource-detail-toggle')?.getAttribute('aria-expanded')).toBe('true');
  document.querySelector<HTMLButtonElement>('.resource-detail-toggle')!.click();
  await settle();
  button('刷新').click();
  await settle();
  expect(document.querySelector('.resource-detail-toggle')?.getAttribute('aria-expanded')).toBe('false');
});
it('消费交接后替换当前历史地址，移除一次性参数', async () => {
  shortcut();
  await mount();
  expect(api.replace).toHaveBeenCalledWith(expect.objectContaining({ query: {} }));
  expect(api.startRun).not.toHaveBeenCalled();
});

it('网页正文存档单项限定书签，移除重复适用说明，预检不调用保存接口', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  await toChecks();
  expect(button('网页正文存档')).toBeDefined();
  expect(document.body.textContent).not.toContain('标题建议仅用于笔记');
  await selectOptions(['网页正文存档']);
  button('下一步：定范围').click();
  await settle();
  button('确认整理范围').click();
  await settle();
  expect(api.previewRun.mock.calls.at(-1)![0]).toMatchObject({ resourceTypes: ['bookmark'], checks: ['archive'] });
  expect(api.actOnRunSuggestion).not.toHaveBeenCalled();
});

it('标签可独立整理，图标检查需手动勾选', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  button('标签').click();
  await settle();

  button('下一步：选项目').click();
  await settle();
  expect(button('补全标签图标').getAttribute('aria-pressed')).toBe('false');
  expect(button('下一步：定范围').disabled).toBe(true);
  await selectOptions(['补全标签图标']);
  expect(button('标签建议')).toBeUndefined();
  button('下一步：定范围').click();
  await settle();
  expect(button('全部标签').getAttribute('aria-pressed')).toBe('true');
  expect(button('无标签资源')).toBeUndefined();
  button('确认整理范围').click();
  await settle();
  expect(api.previewRun.mock.calls.at(-1)![0]).toMatchObject({
    resourceTypes: ['tag'],
    checks: ['tag_icon'],
    scope: 'all',
  });
  expect(api.actOnRunSuggestion).not.toHaveBeenCalled();
});

it('确认页不会把已有图标的 34 个标签误报为不存在', async () => {
  api.previewRun.mockResolvedValue(
    ok({
      ...result(),
      status: 'preview',
      summary: { ...result().summary, skipped: 34, skippedReasons: { customIcon: 34, unavailable: 0 } },
    }),
  );
  await mount();
  button('重新整理').click();
  await settle();
  await toScope();
  button('确认整理范围').click();
  await settle();
  expect(document.body.textContent).toContain('有 34 个标签已有图标，无需补全，已跳过。');
  expect(document.body.textContent).not.toContain('34 项不存在');
});


it('预览加载仅显示转圈，成功后恢复图标', async () => {
  const run = { ...result(), items: [{ id: 'i', aiStatus: 'not_needed', resource: { id: 'f', type: 'file', title: '文档.pdf', source: { folder: '' }, guards: {}, tags: [] }, suggestions: [] }] };
  api.listRuns.mockResolvedValue(ok([run])); api.getRun.mockResolvedValue(ok(run));
  let resolve!: (value: any) => void;
  vi.mocked(apiBasePost).mockReturnValue(new Promise(done => { resolve = done; }) as any);
  await mount(); await openGroup('clear'); await settle();
  const preview = document.querySelector('.resource-symbol.b_btn') as HTMLButtonElement;
  preview.click(); await nextTick();
  expect(preview.querySelector('.btn-spinner')).toBeTruthy();
  expect(preview.querySelector('.svg-icon')).toBeNull();
  resolve(ok({ id: 'f', file_name: '文档.pdf', file_type: 'pdf' })); await settle();
  expect(preview.querySelector('.btn-spinner')).toBeNull();
});
it('重新分析使用服务端冻结的完整范围并等待确认', async () => {
  const run = { ...result(), summary: { ...result().summary, types: { file: 1201 } } };
  api.listRuns.mockResolvedValue(ok([run])); api.getRun.mockResolvedValue(ok(run));
  api.previewFileRetry.mockResolvedValue(ok({ ...run, id: 'retry', status: 'preview', summary: { ...run.summary, total: 1201 } }));
  await mount(); button('重新分析未推荐文件')!.click(); await settle();
  expect(api.previewFileRetry.mock.calls[0][0]).toBe(run.id);
  expect(api.previewRun).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('将重新分析 1201 个文件');
  expect(api.startRun).not.toHaveBeenCalled();
});

it.each(['pending', 'applied'])('标签来源标记与 %s 状态一致，不把创建建议当成已创建', async (status) => {
  const run = { ...result(), items: [{ id: 'tag-source-item', aiStatus: 'completed', resource: { id: 'f', type: 'file', title: '资料.pdf', source: { folder: '' }, guards: {}, tags: [] }, suggestions: [{ id: 'source-suggestion', kind: 'tags', status, before: [], after: [{ id: null, name: '网络安全', source: 'new' }, { id: 'known', name: '法律法规', source: 'existing' }], reason: '主题建议' }] }] };
  api.listRuns.mockResolvedValue(ok([run])); api.getRun.mockResolvedValue(ok(run));
  await mount(); if (status === 'applied') { await openGroup('reviewed'); (document.querySelector('[aria-controls="checks-tag-source-item"]') as HTMLButtonElement).click(); } await settle();
  if (status === 'pending') expect(document.querySelector('.suggestion-change')?.textContent).toContain('网络安全');
  else expect(document.querySelector('.group-reviewed')?.textContent).toContain('资料.pdf');
  const marks = [...document.querySelectorAll('.suggested-tag-source')];
  expect(marks.map(mark => mark.textContent?.trim())).toEqual(status === 'pending' ? ['· 新'] : []);
  if (status === 'pending') {
    expect(marks[0].getAttribute('title')).toBe('应用建议时创建此标签');
    expect(marks[0].closest('.resource-tag-chip')).not.toBeNull();
    expect(marks[0].classList.contains('b-chip')).toBe(false);
  }
});


it('存档生成后先预览，应用才保存且不会再次生成', async () => {
  const suggestion = { id: 'archive', kind: 'archive', status: 'pending', action: 'archive', archivePreview: { status: 'ready', excerpt: '正文开头', charCount: 120 }, reason: '旧说明：失败保留已有内容' };
  const run = { ...result(), items: [{ id: 'archive-item', aiStatus: 'not_needed', ruleStatus: 'completed', resource: { id: 'b', type: 'bookmark', title: '网页', source: { folder: '' }, guards: {}, tags: [] }, suggestions: [suggestion] }] };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockImplementation(async () => ok(JSON.parse(JSON.stringify(run))));
  api.getOrganizeArchiveDraft.mockResolvedValue(ok({ content: '预览完整正文', update_time: '2026-09-09' }));
  api.actOnRunSuggestion.mockImplementation(async () => { suggestion.status = 'applied'; return ok({ status: 'applied', applied: 'saved' }); });
  await mount();
  expect(document.body.textContent).toContain('生成成功 · 待应用');
  expect(document.body.textContent).toContain('正文开头');
  expect(document.body.textContent).not.toContain('旧说明');
  button('预览正文').click(); await settle();
  expect(document.body.textContent).toContain('预览完整正文');
  expect(document.body.textContent).not.toContain('已保存的网页正文');
  expect(api.getOrganizeArchiveDraft).toHaveBeenCalledWith('r', 'archive');
  expect(api.actOnRunSuggestion).not.toHaveBeenCalled();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  button('应用').click(); await settle();
  expect(api.actOnRunSuggestion).toHaveBeenCalledTimes(1);
  expect(api.getOrganizeArchiveDraft).toHaveBeenCalledTimes(1);
});

it('存档生成失败直接显示原因，没有应用按钮', async () => {
  const run = { ...result(), items: [{ id: 'failed-item', aiStatus: 'not_needed', ruleStatus: 'completed', resource: { id: 'b', type: 'bookmark', title: '网页', source: { folder: '' }, guards: {}, tags: [] }, suggestions: [{ id: 'failed', kind: 'archive', status: 'failed', reason: '页面需要登录' }] }] };
  api.listRuns.mockResolvedValue(ok([run])); api.getRun.mockResolvedValue(ok(run));
  await mount(); await openGroup('analysis');
  document.querySelector<HTMLButtonElement>('[aria-controls="checks-failed-item"]')?.click(); await settle();
  expect(document.body.textContent).toContain('生成失败');
  expect(document.body.textContent).toContain('页面需要登录');
  expect(button('应用')).toBeUndefined();
});

it('已有存档的检查结果保留可打开的预览入口', async () => {
  const run = { ...result(), items: [{ id: 'saved-item', aiStatus: 'not_needed', ruleStatus: 'completed', resource: { id: 'b', type: 'bookmark', title: '已有存档网页', source: { folder: '' }, guards: {}, tags: [] }, suggestions: [{ id: 'saved', kind: 'archive', status: 'no_suggestion', reason: '当前网址已有正文存档，无需重复读取' }] }] };
  api.listRuns.mockResolvedValue(ok([run])); api.getRun.mockResolvedValue(ok(run));
  vi.mocked(apiBasePost).mockResolvedValue(ok({ content: '之前保存的正文' }));
  await mount(); await openGroup('clear');
  const details = document.querySelector('[aria-controls="checks-saved-item"]') as HTMLButtonElement;
  if (details?.getAttribute('aria-expanded') !== 'true') details?.click();
  await settle();
  button('预览存档').click(); await settle();
  expect(document.body.textContent).toContain('之前保存的正文');
  expect(api.actOnRunSuggestion).not.toHaveBeenCalled();
});


it.each([false, true])('无正文存档按真实可审核成果分组，另有标签建议=%s', async (hasTags) => {
  const suggestions = [{ id: 'archive', kind: 'archive', status: 'pending', action: 'archive', reason: '尚无正文' }, ...(hasTags ? [{ id: 'tags', kind: 'tags', status: 'pending', after: [{ id: 't', name: '开发' }], reason: '推荐标签' }] : [])];
  const run = { ...result(), items: [{ id: 'legacy-item', aiStatus: 'not_needed', ruleStatus: 'completed', resource: { id: 'b', type: 'bookmark', title: '无正文网页', source: { folder: '' }, guards: {}, tags: [] }, suggestions }] };
  api.listRuns.mockResolvedValue(ok([run])); api.getRun.mockResolvedValue(ok(run));
  await mount();
  const target = hasTags ? 'priority' : 'analysis';
  await openGroup(target);
  expect(document.querySelector(`.group-${target}`)?.textContent).toContain('无正文网页');
  if (!hasTags) expect(document.querySelector('.group-priority')).toBeNull();
});

it.each([false, true])('文件读取原因只显示一次，独立页数信息保留=%s', async (pages) => {
  const reading = { state: 'metadata', complete: false, reasonCode: 'UNSUPPORTED_FILE_TYPE', ...(pages ? { totalPages: 5, readPages: 2, missingPages: [3, 4, 5] } : {}) };
  const run = { ...result(), items: [{ id: 'unreadable-item', aiStatus: 'failed', ruleStatus: 'completed', resource: { id: 'f', type: 'file', title: '视频.mp4', reading, source: { folder: '' }, guards: {}, tags: [] }, suggestions: [{ id: 'tags', kind: 'tags', status: 'failed', reading, reason: '不能读取' }] }] };
  api.listRuns.mockResolvedValue(ok([run])); api.getRun.mockResolvedValue(ok(run));
  await mount(); await openGroup('analysis');
  document.querySelector<HTMLButtonElement>('[aria-controls="checks-unreadable-item"]')?.click(); await settle();
  const reason = zh.organizeFile.reasons.unsupported;
  expect(document.body.textContent?.split(reason).length).toBe(2);
  expect(Boolean(document.querySelector('.file-reading-details'))).toBe(pages);
  if (pages) expect(document.querySelector('.file-reading-details')?.textContent).toContain('3, 4, 5');
});


it('点击资源行空白展开收起；详情和资源入口不触发展开', async () => {
  const run = { ...result(), items: [{ id: 'row-item', aiStatus: 'not_needed', ruleStatus: 'completed', resource: { id: 'b', type: 'bookmark', title: '可展开网页', source: { folder: '' }, guards: {}, tags: [] }, suggestions: [{ id: 'a', kind: 'archive', status: 'pending', reason: '尚无正文' }] }] };
  api.listRuns.mockResolvedValue(ok([run])); api.getRun.mockResolvedValue(ok(run));
  await mount(); await openGroup('analysis');
  const header = document.querySelector('.workspace-resource > header') as HTMLElement;
  const toggle = header.querySelector('.resource-detail-toggle') as HTMLButtonElement;
  expect(toggle.textContent?.trim()).toBe('');
  expect(toggle.getAttribute('aria-label')).toContain('可展开网页');
  header.click(); await settle();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  (document.querySelector('.resource-expanded') as HTMLElement).click(); await settle();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  header.querySelector<HTMLButtonElement>('.resource-title-link')!.click(); await settle();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  header.querySelector<HTMLButtonElement>('.resource-symbol')!.click(); await settle();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  toggle.click(); await settle();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
});

it('后台轮询期间按钮保持可用，仍可暂停，旧响应不能覆盖暂停结果', async () => {
  vi.useFakeTimers();
  try {
    const row = {
      ...result(),
      runVersion: 2,
      status: 'running',
      rulePhase: 'completed',
      checked: 23,
      canPause: true,
      canEnd: true,
      summary: { ...result().summary, aiTotal: 3 },
      progress: [{ resourceType: 'bookmark', aiStatus: 'queued', total: 3 }],
    };
    api.listRuns.mockResolvedValue(ok([row]));
    api.getRun.mockResolvedValue(ok(row));
    await mount();
    let resolvePoll!: (value: unknown) => void;
    api.getRun.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(2400);
    for (const name of ['刷新', '暂停分析', '结束本次整理']) expect(button(name).disabled).toBe(false);
    expect(host.querySelector('.workspace-results')?.getAttribute('aria-busy')).toBe('false');
    const paused = { ...row, status: 'paused', canPause: false, canResume: true, pauseReason: 'user' };
    api.pauseRun.mockResolvedValue(ok(paused));
    api.getRun.mockResolvedValue(ok(paused));
    button('暂停分析').click();
    await settle();
    resolvePoll(ok(row));
    await settle();
    expect(button('继续整理').disabled).toBe(false);
    expect(host.querySelector('.status-spinning')).toBeNull();
    expect(host.textContent).toContain('已暂停');
  } finally {
    vi.useRealTimers();
  }
});

it('应用时资源失效显示业务原因并立即隐藏编辑与应用', async () => {
  const run = result();
  run.items = [{ id: 'i', aiStatus: 'completed', ruleStatus: 'completed', resource: { id: 'n', type: 'note', title: '示例笔记', source: { folder: '' }, guards: {}, tags: [] }, suggestions: [{ id: 's', kind: 'title', status: 'pending', reason: '', before: '旧标题', after: '新标题' }] }] as any;
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  api.actOnRunSuggestion.mockRejectedValue(Object.assign(new Error('Request failed with status code 409'), { response: { data: { msg: '资料已移入回收站，此建议已失效', data: { code: 'ORGANIZE_RESOURCE_TRASHED' } } } }));
  await mount();
  button('应用建议').click();
  await settle();
  expect(document.body.textContent).toContain('资料已移入回收站，此建议已失效');
  expect(document.body.textContent).not.toContain('Request failed');
  expect(button('应用建议')).toBeUndefined();
  expect(document.querySelector('.suggestion-edit-action')).toBeNull();
});
