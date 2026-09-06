import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import zh from '@/i18n/locales/zh-CN';
const api = vi.hoisted(() => ({
  previewRun: vi.fn(),
  startRun: vi.fn(),
  getRun: vi.fn(),
  listRuns: vi.fn(),
  cancelRun: vi.fn(),
  pauseRun: vi.fn(),
  resumeRun: vi.fn(),
  actOnRunSuggestion: vi.fn(),
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: (options: any) => options.onOk() },
}));
vi.mock('@/api/organizeSuggestionApi', () => api);
vi.mock('@/components/resourcePicker/ResourcePickerPanel.vue', () => ({
  default: {
    props: ['allowedTypes', 'exhaustiveSingleType', 'pageScroll', 'selectedResourceKeys'],
    emits: ['select', 'select-many'],
    template: `<div class="picker-stub" :data-types="allowedTypes.join()" :data-paging="exhaustiveSingleType" :data-selected="selectedResourceKeys?.join()"><button @click="$emit('select', {type:allowedTypes[0],id:'test',title:allowedTypes[0]+'测试资料'})">选择测试资源</button><button @click="$emit('select-many', Array.from({length:1001}, (_, i)=>({type:allowedTypes[0],id:'many'+i})))">超限批量选择</button></div>`,
  },
}));
vi.mock('@/api/tagSpace', () => ({ fetchSelectableTags: vi.fn().mockResolvedValue([{ id: 't', name: 'Vue' }]) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/utils/common', () => ({ generateUUID: () => 'c56a4180-65aa-42ec-a945-5fd21dec0538' }));
import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
import Workspace from './OrganizeSuggestionWorkspace.vue';
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
  const el = document.querySelector<HTMLButtonElement>(`.group-${key} > button`)!;
  if (el.getAttribute('aria-expanded') !== 'true') el.click();
  await settle();
}
async function toScope() {
  button('下一步：选项目').click();
  await settle();
  button('下一步：定范围').click();
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
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
it('每次重新整理都重新选择范围，默认三类资源和四项检查', async () => {
  await mount();
  button('重新整理').click();
  await settle();
  expect(document.body.textContent).toContain('想整理哪些资料？');
  expect(button('确认整理范围')).toBeUndefined();
  await toScope();
  expect(document.body.textContent).toContain('最近新增');
  button('确认整理范围').click();
  await settle();
  expect(api.previewRun).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: 'recent',
      resourceTypes: ['bookmark', 'note', 'file'],
      checks: ['tags', 'title', 'empty', 'duplicate'],
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
  button('下一步：选项目').click();
  await settle();
  for (const name of ['标签建议', '空内容检查', '重复检查']) {
    button(name).click();
    await settle();
  }
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
  for (const name of ['笔记', '文件']) {
    button(name).click();
    await settle();
  }
  button('下一步：选项目').click();
  await settle();
  expect(button('笔记标题')).toBeUndefined();
  expect(button('空内容检查')).toBeUndefined();
  for (const name of ['标签建议', '重复检查']) {
    button(name).click();
    await settle();
  }
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
  expect(document.body.textContent).toContain('想整理哪些资料？');
  expect(button('下一步：选项目').disabled).toBe(false);
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
  expect(metrics[1].textContent).toMatch(/22\s*\/ 22/);
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
  expect(button('收起详情')).toBeDefined();
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
  expect(host.textContent).toContain('检查后确定');
  expect(host.querySelectorAll('.b-progress')).toHaveLength(0);
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

it('刷新恢复当前类型、展开与收起选择，不重新创建任务', async () => {
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
    expect.objectContaining({ resourceType: 'note', kind: 'empty' }),
  );
  expect(api.startRun).not.toHaveBeenCalled();
});
