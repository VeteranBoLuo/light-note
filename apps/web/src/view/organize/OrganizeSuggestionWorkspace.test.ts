import { apiBasePost } from '@/http/request';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, KeepAlive, nextTick, reactive, ref, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
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
  getWorkspace: vi.fn(),
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
// 回到前台补读只接受过期快照；推进时钟而不触发后台轮询。
async function wakeWorkspace() {
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1001);
  document.dispatchEvent(new Event('visibilitychange'));
  await settle();
}
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (e) => e.getAttribute('aria-label') === text || e.textContent?.replace('✓', '').trim() === text,
  )!;
async function mount(visible?: ReturnType<typeof ref<boolean>>) {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () =>
      visible ? h(KeepAlive, null, { default: () => (visible.value ? h(Workspace) : null) }) : h(Workspace),
  });
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
  await selectOptions(['标签建议', '名称／标题', '空内容检查', '重复检查', '网页正文存档']);
  button('下一步：定范围').click();
  await settle();
}
beforeEach(() => {
  navigation.currentRoute = reactive({ value: { query: {} as Record<string, string> } });
  vi.clearAllMocks();
  for (const mock of Object.values(api)) mock.mockReset();
  api.replace.mockResolvedValue(undefined);
  api.alert.mockImplementation((options: any) => options.onOk());
  navigation.currentRoute.value.query = {};
  clearOrganizeHandoff();
  api.listRuns.mockResolvedValue(ok([]));
  api.getRun.mockResolvedValue(ok(result()));
  // Existing interaction fixtures supply task and detail separately; production
  // resolves both in the workspace endpoint. Grouped protocol cases override this.
  api.getWorkspace.mockImplementation(async (params = {}) => {
    const response = await api.listRuns();
    if (response.status !== 200 || !response.data?.length) return ok(null);
    const latest = response.data[0];
    const saved = latest.id === params.preferredRunId;
    const resourceType = saved ? params.resourceType : latest.options.resourceTypes[0];
    const kind = saved ? params.kind || '' : '';
    const detail = await api.getRun(latest.id, { resourceType, kind, after: saved ? params.after || '' : '' });
    return { ...detail, data: { ...detail.data, resourceType, kind } };
  });
  api.previewRun.mockResolvedValue(ok({ ...result(), status: 'preview' }));
  api.startRun.mockResolvedValue(ok(result()));
  api.actOnRunSuggestion.mockResolvedValue(ok({ status: 'applied' }));
  api.cancelRun.mockResolvedValue(ok({ status: 'cancelled' }));
});
afterEach(async () => {
  app?.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // Message state is global and outlives the workspace; clear it before jsdom teardown.
  message.destroy();
  await nextTick();
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
  await selectOptions(['标签建议', '名称／标题', '空内容检查', '重复检查', '网页正文存档']);
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
  button('填写名称／标题').click();
  await settle();
  const input = document.querySelector<HTMLInputElement>('.suggestion-edit input')!;
  input.value = '手动标题';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  button('保存并应用').click();
  await settle();
  expect(api.actOnRunSuggestion).toHaveBeenCalledWith('r', 's', 'apply', '手动标题', expect.any(String));
});
it('描述补全可独立选择，混合类型只预检书签', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  await toChecks();
  await selectOptions(['书签描述']);
  button('下一步：定范围').click();
  await settle();
  button('确认整理范围').click();
  await settle();
  expect(api.previewRun.mock.calls.at(-1)![0]).toMatchObject({ resourceTypes: ['bookmark'], checks: ['description'] });
});
it.each(['pending', 'insufficient'])('描述建议 %s 可审核或手动补充，使用多行输入', async (status) => {
  const run = result();
  run.options = { resourceTypes: ['bookmark'], checks: ['description'], scope: 'all', items: [] };
  run.items = [
    {
      id: 'i',
      aiStatus: 'completed',
      ruleStatus: 'completed',
      resource: {
        id: 'b',
        type: 'bookmark',
        title: '字体目录',
        source: { folder: '' },
        guards: {},
        tags: [],
        evidenceLevel: 'content',
      },
      suggestions: [
        {
          id: 'description',
          kind: 'description',
          status,
          reason: '',
          before: '',
          after: status === 'pending' ? '开源字体目录' : null,
        },
      ],
    },
  ];
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  await openGroup(status === 'pending' ? 'priority' : 'manual');
  if (status === 'pending') expect(document.body.textContent).toContain('开源字体目录');
  button(status === 'pending' ? '编辑' : '填写描述').click();
  await settle();
  const input = document.querySelector<HTMLTextAreaElement>('.suggestion-edit textarea')!;
  expect(input).toBeTruthy();
  expect(input.maxLength).toBe(255);
  input.value = '可商用的开源字体目录';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  button('保存并应用').click();
  await settle();
  expect(api.actOnRunSuggestion).toHaveBeenCalledWith(
    'r',
    'description',
    'apply',
    '可商用的开源字体目录',
    expect.any(String),
  );
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

it('名称单项支持三种资料，手动选择器保持所选类型', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  await toChecks();
  await selectOptions(['名称／标题']);
  expect(document.body.textContent).not.toContain('文件没有适用');
  button('下一步：定范围').click();
  await settle();
  button('确认整理范围').click();
  await settle();
  expect(api.previewRun.mock.calls.at(-1)![0]).toMatchObject({
    resourceTypes: ['bookmark', 'note', 'file'],
    checks: ['title'],
  });
  button('上一步').click();
  await settle();
  button('手动选择').click();
  await settle();
  expect(document.querySelector('.picker-stub')?.getAttribute('data-types')).toBe('bookmark');
  expect(button('确认整理范围').disabled).toBe(true);
});
it('书签展示名称与描述、不展示空内容，空选择禁止继续且不发起预检', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  await selectOptions(['书签']);
  button('下一步：选项目').click();
  await settle();
  expect(button('名称／标题')).toBeTruthy();
  expect(button('书签描述')).toBeTruthy();
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
  const metrics = document.querySelectorAll('.run-metric');
  expect(metrics[1].textContent).toContain('22项已完成');
  expect(metrics[1].textContent).toContain('本轮 22 项进入后续处理');
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
  expect(document.body.textContent).toContain('失败 1 项 · 取消 1 项');
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
  expect(document.querySelector('.resource-detail-toggle[aria-expanded="true"]')?.getAttribute('aria-label')).toContain(
    '收起详情',
  );
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
    expect([...host.querySelectorAll('button')].some((el) => el.textContent?.trim() === '刷新')).toBe(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(api.getRun.mock.calls.length).toBe(calls + 2);
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
  expect(document.body.textContent).toContain('无需调整');
  await openGroup('manual');
  await openGroup('clear');
  expect(document.body.textContent).toContain('部分项目暂无法检查');
  document.querySelector<HTMLButtonElement>('.group-clear .resource-detail-toggle')!.click();
  await settle();
  expect(document.querySelector('.group-clear .resource-check-details')?.textContent).toContain('没有发现重复问题');
  expect(document.querySelector('.resource-check-details .b-chip')).toBeNull();
});

it('首屏只读一次完整摘要与展开分组，后页待审核建议不被无需调整的结果阻塞', async () => {
  const item = (id: string, status: string) => ({
    id,
    aiStatus: 'completed',
    ruleStatus: 'completed',
    resource: { id, type: 'bookmark', title: id, source: { folder: '' }, guards: {} },
    suggestions: [{ id: id + '-s', kind: 'tags', status, reason: '说明' }],
  });
  const pending = item('z-pending', 'pending'),
    manual = item('manual', 'insufficient');
  api.getWorkspace.mockResolvedValue(
    ok({
      ...result(),
      resourceType: 'bookmark',
      groupTotals: { priority: 1, manual: 1, clear: 258 },
      pages: {
        priority: { items: [pending], nextCursor: null },
        manual: { items: [manual], nextCursor: null },
        unfinished: { items: [], nextCursor: null },
      },
      items: [pending, manual],
    }),
  );
  await mount();
  expect(api.getWorkspace).toHaveBeenCalledTimes(1);
  expect(api.getRun).not.toHaveBeenCalled();
  expect(api.listRuns).not.toHaveBeenCalled();
  expect(document.querySelector('.group-priority .workspace-resource')?.textContent).toContain('z-pending');
  expect(document.querySelector('.group-clear .group-count')?.textContent).toBe('258');
  expect(document.querySelector('.group-clear .workspace-resource')).toBeNull();
  api.getRun.mockResolvedValue(ok({ items: [item('a-clear', 'not_applicable')], nextCursor: 'a-clear' }));
  await openGroup('clear');
  expect(api.getRun).toHaveBeenCalledTimes(1);
  expect(api.getRun.mock.lastCall?.[1]).toMatchObject({ group: 'clear', after: '' });
  expect(document.querySelector('.group-clear .workspace-resource')?.textContent).toContain('a-clear');
});

it('所有待处理及手动补充资源默认展开，返回页面同步后保留收起选择', async () => {
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
  await wakeWorkspace();
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
  expect(host.textContent).toContain('等待检查完成');
  expect(host.querySelectorAll('.b-progress')).toHaveLength(1);
  expect(host.querySelector('.b-progress')?.getAttribute('aria-valuenow')).toBe('17');
  expect(host.querySelectorAll('.status-spinning')).toHaveLength(1);
  expect(button('暂停后续处理')).toBeTruthy();
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
  button('暂停后续处理').click();
  button('暂停后续处理').click();
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
  await wakeWorkspace();
  expect(document.querySelector('.resource-detail-toggle')?.getAttribute('aria-expanded')).toBe('true');
  document.querySelector<HTMLButtonElement>('.resource-detail-toggle')!.click();
  await settle();
  await wakeWorkspace();
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
  let resolve!: (value: any) => void;
  vi.mocked(apiBasePost).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }) as any,
  );
  await mount();
  await openGroup('clear');
  await settle();
  const preview = document.querySelector('.resource-symbol.b_btn') as HTMLButtonElement;
  preview.click();
  await nextTick();
  expect(preview.querySelector('.btn-spinner')).toBeTruthy();
  expect(preview.querySelector('.svg-icon')).toBeNull();
  resolve(ok({ id: 'f', file_name: '文档.pdf', file_type: 'pdf' }));
  await settle();
  expect(preview.querySelector('.btn-spinner')).toBeNull();
});
it('重新分析使用服务端冻结的完整范围并等待确认', async () => {
  const run = {
    ...result(),
    review: { pending: 0, manualObjects: 0, retryFiles: 1201 },
    summary: { ...result().summary, types: { file: 1201 } },
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  api.previewFileRetry.mockResolvedValue(
    ok({ ...run, id: 'retry', status: 'preview', summary: { ...run.summary, total: 1201 } }),
  );
  await mount();
  button('重新分析未推荐文件')!.click();
  await settle();
  expect(api.previewFileRetry.mock.calls[0][0]).toBe(run.id);
  expect(api.previewRun).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('将重新分析 1201 个文件');
  expect(api.startRun).not.toHaveBeenCalled();
});

it.each(['pending', 'applied'])('标签来源标记与 %s 状态一致，不把创建建议当成已创建', async (status) => {
  const run = {
    ...result(),
    items: [
      {
        id: 'tag-source-item',
        aiStatus: 'completed',
        resource: { id: 'f', type: 'file', title: '资料.pdf', source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [
          {
            id: 'source-suggestion',
            kind: 'tags',
            status,
            before: [],
            after: [
              { id: null, name: '网络安全', source: 'new' },
              { id: 'known', name: '法律法规', source: 'existing' },
            ],
            reason: '主题建议',
          },
        ],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  if (status === 'applied') {
    await openGroup('reviewed');
    (document.querySelector('[aria-controls="checks-tag-source-item"]') as HTMLButtonElement).click();
  }
  await settle();
  if (status === 'pending') expect(document.querySelector('.suggestion-change')?.textContent).toContain('网络安全');
  else expect(document.querySelector('.group-reviewed')?.textContent).toContain('资料.pdf');
  const marks = [...document.querySelectorAll('.suggested-tag-source')];
  expect(marks.map((mark) => mark.textContent?.trim())).toEqual(status === 'pending' ? ['· 新'] : []);
  if (status === 'pending') {
    expect(marks[0].getAttribute('title')).toBe('应用建议时创建此标签');
    expect(marks[0].closest('.resource-tag-chip')).not.toBeNull();
    expect(marks[0].classList.contains('b-chip')).toBe(false);
  }
});

it('存档生成后先预览，应用才保存且不会再次生成', async () => {
  const suggestion = {
    id: 'archive',
    kind: 'archive',
    status: 'pending',
    action: 'archive',
    archivePreview: { status: 'ready', excerpt: '正文开头', charCount: 120 },
    reason: '旧说明：失败保留已有内容',
  };
  const run = {
    ...result(),
    items: [
      {
        id: 'archive-item',
        aiStatus: 'not_needed',
        ruleStatus: 'completed',
        resource: { id: 'b', type: 'bookmark', title: '网页', source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [suggestion],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockImplementation(async () => ok(JSON.parse(JSON.stringify(run))));
  api.getOrganizeArchiveDraft.mockResolvedValue(ok({ content: '预览完整正文', update_time: '2026-09-09' }));
  api.actOnRunSuggestion.mockImplementation(async () => {
    suggestion.status = 'applied';
    return ok({ status: 'applied', applied: 'saved' });
  });
  await mount();
  expect(document.body.textContent).toContain('生成成功 · 待应用');
  expect(document.body.textContent).toContain('正文开头');
  expect(document.body.textContent).not.toContain('旧说明');
  button('预览正文').click();
  await settle();
  expect(document.body.textContent).toContain('预览完整正文');
  expect(document.body.textContent).not.toContain('已保存的网页正文');
  expect(api.getOrganizeArchiveDraft).toHaveBeenCalledWith('r', 'archive');
  expect(api.actOnRunSuggestion).not.toHaveBeenCalled();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  button('应用').click();
  await settle();
  expect(api.actOnRunSuggestion).toHaveBeenCalledTimes(1);
  expect(api.getOrganizeArchiveDraft).toHaveBeenCalledTimes(1);
});

it('存档生成失败直接显示原因，没有应用按钮', async () => {
  const run = {
    ...result(),
    items: [
      {
        id: 'failed-item',
        aiStatus: 'not_needed',
        ruleStatus: 'completed',
        resource: { id: 'b', type: 'bookmark', title: '网页', source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [{ id: 'failed', kind: 'archive', status: 'failed', reason: '页面需要登录' }],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  await openGroup('unfinished');
  document.querySelector<HTMLButtonElement>('[aria-controls="checks-failed-item"]')?.click();
  await settle();
  expect(document.body.textContent).toContain('生成失败');
  expect(document.body.textContent).toContain('页面需要登录');
  expect(button('应用')).toBeUndefined();
});

it('已有存档的检查结果保留可打开的预览入口', async () => {
  const run = {
    ...result(),
    items: [
      {
        id: 'saved-item',
        aiStatus: 'not_needed',
        ruleStatus: 'completed',
        resource: { id: 'b', type: 'bookmark', title: '已有存档网页', source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [
          { id: 'saved', kind: 'archive', status: 'no_suggestion', reason: '当前网址已有正文存档，无需重复读取' },
        ],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  vi.mocked(apiBasePost).mockResolvedValue(ok({ content: '之前保存的正文' }));
  await mount();
  await openGroup('clear');
  const details = document.querySelector('[aria-controls="checks-saved-item"]') as HTMLButtonElement;
  if (details?.getAttribute('aria-expanded') !== 'true') details?.click();
  await settle();
  button('预览存档').click();
  await settle();
  expect(document.body.textContent).toContain('之前保存的正文');
  expect(api.actOnRunSuggestion).not.toHaveBeenCalled();
});

it.each([false, true])('无正文存档按真实可审核成果分组，另有标签建议=%s', async (hasTags) => {
  const suggestions = [
    { id: 'archive', kind: 'archive', status: 'pending', action: 'archive', reason: '尚无正文' },
    ...(hasTags
      ? [{ id: 'tags', kind: 'tags', status: 'pending', after: [{ id: 't', name: '开发' }], reason: '推荐标签' }]
      : []),
  ];
  const run = {
    ...result(),
    items: [
      {
        id: 'legacy-item',
        aiStatus: 'not_needed',
        ruleStatus: 'completed',
        resource: { id: 'b', type: 'bookmark', title: '无正文网页', source: { folder: '' }, guards: {}, tags: [] },
        suggestions,
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  const target = hasTags ? 'priority' : 'unfinished';
  await openGroup(target);
  expect(document.querySelector(`.group-${target}`)?.textContent).toContain('无正文网页');
  if (!hasTags) expect(document.querySelector('.group-priority')).toBeNull();
});

it.each([false, true])('文件读取原因只显示一次，独立页数信息保留=%s', async (pages) => {
  const reading = {
    state: 'metadata',
    complete: false,
    reasonCode: 'UNSUPPORTED_FILE_TYPE',
    ...(pages ? { totalPages: 5, readPages: 2, missingPages: [3, 4, 5] } : {}),
  };
  const run = {
    ...result(),
    items: [
      {
        id: 'unreadable-item',
        aiStatus: 'failed',
        ruleStatus: 'completed',
        resource: { id: 'f', type: 'file', title: '视频.mp4', reading, source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [{ id: 'tags', kind: 'tags', status: 'failed', reading, reason: '不能读取' }],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  await openGroup('unfinished');
  document.querySelector<HTMLButtonElement>('[aria-controls="checks-unreadable-item"]')?.click();
  await settle();
  const reason = zh.organizeFile.reasons.unsupported;
  expect(document.body.textContent?.split(reason).length).toBe(2);
  expect(Boolean(document.querySelector('.file-reading-details'))).toBe(pages);
  if (pages) expect(document.querySelector('.file-reading-details')?.textContent).toContain('3, 4, 5');
});

it('点击资源行空白展开收起；详情和资源入口不触发展开', async () => {
  const run = {
    ...result(),
    items: [
      {
        id: 'row-item',
        aiStatus: 'not_needed',
        ruleStatus: 'completed',
        resource: { id: 'b', type: 'bookmark', title: '可展开网页', source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [{ id: 'a', kind: 'archive', status: 'pending', reason: '尚无正文' }],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  await openGroup('unfinished');
  const header = document.querySelector('.workspace-resource > header') as HTMLElement;
  const toggle = header.querySelector('.resource-detail-toggle') as HTMLButtonElement;
  expect(toggle.textContent?.trim()).toBe('');
  expect(toggle.getAttribute('aria-label')).toContain('可展开网页');
  header.click();
  await settle();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  (document.querySelector('.resource-expanded') as HTMLElement).click();
  await settle();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  header.querySelector<HTMLButtonElement>('.resource-title-link')!.click();
  await settle();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  header.querySelector<HTMLButtonElement>('.resource-symbol')!.click();
  await settle();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  toggle.click();
  await settle();
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
    for (const name of ['暂停后续处理', '结束本次整理']) expect(button(name).disabled).toBe(false);
    expect(host.querySelector('.workspace-results')?.getAttribute('aria-busy')).toBe('false');
    const paused = { ...row, status: 'paused', canPause: false, canResume: true, pauseReason: 'user' };
    api.pauseRun.mockResolvedValue(ok(paused));
    api.getRun.mockResolvedValue(ok(paused));
    button('暂停后续处理').click();
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
  run.items = [
    {
      id: 'i',
      aiStatus: 'completed',
      ruleStatus: 'completed',
      resource: { id: 'n', type: 'note', title: '示例笔记', source: { folder: '' }, guards: {}, tags: [] },
      suggestions: [{ id: 's', kind: 'title', status: 'pending', reason: '', before: '旧标题', after: '新标题' }],
    },
  ] as any;
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  api.actOnRunSuggestion.mockRejectedValue(
    Object.assign(new Error('Request failed with status code 409'), {
      response: { data: { msg: '资料已移入回收站，此建议已失效', data: { code: 'ORGANIZE_RESOURCE_TRASHED' } } },
    }),
  );
  await mount();
  button('应用建议').click();
  await settle();
  expect(document.body.textContent).toContain('资料已移入回收站，此建议已失效');
  expect(document.body.textContent).not.toContain('Request failed');
  expect(button('应用建议')).toBeUndefined();
  expect(document.querySelector('.suggestion-edit-action')).toBeNull();
});

it.each([true, false])('标签图标默认浏览与显式批量入口（有推荐：%s）', async (hasChoice) => {
  const data = {
    ...result(),
    options: { ...result().options, resourceTypes: ['tag'], checks: ['tag_icon'] },
    summary: { ...result().summary, types: { bookmark: 0, note: 0, file: 0, tag: 1 } },
    items: [
      {
        id: 'tag-item',
        resource: { type: 'tag', id: 'tag-1', title: '示例标签' },
        suggestions: [
          {
            id: 'icon-1',
            kind: 'tag_icon',
            status: hasChoice ? 'pending' : 'no_suggestion',
            after: hasChoice ? { iconName: 'lucide:book', color: 'currentColor', iconUrl: 'safe' } : null,
          },
        ],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([data]));
  api.getRun.mockResolvedValue(ok(data));
  await mount();
  expect(document.querySelector('.icon-suggestion .b-checkbox')).toBeNull();
  expect(document.querySelector('.resource-batch-action-bar')).toBeNull();
  if (!hasChoice) {
    expect(button('批量应用')).toBeUndefined();
    return;
  }
  expect(document.querySelector('.workspace-filters .batch-entry')).toBeNull();
  expect(document.querySelector('.group-priority .batch-entry')?.textContent).toContain('批量应用');
  button('批量应用').click();
  await settle();
  const checkbox = document.querySelector<HTMLElement>('.icon-suggestion .b-checkbox')!;
  expect(checkbox.getAttribute('aria-checked')).toBe('false');
  expect(document.querySelector('.resource-batch-action-bar')).not.toBeNull();
  checkbox.click();
  await settle();
  expect(button('应用已选 1 项').disabled).toBe(false);
  button('退出批量').click();
  await settle();
  expect(document.querySelector('.icon-suggestion .b-checkbox')).toBeNull();
  button('批量应用').click();
  await settle();
  expect(document.querySelector('.icon-suggestion .b-checkbox')?.getAttribute('aria-checked')).toBe('false');
  expect(button('应用已选 0 项').disabled).toBe(true);
});

it.each([
  { action: null, status: 'insufficient', group: 'manual' },
  { action: null, status: 'pending', group: 'priority' },
  { action: 'duplicate_bookmarks', status: 'insufficient', group: 'priority' },
  { action: 'trash', status: 'insufficient', group: 'priority' },
  { action: null, status: 'no_suggestion', group: 'manual' },
  { action: null, status: 'ignored', group: 'manual' },
])('检查提示按实际处理能力分组：%j', async ({ action, status, group }) => {
  const data = {
    ...result(),
    options: { ...result().options, resourceTypes: ['note'] },
    items: [
      {
        id: 'note-info',
        ruleStatus: 'completed',
        aiStatus: 'completed',
        resource: { type: 'note', id: 'note-info', title: '待完善笔记', source: { folder: '' }, guards: {} },
        suggestions: [
          { id: 'duplicate-info', kind: 'duplicate', status: 'info', action, reason: '标题相同但正文不同，不建议删除' },
          {
            id: 'title-info',
            kind: 'title',
            status,
            before: '待完善笔记',
            after: status === 'pending' ? '学习记录' : null,
          },
        ],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([data]));
  api.getRun.mockResolvedValue(ok(data));
  await mount();
  expect(document.querySelector(`.group-${group} .workspace-resource`)?.textContent).toContain('待完善笔记');
  expect(document.querySelector(`.group-${group === 'manual' ? 'priority' : 'manual'}`)).toBeNull();
  expect(document.body.textContent).toContain('标题相同但正文不同，不建议删除');
});

const progressLane = (patch = {}) => ({
  total: 0,
  completed: 0,
  partial: 0,
  failed: 0,
  cancelled: 0,
  skipped: 0,
  running: 0,
  waiting: 0,
  queued: 0,
  settled: false,
  ...patch,
});
function pipelineRun(patch: Record<string, unknown> = {}) {
  return {
    ...result(),
    runVersion: 3,
    status: 'running',
    canPause: true,
    canEnd: true,
    rulePhase: 'completed',
    progress: [],
    overview: {
      inspection: { total: 23, checked: 23, skipped: 0, settled: true },
      direct: progressLane({ total: 23, completed: 20, queued: 3 }),
      ai: progressLane(),
      review: { pending: 15, manualObjects: 6, retryFiles: 0 },
    },
    ...patch,
  };
}
it('V3 inspection blocks both processing panels and does not show provisional percentage bars', async () => {
  const row = pipelineRun();
  row.overview.inspection.settled = false;
  row.overview.inspection.checked = 4;
  api.listRuns.mockResolvedValue(ok([row]));
  api.getRun.mockResolvedValue(ok(row));
  await mount();
  expect(host.querySelectorAll('.run-metric')).toHaveLength(3);
  expect([...host.querySelectorAll('[data-lane]')].every((el) => el.textContent.includes('等待检查完成'))).toBe(true);
  expect(host.querySelectorAll('.run-metric .b-progress')).toHaveLength(1);
  expect(button('暂停 AI')).toBeTruthy();
});
it('V3 free work keeps polling without any AI work and shows AI-only pause correctly', async () => {
  vi.useFakeTimers();
  try {
    const row = pipelineRun({ status: 'paused', canPause: false, canResume: true });
    api.listRuns.mockResolvedValue(ok([row]));
    api.getRun.mockResolvedValue(ok(row));
    await mount();
    expect(host.querySelector('.workspace-run-status').textContent).toContain('整理中 · AI 已暂停');
    const calls = api.getRun.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2400);
    await settle();
    expect(api.getRun.mock.calls.length).toBe(calls + 1);
    expect(host.querySelector('[data-lane="ai"]').textContent).toContain('数量待确定');
  } finally {
    vi.useRealTimers();
  }
});
it('V3 review counts survive a tab change and failures are not duplicated or colored as success', async () => {
  const row = pipelineRun({ status: 'completed' });
  row.overview.ai = progressLane({ total: 19, completed: 17, failed: 2, settled: true });
  row.overview.direct = progressLane({ total: 23, completed: 23, settled: true });
  api.listRuns.mockResolvedValue(ok([row]));
  api.getRun.mockResolvedValue(ok(row));
  await mount();
  expect(host.querySelector('[data-lane="direct"] strong').textContent).toContain('23 / 23');
  expect(host.querySelector('[data-lane="ai"] strong').textContent).toContain('17 / 19');
  const summary = host.querySelector('.run-review').textContent;
  const tab = [...host.querySelectorAll('[role="tab"]')].find((el) =>
    el.textContent.includes('笔记'),
  ) as HTMLButtonElement;
  tab.click();
  await settle();
  expect(host.querySelector('.run-review').textContent).toBe(summary);
  expect(summary).toContain('15');
  expect(summary).toContain('6');
  expect(host.querySelector('.workspace-run-status').textContent).toContain('部分失败');
  expect(host.querySelector('[data-lane="ai"]').textContent.match(/失败 2 项/g)).toHaveLength(1);
  expect(host.querySelector('[data-lane="ai"]').textContent).not.toContain('取消 0');
});

it('legacy overview separates object outcomes from suggestion totals and hides completed bars', async () => {
  const row = {
    ...result(),
    runVersion: 2,
    status: 'completed',
    checked: 72,
    summary: { ...result().summary, total: 72, aiTotal: 19 },
    review: {
      pending: 15,
      manualObjects: 6,
      retryFiles: 0,
      outcomes: {
        review: 13,
        manual: 6,
        processing: 0,
        unfinished: 2,
        reviewed: 7,
        unchanged: 44,
        skipped: 0,
        unavailable: 0,
      },
    },
    progress: [
      { resourceType: 'file', aiStatus: 'completed', total: 17 },
      { resourceType: 'file', aiStatus: 'failed', total: 2 },
    ],
  };
  api.listRuns.mockResolvedValue(ok([row]));
  api.getRun.mockResolvedValue(ok(row));
  await mount();
  expect(host.querySelector('.outcome-title').textContent).toContain('72');
  expect(host.querySelectorAll('.outcome-counts > div')).toHaveLength(5);
  const segment = host.querySelector('.outcome-segment.segment-review');
  segment.dispatchEvent(new MouseEvent('mouseenter'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  await nextTick();
  const tooltip = Array.from(document.querySelectorAll<HTMLElement>('.b-tooltip-popup')).find(
    (popup) => popup.style.display !== 'none' && popup.textContent.includes('13 / 72'),
  );
  expect(tooltip?.textContent).toContain('18.1%');
  segment.dispatchEvent(new MouseEvent('mouseleave'));

  expect(host.querySelector('.result-primary p').textContent).toContain('13');
  expect(host.querySelector('.result-unchanged strong').textContent).toContain('44');
  expect(host.querySelector('.review-counts').textContent).toContain('15');
  expect(host.querySelector('.run-progress').textContent).toContain('19 项进入后续处理');
  expect(host.querySelectorAll('.run-metric .b-progress')).toHaveLength(0);
});

it('does not show zero progress from the run list when detail loading fails', async () => {
  const listing = { ...result(), runVersion: 2, checked: 0, progress: undefined, items: undefined };
  api.listRuns.mockResolvedValue(ok([listing]));
  api.getRun.mockRejectedValue(new Error('详情读取失败'));
  await mount();
  expect(host.querySelector('.run-progress')).toBeNull();
  expect(host.querySelector('.run-review')).toBeNull();
  expect(host.querySelector('.workspace-run-identity')).toBeNull();
  expect(host.querySelector('.workspace-notice')?.textContent).toContain('详情读取失败');
  expect(button('重新加载')).toBeTruthy();
});

it('统一对象状态使手动选择与未完成不重复，旧建议状态不覆盖后台未完成', async () => {
  const data = {
    ...result(),
    options: { ...result().options, resourceTypes: ['tag'], checks: ['tag_icon'] },
    summary: { ...result().summary, total: 10, types: { tag: 10 } },
    review: {
      pending: 3,
      manualObjects: 7,
      retryFiles: 0,
      outcomes: {
        review: 3,
        manual: 2,
        unfinished: 5,
        processing: 0,
        reviewed: 0,
        unchanged: 0,
        skipped: 0,
        unavailable: 0,
      },
    },
    groupTotals: { priority: 3, manual: 2, unfinished: 5 },
    items: Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      outcome: i < 3 ? 'review' : i < 5 ? 'manual' : 'unfinished',
      resource: { type: 'tag', id: `tag-${i}`, title: `标签${i}` },
      aiStatus: 'completed',
      suggestions: [{ id: `s-${i}`, kind: 'tag_icon', status: i < 3 ? 'pending' : 'insufficient', after: null }],
    })),
  };
  api.listRuns.mockResolvedValue(ok([data]));
  api.getRun.mockResolvedValue(ok(data));
  await mount();
  expect(document.body.textContent).toContain('处理已结束，5 项未完成');
  const manual = [...document.querySelectorAll('.result-kpi')].find((el) => el.textContent?.includes('需手动选择'))!;
  expect(manual.querySelector('strong')?.textContent).toBe('2项');
  expect(document.querySelector('.group-manual .group-toggle')?.textContent).toContain('2');
  expect(document.querySelector('.group-unfinished .group-toggle')?.textContent).toContain('5');
  await openGroup('unfinished');
  document.querySelector<HTMLElement>('.group-unfinished .workspace-resource > header')!.click();
  await settle();
  expect(document.querySelector('.group-unfinished')?.textContent).toContain('图标匹配未完成');
  expect(document.querySelector('.group-unfinished .resource-outcome')?.textContent).toContain('未完成');
  expect(document.querySelector('.group-unfinished .group-toggle')?.textContent).not.toContain('处理中或未完成');
  expect(document.querySelector('.group-unfinished')?.textContent).not.toContain('依据不足');
});

it('标签首屏只读一次详情，完整结果到达前不暴露简略任务和成功状态', async () => {
  const full = {
    ...result(),
    options: { ...result().options, resourceTypes: ['tag'] },
    review: { outcomes: { unfinished: 5 } },
  };
  const { progress, items, ...brief } = full;
  api.listRuns.mockResolvedValue(ok([brief]));
  let resolveDetail!: (value: unknown) => void;
  api.getRun.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
  );
  await mount();
  expect(api.getRun).toHaveBeenCalledTimes(1);
  expect(api.getRun).toHaveBeenCalledWith('r', { resourceType: 'tag', kind: '', after: '' });
  expect(document.querySelector('.workspace-overview')).toBeNull();
  expect(document.querySelector('.workspace-filters')).toBeNull();
  expect(document.querySelector('.b-loading-inline')).not.toBeNull();
  resolveDetail(ok(full));
  await settle();
  expect(api.getRun).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.workspace-overview')?.textContent).toContain('5 项未完成');
  expect(document.querySelector('.workspace-overview')?.textContent).not.toContain('整理完成');
});

it('首次详情失败保持错误态，重试前不展示空结果或不完整任务', async () => {
  api.listRuns.mockResolvedValue(ok([result()]));
  api.getRun.mockRejectedValueOnce(new Error('详情读取失败'));
  await mount();
  expect(document.querySelector('.workspace-overview')).toBeNull();
  expect(document.querySelector('.workspace-notice')?.textContent).toContain('详情读取失败');
  expect(document.querySelector('.workspace-empty')).toBeNull();
  button('重新加载').click();
  await settle();
  expect(document.querySelector('.workspace-overview')).not.toBeNull();
});

it('返回缓存页面时保留完整结果，刷新失败也不清空；离开后的旧响应不能提交', async () => {
  api.listRuns.mockResolvedValue(ok([result()]));
  const visible = ref(true);
  await mount(visible);
  const overview = document.querySelector('.workspace-overview');
  visible.value = false;
  await settle();
  let rejectDetail!: (reason: Error) => void;
  api.getRun.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectDetail = reject;
      }),
  );
  visible.value = true;
  await settle();
  expect(document.querySelector('.workspace-overview')).toBe(overview);
  expect(document.querySelector('.workspace-switch-feedback')).toBeNull();
  rejectDetail(new Error('刷新失败'));
  await settle();
  expect(document.querySelector('.workspace-overview')).toBe(overview);
  expect(document.querySelector('.workspace-notice')?.textContent).toContain('刷新失败');
  visible.value = false;
  await settle();
  let resolveOld!: (value: unknown) => void;
  api.listRuns.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  visible.value = true;
  await settle();
  visible.value = false;
  await settle();
  const count = api.getRun.mock.calls.length;
  resolveOld(ok([{ ...result(), id: 'stale' }]));
  await settle();
  expect(document.querySelector('.workspace-overview')).toBeNull();
});

it('标签分页返回时刷新当前页，不把第一页内容写进第二页', async () => {
  const row = { ...result(), options: { ...result().options, resourceTypes: ['tag'] } };
  api.listRuns.mockResolvedValue(ok([row]));
  api.getRun.mockImplementation((_id, params) =>
    Promise.resolve(ok({ ...row, nextCursor: params.after ? null : 'page2' })),
  );
  const visible = ref(true);
  await mount(visible);
  button('下一页').click();
  await settle();
  expect(api.getRun.mock.lastCall?.[1].after).toBe('page2');
  visible.value = false;
  await settle();
  visible.value = true;
  await settle();
  expect(api.getRun.mock.lastCall?.[1].after).toBe('page2');
  expect(button('上一页')).toBeTruthy();
  expect(api.getRun).toHaveBeenCalledTimes(3);
});

it.each([
  {
    outcome: 'unfinished',
    aiStatus: 'completed',
    reading: { state: 'metadata', complete: false, reasonCode: 'DOCUMENT_PARSE_FAILED' },
    label: '读取失败',
  },
  { outcome: 'unfinished', aiStatus: 'completed', reading: { state: 'partial', complete: false }, label: '部分读取' },
  {
    outcome: 'processing',
    aiStatus: 'waiting_content',
    reading: { state: 'waiting', complete: false },
    label: '读取中',
  },
  { outcome: 'unfinished', aiStatus: 'cancelled', label: '内容分析 · 已取消' },
  { outcome: 'unfinished', aiStatus: 'completed', label: '状态待确认' },
  { outcome: 'processing', aiStatus: 'running', label: '内容分析 · 处理中' },
  { outcome: undefined, aiStatus: 'failed', label: '内容分析 · 失败' },
])('已审核建议不覆盖对象主状态 $label ($outcome)', async ({ outcome, aiStatus, reading, label }) => {
  const run = {
    ...result(),
    status: outcome === 'processing' ? 'running' : 'completed',
    items: [
      {
        id: 'mixed',
        outcome,
        aiStatus,
        ruleStatus: 'completed',
        resource: { id: 'f', type: 'file', title: '资料.pdf', source: { folder: '' }, guards: {}, tags: [], reading },
        suggestions: [
          { id: 'reviewed-tag', kind: 'tags', status: 'applied', reason: '主题建议', before: [], after: [] },
        ],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  const group = outcome === 'processing' ? 'analysis' : 'unfinished';
  await openGroup(group);
  const card = document.querySelector(`.group-${group} .workspace-resource`)!;
  expect(card.querySelector('.resource-conclusion')?.textContent).toBe(label);
  expect(card.querySelector('header')?.textContent).not.toContain('本次建议已处理');
  (card.querySelector('[aria-controls="checks-mixed"]') as HTMLButtonElement).click();
  await settle();
  expect(card.querySelector('.resource-check-details')?.textContent).toContain('已应用 · 主题建议');
});

it('简报审核入口打开指定历史任务且后续分页保持待审核筛选', async () => {
  navigation.currentRoute.value.query = { review: 'pending', runId: 'older-run', resourceType: 'note' };
  api.getRun.mockResolvedValue(ok({ ...result(), id: 'older-run' }));
  await mount();
  expect(api.listRuns).not.toHaveBeenCalled();
  expect(api.getRun).toHaveBeenCalledWith(
    'older-run',
    expect.objectContaining({ resourceType: 'note', reviewOnly: true }),
  );
  expect(document.body.textContent).toContain('简报统计各次整理的待审核建议');
});

it('忽略建议成功后进入已处理，显示已忽略并同步跨组提示', async () => {
  let ignored = false;
  const snapshot = () => ({
    ...result(),
    items: [
      {
        id: 'ignore-item',
        aiStatus: 'completed',
        ruleStatus: 'completed',
        resource: { id: 'n', type: 'note', title: '可忽略资料', source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [
          {
            id: 'ignore-tags',
            kind: 'tags',
            status: ignored ? 'ignored' : 'pending',
            reason: '主题',
            before: [],
            after: [{ id: 't', name: '开发' }],
          },
        ],
      },
    ],
  });
  api.listRuns.mockResolvedValue(ok([snapshot()]));
  api.getRun.mockImplementation(async () => ok(snapshot()));
  api.actOnRunSuggestion.mockImplementation(async () => {
    ignored = true;
    return ok({ status: 'ignored' });
  });
  await mount();
  button('忽略建议').click();
  await settle();
  expect(api.actOnRunSuggestion).toHaveBeenCalledWith('r', 'ignore-tags', 'ignore', undefined, expect.any(String));
  expect(document.querySelector('.group-priority')).toBeNull();
  await openGroup('reviewed');
  expect(document.querySelector('.group-reviewed .resource-conclusion')?.textContent).toBe('已忽略');
  expect(document.body.textContent).toContain('已忽略建议，相关资料已移至：已处理');
});

it('保留完整资源结论及尚未生成建议的检查说明', async () => {
  const row = {
    ...result(),
    status: 'running',
    runVersion: 3,
    items: [
      {
        id: 'waiting-duplicate',
        ruleStatus: 'completed',
        aiStatus: 'not_needed',
        outcome: 'processing',
        work: [{ kind: 'duplicate', lane: 'direct', status: 'waiting' }],
        resource: { id: 'n', type: 'note', title: '已有标签资料', source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [
          { id: 'existing-tags', kind: 'tags', status: 'not_applicable', reason: '已有标签，本次仅补齐无标签资料' },
        ],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([row]));
  api.getRun.mockResolvedValue(ok(row));
  await mount();
  await openGroup('analysis');
  expect(document.querySelector('.resource-conclusion')?.textContent).toBe('重复检查 · 等待资料准备');
  button('检查详情：已有标签资料').click();
  await settle();
  expect(document.querySelector('.resource-expanded')?.textContent).toContain('重复检查 · 等待资料准备');
  expect(document.querySelector('.group-clear')).toBeNull();
});

it('已处理筛选向服务端传递，空结果仍保留筛选入口', async () => {
  const data = {
    ...result(),
    items: [
      {
        id: 'handled',
        ruleStatus: 'completed',
        aiStatus: 'completed',
        outcome: 'reviewed',
        resource: { id: 'n', type: 'note', title: '已应用资料', source: { folder: '' }, guards: {}, tags: [] },
        suggestions: [{ id: 'tags', kind: 'tags', status: 'applied', reason: '主题' }],
      },
    ],
  };
  api.listRuns.mockResolvedValue(ok([data]));
  api.getRun.mockImplementation(async (_id, params) =>
    ok(params.reviewState === 'ignored' ? { ...data, items: [], groupTotals: { reviewed: 0 } } : data),
  );
  await mount();
  await openGroup('reviewed');
  const filter = document.querySelector<HTMLElement>('[role="combobox"][aria-label="筛选已处理结果"]')!;
  filter.click();
  await settle();
  const ignored = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (el) => el.textContent?.trim() === '已忽略',
  )!;
  ignored.click();
  await settle();
  expect(api.getRun.mock.lastCall?.[1]).toMatchObject({ reviewState: 'ignored', after: '' });
  expect(document.querySelector('.group-reviewed')).not.toBeNull();
  expect(document.querySelector('.group-reviewed')?.textContent).toContain('当前显示 0 项');
});
it('标签合并展示目标与关联数，明确确认后才提交，不能批量应用', async () => {
  api.alert.mockImplementation(() => {});
  const run = result();
  run.options = { resourceTypes: ['tag'], checks: ['tag_merge'], scope: 'all' };
  run.items = [
    {
      id: 'i',
      aiStatus: 'completed',
      ruleStatus: 'completed',
      resource: {
        id: 'b',
        type: 'tag',
        title: '<JS>',
        source: { folder: '' },
        guards: {},
        tags: [],
        evidenceLevel: 'metadata',
      },
      suggestions: [
        {
          id: 'merge',
          kind: 'tag_merge',
          status: 'pending',
          before: 'JS',
          after: 'JavaScript',
          reason: '同义缩写',
          merge: { targetId: 'a', targetName: 'JavaScript', associationCount: 6 },
        },
      ],
    },
  ];
  api.listRuns.mockResolvedValue(ok([run]));
  api.getRun.mockResolvedValue(ok(run));
  await mount();
  await openGroup('priority');
  expect(document.body.textContent).toContain('JavaScript');
  button('确认合并').click();
  await settle();
  expect(api.actOnRunSuggestion).not.toHaveBeenCalled();
  const confirmation = api.alert.mock.calls.at(-1)![0];
  expect(confirmation.content).toContain('6');
  expect(confirmation.content).toContain('&lt;JS&gt;');
  expect(confirmation.content).not.toContain('<JS>');
  expect(confirmation.content).toContain('JavaScript');
  await confirmation.onOk();
  await settle();
  expect(api.actOnRunSuggestion).toHaveBeenCalledWith(
    'r',
    'merge',
    'apply',
    { confirmMerge: true, targetId: 'a' },
    expect.any(String),
  );
});

function deferredResponse() {
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function pendingDescriptionRun(count = 1) {
  return {
    ...result(),
    options: { ...result().options, resourceTypes: ['bookmark'], checks: ['description'] },
    groupTotals: { priority: count },
    items: Array.from({ length: count }, (_, i) => ({
      id: `item-${i}`,
      outcome: 'review',
      aiStatus: 'completed',
      ruleStatus: 'completed',
      resource: { id: `b-${i}`, type: 'bookmark', title: `书签 ${i}`, source: { folder: '' }, guards: {}, tags: [] },
      suggestions: [
        {
          id: `description-${i}`,
          kind: 'description',
          status: 'pending',
          before: '',
          after: `描述 ${i}`,
          reason: '根据网页内容补全描述',
        },
      ],
    })),
  };
}
it('开始后等待完整详情才关闭确认面板，不先展示只有转圈的简略任务', async () => {
  api.listRuns.mockResolvedValue(ok([]));
  await mount();
  button('重新整理').click();
  await settle();
  await toScope();
  button('确认整理范围').click();
  await settle();
  const full = pipelineRun({ status: 'preparing' });
  full.overview.inspection = { total: 23, checked: 0, skipped: 0, settled: false };
  const { overview, progress, createdAt, ...brief } = full;
  api.startRun.mockResolvedValue(ok(brief));
  const detail = deferredResponse();
  api.getRun.mockReturnValueOnce(detail.promise);
  button('开始整理 23 项').click();
  await settle();
  expect(button('开始整理 23 项').disabled).toBe(true);
  expect(document.querySelector('.workspace-overview')).toBeNull();
  detail.resolve(ok(full));
  await settle();
  expect(button('开始整理 23 项')).toBeUndefined();
  expect(host.querySelectorAll('.run-metric')).toHaveLength(3);
  expect([...host.querySelectorAll('[data-lane]')].every((el) => el.textContent.includes('等待检查完成'))).toBe(true);
  expect(document.querySelector('.workspace-overview .workspace-empty')).toBeNull();
});
it('启动成功但读取失败时保留确认与重试，重试只读详情不重复启动', async () => {
  api.listRuns.mockResolvedValue(ok([]));
  await mount();
  button('重新整理').click();
  await settle();
  await toScope();
  button('确认整理范围').click();
  await settle();
  api.getRun.mockRejectedValueOnce(new Error('读取超时'));
  button('开始整理 23 项').click();
  await settle();
  expect(document.body.textContent).toContain('整理已在后台开始');
  expect(button('开始整理 23 项').disabled).toBe(false);
  button('开始整理 23 项').click();
  await settle();
  expect(api.startRun).toHaveBeenCalledTimes(1);
  expect(button('开始整理 23 项')).toBeUndefined();
  expect(document.querySelector('.workspace-notice')).toBeNull();
});
it.each([false, true])('写入回执立即移出待审核，旧读取与刷新失败不复活按钮（失败=%s）', async (refreshFails) => {
  const original = pendingDescriptionRun();
  api.listRuns.mockResolvedValue(ok([original]));
  api.getRun.mockImplementation(async () => ok(structuredClone(original)));
  await mount();
  const oldRead = deferredResponse(),
    write = deferredResponse(),
    freshRead = deferredResponse();
  api.getRun.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(freshRead.promise);
  await wakeWorkspace();
  api.actOnRunSuggestion.mockReturnValueOnce(write.promise);
  button('应用建议').click();
  await settle();
  expect(button('应用建议').disabled).toBe(true);
  expect(button('应用建议').className).toContain('loading');
  write.resolve(ok({ status: 'applied', applied: '保存后的描述' }));
  await settle();
  expect(button('应用建议')).toBeUndefined();
  expect(document.querySelector('.group-priority')).toBeNull();
  expect(document.body.textContent).toContain('已应用建议');
  // This old snapshot finishes after the mutation and the fresh read has begun.
  oldRead.resolve(ok(structuredClone(original)));
  await settle();
  expect(button('应用建议')).toBeUndefined();
  expect(document.querySelector('.group-priority')).toBeNull();
  if (refreshFails) freshRead.reject(new Error('统计刷新失败'));
  else {
    const updated = structuredClone(original);
    updated.items[0].suggestions[0].status = 'applied';
    updated.items[0].outcome = 'reviewed';
    updated.groupTotals = { priority: 0 };
    freshRead.resolve(ok(updated));
  }
  await settle();
  expect(button('应用建议')).toBeUndefined();
  expect(document.body.textContent).toContain('已应用建议');
  if (refreshFails) expect(document.body.textContent).toContain('统计刷新失败');
});
it('连续应用不同建议时合并刷新，处理中重复点击不重复提交', async () => {
  const original = pendingDescriptionRun(2);
  api.listRuns.mockResolvedValue(ok([original]));
  api.getRun.mockImplementation(async () => ok(structuredClone(original)));
  await mount();
  const first = deferredResponse(),
    second = deferredResponse(),
    read = deferredResponse();
  api.actOnRunSuggestion.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')].filter(
    (el) => el.textContent.trim() === '应用建议',
  );
  buttons[0].click();
  buttons[0].click();
  buttons[1].click();
  await settle();
  expect(api.actOnRunSuggestion).toHaveBeenCalledTimes(2);
  first.resolve(ok({ status: 'applied', applied: '描述 0' }));
  await settle();
  expect(api.getRun).toHaveBeenCalledTimes(1);
  api.getRun.mockReturnValueOnce(read.promise);
  second.resolve(ok({ status: 'applied', applied: '描述 1' }));
  await settle();
  expect(api.getRun).toHaveBeenCalledTimes(2);
  expect(button('应用建议')).toBeUndefined();
  read.reject(new Error('刷新失败'));
  await settle();
});
it('离开工作区后的应用回执不能修改重新进入后的新快照', async () => {
  const original = pendingDescriptionRun();
  api.listRuns.mockResolvedValue(ok([original]));
  api.getRun.mockImplementation(async () => ok(structuredClone(original)));
  const visible = ref(true);
  await mount(visible);
  const write = deferredResponse();
  api.actOnRunSuggestion.mockReturnValueOnce(write.promise);
  button('应用建议').click();
  await settle();
  visible.value = false;
  await settle();
  const newer = structuredClone(original);
  newer.id = 'new-run';
  api.listRuns.mockResolvedValue(ok([newer]));
  api.getRun.mockResolvedValue(ok(newer));
  visible.value = true;
  await settle();
  const calls = api.getRun.mock.calls.length;
  write.resolve(ok({ status: 'applied' }));
  await settle();
  expect(api.getRun).toHaveBeenCalledTimes(calls);
  expect(button('应用建议')).toBeTruthy();
  expect(document.body.textContent).not.toContain('已应用建议');
});
it('忽略仅在本按钮显示提交进度，失败保留建议且手动重试沿用幂等标识', async () => {
  const original = pendingDescriptionRun();
  api.listRuns.mockResolvedValue(ok([original]));
  api.getRun.mockImplementation(async () => ok(structuredClone(original)));
  await mount();
  const write = deferredResponse();
  api.actOnRunSuggestion.mockReturnValueOnce(write.promise);
  button('忽略建议').click();
  await settle();
  expect(button('忽略建议').className).toContain('loading');
  expect(button('应用建议').className).not.toContain('loading');
  write.reject(new Error('保存失败'));
  await settle();
  expect(document.body.textContent).toContain('保存失败');
  expect(button('忽略建议').disabled).toBe(false);
  expect(document.querySelector('.group-priority')).not.toBeNull();
  expect(api.getRun).toHaveBeenCalledTimes(1);
  const read = deferredResponse();
  api.getRun.mockReturnValueOnce(read.promise);
  api.actOnRunSuggestion.mockResolvedValueOnce(ok({ status: 'ignored' }));
  button('忽略建议').click();
  await settle();
  expect(api.actOnRunSuggestion.mock.calls[1][4]).toBe(api.actOnRunSuggestion.mock.calls[0][4]);
  expect(button('应用建议')).toBeUndefined();
  expect(document.body.textContent).toContain('已忽略建议');
  read.reject(new Error('读取失败'));
  await settle();
});

function pagedItem(id: string, status = 'not_applicable', kind = 'tags') {
  return {
    id,
    aiStatus: 'completed',
    ruleStatus: 'completed',
    resource: { id, type: 'bookmark', title: `资料 ${id}`, source: { folder: '' }, guards: {} },
    suggestions: [{ id: `s-${id}`, kind, status, reason: '检查结果', after: [{ id: 't', name: '主题' }] }],
  };
}
function groupedResult(pages: Record<string, { items: any[]; nextCursor: string | null }>, totals = {}) {
  return {
    ...result(),
    resourceType: 'bookmark',
    pages,
    groupTotals: totals,
    items: undefined,
  };
}
function pageObserver() {
  const callbacks = new Map<Element, IntersectionObserverCallback>();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        callbacks.set(target, this.callback);
      }
      disconnect() {}
    },
  );
  return async (group: string) => {
    const el = document.querySelector(`.group-${group} .group-continuation`)!;
    callbacks.get(el)?.(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    await settle();
  };
}

it('批量入口补齐后页再全选，范围不缩为首批且不读取无关分组', async () => {
  const first = Array.from({ length: 30 }, (_, i) => pagedItem(`a${i}`, 'pending', 'empty'));
  const rest = [pagedItem('z1', 'pending'), pagedItem('z2', 'pending')];
  const initial = groupedResult({ priority: { items: first, nextCursor: 'a29' } }, { priority: 32, clear: 200 });
  api.getWorkspace.mockResolvedValue(ok({ ...initial, batchAvailable: true }));
  let resolvePage!: (value: unknown) => void;
  api.getRun.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
  );
  await mount();
  button('批量应用').click();
  await settle();
  expect(document.querySelector('.resource-batch-toolbar')).toBeNull();
  expect(api.getRun.mock.calls).toHaveLength(1);
  expect(api.getRun.mock.lastCall?.[1]).toMatchObject({ group: 'priority', after: 'a29' });
  resolvePage(ok({ items: rest, nextCursor: null }));
  await settle();
  expect(document.querySelector('.resource-batch-toolbar')?.textContent).toContain('应用所选 2 项');
  api.applyRunSuggestionBatch.mockImplementation(async (_id, entries) =>
    ok({ results: entries.map((entry) => ({ ...entry, status: 'applied' })) }),
  );
  button('应用所选 2 项').click();
  await settle();
  expect(api.applyRunSuggestionBatch.mock.calls[0][1].map((entry) => entry.suggestionId)).toEqual(['s-z1', 's-z2']);
});

it('批量范围补读失败保留结果，不能静默应用部分范围，重试后才全选', async () => {
  const initial = groupedResult({ priority: { items: [pagedItem('a', 'pending')], nextCursor: 'a' } }, { priority: 2 });
  api.getWorkspace.mockResolvedValue(ok({ ...initial, batchAvailable: true }));
  api.getRun.mockRejectedValueOnce(new Error('续页失败'));
  await mount();
  button('批量应用').click();
  await settle();
  expect(document.querySelector('.resource-batch-toolbar')).toBeNull();
  expect(document.querySelector('.group-priority .workspace-resource')?.textContent).toContain('资料 a');
  expect(document.querySelector('.group-continuation')?.textContent).toContain('续页失败');
  expect(api.applyRunSuggestionBatch).not.toHaveBeenCalled();
  api.getRun.mockResolvedValue(ok({ items: [pagedItem('b', 'pending')], nextCursor: null }));
  button('批量应用').click();
  await settle();
  expect(document.querySelector('.resource-batch-toolbar')?.textContent).toContain('应用所选 2 项');
});

it('自动续页合并在途请求，失败停止自动重试并保留已读结果', async () => {
  const intersect = pageObserver();
  api.getWorkspace.mockResolvedValue(
    ok(groupedResult({ clear: { items: [pagedItem('a')], nextCursor: 'a' } }, { clear: 3 })),
  );
  let rejectPage!: (reason: Error) => void;
  api.getRun.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectPage = reject;
      }),
  );
  await mount();
  await openGroup('clear');
  await intersect('clear');
  await intersect('clear');
  expect(api.getRun).toHaveBeenCalledTimes(1);
  rejectPage(new Error('网络中断'));
  await settle();
  expect(document.querySelectorAll('.group-clear .workspace-resource')).toHaveLength(1);
  expect(document.querySelector('.group-continuation')?.textContent).toContain('网络中断');
  api.getRun.mockResolvedValue(ok({ items: [pagedItem('b'), pagedItem('c')], nextCursor: null }));
  button('重新加载').click();
  await settle();
  expect(document.querySelectorAll('.group-clear .workspace-resource')).toHaveLength(3);
  expect(document.querySelector('.group-continuation')).toBeNull();
});

it('切换类型后忽略旧分组续页响应，摘要与新列表保持同一筛选', async () => {
  const intersect = pageObserver();
  api.getWorkspace.mockResolvedValue(
    ok(groupedResult({ clear: { items: [pagedItem('a')], nextCursor: 'a' } }, { clear: 2 })),
  );
  let resolveOld!: (value: unknown) => void;
  api.getRun.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  await mount();
  await openGroup('clear');
  await intersect('clear');
  api.getRun.mockResolvedValue(ok({ ...groupedResult({}, {}), resourceType: 'note' }));
  const tab = [...document.querySelectorAll<HTMLElement>('[role=tab]')].find((el) => el.textContent?.includes('笔记'))!;
  tab.click();
  await settle();
  resolveOld(ok({ items: [pagedItem('old')], nextCursor: null }));
  await settle();
  expect(document.body.textContent).not.toContain('资料 old');
  expect(document.querySelectorAll('.workspace-resource')).toHaveLength(0);
  expect(api.getRun.mock.lastCall?.[1]).toMatchObject({ resourceType: 'note' });
});

it('多页静默刷新保留已加载范围、折叠选择和滚动位置，只刷新一次摘要', async () => {
  const intersect = pageObserver();
  const first = Array.from({ length: 30 }, (_, i) => pagedItem(`a${i}`));
  const rest = Array.from({ length: 30 }, (_, i) => pagedItem(`b${i}`));
  const initial = groupedResult({ clear: { items: first, nextCursor: 'a29' } }, { clear: 60 });
  api.getWorkspace.mockResolvedValue(ok(initial));
  api.getRun.mockResolvedValue(ok({ items: rest, nextCursor: null }));
  await mount();
  await openGroup('clear');
  await intersect('clear');
  expect(document.querySelectorAll('.workspace-resource')).toHaveLength(60);
  const root = document.querySelector<HTMLElement>('.organize-suggestion-workspace')!;
  root.scrollTop = 600;
  api.getRun.mockClear();
  api.getRun.mockImplementation(async (_id, params) =>
    ok(params.group ? { items: rest, nextCursor: null } : structuredClone(initial)),
  );
  await wakeWorkspace();
  expect(api.getRun).toHaveBeenCalledTimes(2);
  expect(api.getRun.mock.calls.filter(([, params]) => !params.group)).toHaveLength(1);
  expect(document.querySelectorAll('.workspace-resource')).toHaveLength(60);
  expect(document.querySelector('.group-clear .group-toggle')?.getAttribute('aria-expanded')).toBe('true');
  expect(root.scrollTop).toBe(600);
});

it('批量回执立即更新分组与对象计数，后续刷新失败仍保留成功和失效结果', async () => {
  const entries = ['a', 'b', 'c'].map((id) => ({ ...pagedItem(id, 'pending'), outcome: 'review' }));
  // Two acknowledgements on one object must move its group count only once.
  entries[0].suggestions.push({ ...entries[0].suggestions[0], id: 's-a2' });
  const totals = {
    pending: 4,
    manualObjects: 0,
    retryFiles: 0,
    outcomes: {
      review: 3,
      manual: 0,
      processing: 0,
      unfinished: 0,
      reviewed: 0,
      unchanged: 200,
      skipped: 0,
      unavailable: 0,
    },
  };
  api.getWorkspace.mockResolvedValue(
    ok({
      ...groupedResult({ priority: { items: entries, nextCursor: null } }, { priority: 3 }),
      batchAvailable: true,
      review: totals,
      // Mock structured responses may share the outcome object, unlike JSON transport.
      overview: { ...pipelineRun().overview, review: { ...totals } },
      runVersion: 3,
    }),
  );
  api.getRun.mockRejectedValue(new Error('统计刷新失败'));
  api.applyRunSuggestionBatch.mockImplementation(async (_id, requests) =>
    ok({
      results: requests.map((entry) => ({
        ...entry,
        status: entry.suggestionId === 's-b' ? 'expired' : entry.suggestionId === 's-c' ? 'failed' : 'applied',
      })),
    }),
  );
  await mount();
  button('批量应用').click();
  await settle();
  button('应用所选 4 项').click();
  await settle();
  expect(document.body.textContent).toContain('统计刷新失败');
  expect(document.querySelector('.group-priority .group-count')?.textContent).toBe('1');
  expect(document.querySelector('.group-reviewed .group-count')?.textContent).toBe('1');
  expect(document.querySelector('.group-expired .group-count')?.textContent).toBe('1');
  expect(document.querySelector('.resource-batch-toolbar')?.textContent).toContain('应用所选 1 项');
  expect(document.querySelector('.result-primary strong')?.textContent).toBe('1条');
  expect(document.querySelector('.outcome-review dd')?.textContent?.trim()).toBe('1 项');
  expect(document.querySelector('.outcome-reviewed dd')?.textContent?.trim()).toBe('1 项');
  expect(document.querySelector('.outcome-unavailable dd')?.textContent?.trim()).toBe('1 项');
  expect(document.querySelector('.outcome-unchanged dd')?.textContent?.trim()).toBe('200 项');
  expect(api.getRun).toHaveBeenCalledTimes(1);
});

it('刷新前页新增对象后仍保留已读到的末项，不按旧条数截断读取范围', async () => {
  const intersect = pageObserver();
  const oldItems = Array.from({ length: 60 }, (_, i) => pagedItem(`b${String(i).padStart(2, '0')}`));
  api.getWorkspace.mockResolvedValue(
    ok(groupedResult({ clear: { items: oldItems.slice(0, 30), nextCursor: 'b29' } }, { clear: 90 })),
  );
  api.getRun.mockResolvedValueOnce(ok({ items: oldItems.slice(30), nextCursor: 'b59' }));
  await mount();
  await openGroup('clear');
  await intersect('clear');
  const inserted = Array.from({ length: 30 }, (_, i) => pagedItem(`a${String(i).padStart(2, '0')}`));
  api.getRun.mockClear();
  api.getRun.mockImplementation(async (_id, params) =>
    ok(
      !params.group
        ? groupedResult({ clear: { items: inserted, nextCursor: 'a29' } }, { clear: 120 })
        : {
            items: params.after === 'a29' ? oldItems.slice(0, 30) : oldItems.slice(30),
            nextCursor: params.after === 'a29' ? 'b29' : 'b59',
          },
    ),
  );
  await wakeWorkspace();
  expect(document.querySelector('.group-clear')?.textContent).toContain('资料 b59');
  expect(document.querySelectorAll('.group-clear .workspace-resource')).toHaveLength(90);
  expect(api.getRun).toHaveBeenCalledTimes(3);
});

it('跨页批量遵守检查筛选，刷新后保留取消勾选且不会顺带提交其他建议', async () => {
  const entries = Array.from({ length: 32 }, (_, i) => {
    const item = pagedItem(`a${String(i).padStart(2, '0')}`, 'pending');
    item.suggestions.push({ ...item.suggestions[0], id: `title-${item.id}`, kind: 'title', after: `标题 ${i}` } as any);
    return item;
  });
  const initial = {
    ...groupedResult({ priority: { items: entries.slice(0, 30), nextCursor: 'a29' } }, { priority: 32 }),
    kind: 'title',
    batchAvailable: true,
  };
  api.getWorkspace.mockResolvedValue(ok(structuredClone(initial)));
  api.getRun.mockImplementation(async (_id, params) =>
    ok(structuredClone(params.group ? { items: entries.slice(30), nextCursor: null } : initial)),
  );
  await mount();
  button('批量应用').click();
  await settle();
  expect(button('应用所选 32 项')).toBeTruthy();
  const lastCheckbox = () =>
    [...document.querySelectorAll<HTMLElement>('.workspace-resource > header .b-checkbox')].at(-1)!;
  lastCheckbox().click();
  await settle();
  await wakeWorkspace();
  expect(button('应用所选 31 项')).toBeTruthy();
  expect(lastCheckbox().getAttribute('aria-checked')).toBe('false');
  expect(api.getRun.mock.calls.every(([, query]) => query.kind === 'title' && query.resourceType === 'bookmark')).toBe(
    true,
  );
  api.applyRunSuggestionBatch.mockImplementation(async (_id, requests) =>
    ok({ results: requests.map((entry) => ({ ...entry, status: 'applied' })) }),
  );
  api.getRun.mockRejectedValue(new Error('刷新失败'));
  button('应用所选 31 项').click();
  await settle();
  expect(api.applyRunSuggestionBatch.mock.calls.map(([, requests]) => requests.length)).toEqual([20, 11]);
  expect(
    api.applyRunSuggestionBatch.mock.calls.flatMap(([, requests]) => requests.map((entry) => entry.suggestionId)),
  ).toEqual(entries.slice(0, 31).map((item) => `title-${item.id}`));
  // The other pending check keeps each object in the priority group.
  expect(document.querySelector('.group-priority .group-count')?.textContent).toBe('32');
  // 32 项双建议经历跨页补读、静默刷新和两批提交，单独留足 DOM 更新预算。
}, 20_000);

it('刷新补页失败不提交半份摘要或列表，重试后再一起更新', async () => {
  const intersect = pageObserver();
  const entries = Array.from({ length: 60 }, (_, i) => pagedItem(`a${String(i).padStart(2, '0')}`));
  const initial = groupedResult({ clear: { items: entries.slice(0, 30), nextCursor: 'a29' } }, { clear: 60 });
  api.getWorkspace.mockResolvedValue(ok(structuredClone(initial)));
  api.getRun.mockResolvedValueOnce(ok({ items: entries.slice(30), nextCursor: null }));
  await mount();
  await openGroup('clear');
  await intersect('clear');
  const refreshed = { ...structuredClone(initial), groupTotals: { clear: 61 } };
  refreshed.pages.clear.items[0].resource.title = '刷新后的标题';
  api.getRun.mockResolvedValueOnce(ok(structuredClone(refreshed))).mockRejectedValueOnce(new Error('第二页超时'));
  await wakeWorkspace();
  expect(document.querySelectorAll('.group-clear .workspace-resource')).toHaveLength(60);
  expect(document.querySelector('.group-clear .group-count')?.textContent).toBe('60');
  expect(document.body.textContent).not.toContain('刷新后的标题');
  expect(document.body.textContent).toContain('第二页超时');
  api.getRun.mockImplementation(async (_id, params) =>
    ok(structuredClone(params.group ? { items: entries.slice(30), nextCursor: 'a59' } : refreshed)),
  );
  button('重新加载').click();
  await settle();
  expect(document.querySelector('.group-clear .group-count')?.textContent).toBe('61');
  expect(document.body.textContent).toContain('刷新后的标题');
  expect(document.body.textContent).not.toContain('第二页超时');
});
