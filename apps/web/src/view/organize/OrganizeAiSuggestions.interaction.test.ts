import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import zh from '@/i18n/locales/zh-CN';
import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

const tagApi = vi.hoisted(() => ({ fetchSelectableTags: vi.fn() }));
vi.mock('@/api/tagSpace', () => tagApi);
const api = vi.hoisted(() => ({
  getOrganizeAiSuggestionBatches: vi.fn(),
  getOrganizeAiSuggestionBatch: vi.fn(),
  estimateOrganizeAiSuggestions: vi.fn(),
  createOrganizeAiSuggestionBatch: vi.fn(),
  updateOrganizeAiSuggestion: vi.fn(),
  acceptOrganizeAiSuggestion: vi.fn(),
  ignoreOrganizeAiSuggestion: vi.fn(),
  getOrganizeIssueList: vi.fn(),
}));
vi.mock('@/api/organizeApi', () => api);
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
const ids = vi.hoisted(() => ({ generateUUID: vi.fn() }));
vi.mock('@/utils/common', () => ids);
import OrganizeAiSuggestions from './OrganizeAiSuggestions.vue';

const suggestion = () => ({
  id: 's1',
  resource: { type: 'note', id: 'n1', title: '验收笔记', version: 'v1' },
  currentTags: [],
  recommendedTags: [{ id: 'tag1', name: '设计', source: 'existing' }],
  reason: '围绕界面设计展开。',
  status: 'pending',
});
const batch = () => ({
  id: 'b1',
  resourceType: 'note',
  scopeMode: 'selected',
  status: 'ready',
  progress: { total: 1, processed: 1, ready: 1, failed: 0, accepted: 0, ignored: 0, conflicted: 0, percent: 100 },
  createdAt: '2026-09-05T02:00:00Z',
  suggestions: [suggestion()],
});
const ok = (data: unknown) => ({ status: 200, data });
let app: App | undefined;
let host: HTMLElement;
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await nextTick();
};
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((el) => el.textContent?.trim() === text)!;
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(OrganizeAiSuggestions) });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.component('svg-icon', SvgIcon);
  app.directive('auto-scrollbar', {});
  app.mount(host);
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  let requestNumber = 0;
  ids.generateUUID.mockImplementation(() =>
    ++requestNumber === 1 ? 'test-request-id' : `test-request-id-${requestNumber}`,
  );
  sessionStorage.clear();
  tagApi.fetchSelectableTags.mockResolvedValue([{ id: 'tag1', name: '设计' }]);
  api.estimateOrganizeAiSuggestions.mockResolvedValue(
    ok({
      featureEnabled: true,
      scope: { eligibleCount: 1, skippedCount: 0 },
      estimate: { estimatedTokensLower: 100, estimatedTokensUpper: 200 },
      canCreate: true,
    }),
  );
  api.getOrganizeAiSuggestionBatches.mockResolvedValue(ok({ items: [batch()], nextCursor: null }));
  api.getOrganizeAiSuggestionBatch.mockResolvedValue(ok(batch()));
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  host?.remove();
  sessionStorage.clear();
});

describe('AI 整理审核工作区交互', () => {
  it('已有结果直接审核，重新整理从第一步开始，编辑取消不写资源', async () => {
    await mount();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain('验收笔记');
    button('编辑').click();
    await settle();
    expect(document.querySelector('.b-select')?.textContent).toContain('设计');
    button('取消').click();
    await settle();
    expect(api.updateOrganizeAiSuggestion).not.toHaveBeenCalled();
    expect(api.acceptOrganizeAiSuggestion).not.toHaveBeenCalled();
    button('重新整理').click();
    await settle();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('选择范围');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('当前全部无标签资源');
    expect(api.estimateOrganizeAiSuggestions).not.toHaveBeenCalled();
    expect(api.createOrganizeAiSuggestionBatch).not.toHaveBeenCalled();
  });

  it('笔记库带入资源先确认范围，手动估算并创建后关闭抽屉', async () => {
    sessionStorage.setItem(
      'light-note:organize-ai-suggestion-seed:v1',
      JSON.stringify({ resourceType: 'note', resourceIds: ['n1'] }),
    );
    api.estimateOrganizeAiSuggestions.mockResolvedValue(
      ok({
        featureEnabled: true,
        scope: { eligibleCount: 1, skippedCount: 0 },
        estimate: { estimatedTokensLower: 100, estimatedTokensUpper: 200 },
        canCreate: true,
      }),
    );
    api.createOrganizeAiSuggestionBatch.mockResolvedValue(ok(batch()));
    await mount();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('选择范围');
    expect(api.estimateOrganizeAiSuggestions).not.toHaveBeenCalled();
    button('确认整理范围').click();
    await settle();
    expect(api.estimateOrganizeAiSuggestions).toHaveBeenCalledWith({
      resourceType: 'note',
      scope: 'selected',
      resourceIds: ['n1'],
    });
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('确认整理范围');
    button('开始生成 1 项建议').click();
    await settle();
    expect(api.createOrganizeAiSuggestionBatch).toHaveBeenCalledWith({
      requestId: 'test-request-id',
      groupId: 'test-request-id',
      resourceType: 'note',
      scope: 'selected',
      resourceIds: ['n1'],
    });
    expect(document.querySelector('.b-drawer-wrapper')?.getAttribute('aria-hidden')).toBe('true');
    expect(sessionStorage.getItem('light-note:organize-ai-suggestion-seed:v1')).toBeNull();
  });

  it('取消外部带入后重新整理从默认范围开始，刷新不再带入旧选择', async () => {
    sessionStorage.setItem(
      'light-note:organize-ai-suggestion-seed:v1',
      JSON.stringify({ resourceType: 'note', resourceIds: ['n1'] }),
    );
    await mount();
    expect(sessionStorage.getItem('light-note:organize-ai-suggestion-seed:v1')).toBeNull();
    (document.querySelector('.b-drawer-close') as HTMLButtonElement).click();
    await settle();
    button('重新整理').click();
    await settle();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('选择范围');
    expect(document.querySelectorAll('.is-resource-type [aria-pressed="true"]')).toHaveLength(2);
    expect(document.querySelector('.organize-ai-seed')).toBeNull();
    expect(api.estimateOrganizeAiSuggestions).not.toHaveBeenCalled();
  });

  it('应用成功后展示实际写入标签并退出操作，刷新失败保留成功结果', async () => {
    await mount();
    api.acceptOrganizeAiSuggestion.mockResolvedValue(
      ok({ ...suggestion(), status: 'accepted', acceptedTags: [{ id: 'tag2', name: '交互设计' }] }),
    );
    api.getOrganizeAiSuggestionBatch.mockRejectedValue(new Error('offline'));
    button('应用标签').click();
    await settle();
    expect(host.textContent).toContain('已应用');
    expect(host.textContent).toContain('交互设计');
    expect(host.querySelector('.organize-ai-suggestion__actions')).toBeNull();
    expect(host.textContent).toContain('刷新失败');
  });

  it('批次详情首次失败显示重试，不伪装成没有建议', async () => {
    api.getOrganizeAiSuggestionBatches.mockResolvedValue(ok({ items: [{ ...batch(), suggestions: undefined }] }));
    api.getOrganizeAiSuggestionBatch.mockRejectedValue(new Error('offline'));
    await mount();
    expect(host.textContent).toContain('无法读取这批建议');
    expect(host.textContent).not.toContain('这批任务暂时没有可审核');
  });
  it('无建议可以选择已有标签并直接保存，取消草稿不写入', async () => {
    const empty = { ...suggestion(), status: 'no_suggestion', recommendedTags: [] };
    api.getOrganizeAiSuggestionBatch.mockResolvedValue(ok({ ...batch(), suggestions: [empty] }));
    await mount();
    button('添加标签').click();
    await settle();
    (document.querySelector('.select-trigger') as HTMLElement).click();
    await settle();
    (document.querySelector('[role="option"]') as HTMLElement).click();
    await settle();
    expect(api.acceptOrganizeAiSuggestion).not.toHaveBeenCalled();
    button('取消').click();
    await settle();
    expect(api.acceptOrganizeAiSuggestion).not.toHaveBeenCalled();
    button('添加标签').click();
    await settle();
    (document.querySelector('.select-trigger') as HTMLElement).click();
    await settle();
    (document.querySelector('[role="option"]') as HTMLElement).click();
    await settle();
    api.acceptOrganizeAiSuggestion.mockResolvedValue(
      ok({ ...empty, status: 'accepted', acceptedTags: [{ id: 'tag1', name: '设计' }] }),
    );
    api.getOrganizeAiSuggestionBatch.mockRejectedValue(new Error('offline'));
    button('保存标签').click();
    await settle();
    expect(api.acceptOrganizeAiSuggestion).toHaveBeenCalledWith('b1', 's1', {
      tags: [{ id: 'tag1', name: '设计', source: 'existing' }],
    });
    expect(host.textContent).toContain('已应用');
  });

  it('重新选择类型与最近范围，读取当前资源后才估算；取消重开不保留草稿', async () => {
    api.getOrganizeIssueList.mockResolvedValue(ok({ items: [{ resourceType: 'bookmark', resourceId: 'fresh-b1' }] }));
    await mount();
    button('重新整理').click();
    await settle();
    (
      document.querySelector('.organize-ai-choice-grid.is-resource-type button:last-child') as HTMLButtonElement
    ).click();
    (document.querySelector('.organize-ai-choice-grid.is-scope-grid button:last-child') as HTMLButtonElement).click();
    await settle();
    expect(api.estimateOrganizeAiSuggestions).not.toHaveBeenCalled();
    button('确认整理范围').click();
    await settle();
    expect(api.estimateOrganizeAiSuggestions).toHaveBeenCalledWith({
      resourceType: 'bookmark',
      scope: 'selected',
      resourceIds: ['fresh-b1'],
    });
    expect(api.createOrganizeAiSuggestionBatch).not.toHaveBeenCalled();
    (document.querySelector('.b-drawer-close') as HTMLButtonElement).click();
    await settle();
    button('重新整理').click();
    await settle();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('选择范围');
    expect(document.querySelectorAll('.is-resource-type [aria-pressed="true"]')).toHaveLength(2);
    expect(document.querySelector('.is-scope-grid [aria-pressed="true"]')?.textContent).toContain('当前全部无标签资源');
  });
  it('底栏新增标签先保留草稿，保存失败可继续编辑，不提前创建共享标签', async () => {
    const empty = { ...suggestion(), status: 'no_suggestion', recommendedTags: [] };
    api.getOrganizeAiSuggestionBatch.mockResolvedValue(ok({ ...batch(), suggestions: [empty] }));
    await mount();
    button('添加标签').click();
    await settle();
    (document.querySelector('.select-trigger') as HTMLElement).click();
    await settle();
    expect(document.querySelector('.select-dropdown-footer')?.textContent).toContain('新增标签');
    expect(host.textContent).not.toContain('加载更多标签');
    button('新增标签').click();
    await settle();
    const input = document.querySelector('.suggestion-tag-create .b-input') as HTMLInputElement;
    input.value = '新标签';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    button('确定').click();
    await settle();
    expect(api.acceptOrganizeAiSuggestion).not.toHaveBeenCalled();
    api.acceptOrganizeAiSuggestion.mockRejectedValue(new Error('save failed'));
    button('保存标签').click();
    await settle();
    expect(api.acceptOrganizeAiSuggestion).toHaveBeenCalledWith('b1', 's1', {
      tags: [{ id: null, name: '新标签', source: 'new' }],
    });
    expect(document.querySelector('.b-select')?.textContent).toContain('新标签');
    expect(button('保存标签').disabled).toBe(false);
  });

  it('完整列表可直接搜索后面的标签，同名新增复用已有标签', async () => {
    tagApi.fetchSelectableTags.mockResolvedValue(
      Array.from({ length: 65 }, (_, i) => ({ id: `tag${i}`, name: `标签${i}` })),
    );
    api.getOrganizeAiSuggestionBatch.mockResolvedValue(
      ok({ ...batch(), suggestions: [{ ...suggestion(), status: 'no_suggestion', recommendedTags: [] }] }),
    );
    await mount();
    button('添加标签').click();
    await settle();
    (document.querySelector('.select-trigger') as HTMLElement).click();
    await settle();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(65);
    const search = document.querySelector('.select-search-input') as HTMLInputElement;
    search.value = '标签64';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(tagApi.fetchSelectableTags).toHaveBeenCalledTimes(1);
    button('新增标签').click();
    await settle();
    expect((document.querySelector('.suggestion-tag-create .b-input') as HTMLInputElement).value).toBe('标签64');
    button('确定').click();
    await settle();
    button('保存标签').click();
    await settle();
    expect(api.acceptOrganizeAiSuggestion).toHaveBeenCalledWith('b1', 's1', {
      tags: [{ id: 'tag64', name: '标签64', source: 'existing' }],
    });
  });

  it('新增弹窗可取消，空名称不能确认，已选满时底栏禁止继续新增', async () => {
    await mount();
    button('编辑').click();
    await settle();
    (document.querySelector('.select-trigger') as HTMLElement).click();
    await settle();
    button('新增标签').click();
    await settle();
    expect(button('确定').disabled).toBe(true);
    (document.querySelector('.suggestion-tag-create__actions button') as HTMLButtonElement).click();
    await settle();
    expect(api.acceptOrganizeAiSuggestion).not.toHaveBeenCalled();
    expect(host.querySelector('.b-select')?.textContent).toContain('设计');
    for (const name of ['新一', '新二']) {
      (document.querySelector('.select-trigger') as HTMLElement).click();
      await settle();
      button('新增标签').click();
      await settle();
      const input = document.querySelector('.suggestion-tag-create .b-input') as HTMLInputElement;
      input.value = name;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
      button('确定').click();
      await settle();
    }
    expect(button('新增标签').disabled).toBe(true);
    expect(host.querySelectorAll('.select-tag')).toHaveLength(3);
  });

  it('标签查询失败明确提供重试，不把失败当空标签库', async () => {
    tagApi.fetchSelectableTags.mockRejectedValue(new Error('offline'));
    await mount();
    button('编辑').click();
    await settle();
    expect(host.textContent).toContain('标签加载失败');
    expect(host.querySelector('.suggestion-tag-editor__error button')).toBeTruthy();
    tagApi.fetchSelectableTags.mockResolvedValue([{ id: 'tag1', name: '设计' }]);
    (host.querySelector('.suggestion-tag-editor__error button') as HTMLButtonElement).click();
    await settle();
    expect(host.textContent).not.toContain('标签加载失败');
  });
  it('每次重新整理可改变资源类型，使用新 requestId，不沿用旧资源 ID', async () => {
    api.createOrganizeAiSuggestionBatch.mockImplementation(async (payload) =>
      ok({ ...batch(), id: `new-${payload.resourceType}`, resourceType: payload.resourceType, scopeMode: 'untagged' }),
    );
    await mount();
    for (const index of [1, 0]) {
      button('重新整理').click();
      await settle();
      expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('选择范围');
      (document.querySelectorAll('.is-resource-type button')[index] as HTMLButtonElement).click();
      button('确认整理范围').click();
      await settle();
      button('开始生成 1 项建议').click();
      await settle();
    }
    expect(api.createOrganizeAiSuggestionBatch.mock.calls.map(([value]) => value)).toEqual([
      { requestId: 'test-request-id', groupId: 'test-request-id', resourceType: 'bookmark', scope: 'untagged' },
      { requestId: 'test-request-id-2', groupId: 'test-request-id-2', resourceType: 'note', scope: 'untagged' },
    ]);
  });

  it('估算失败停留在选择范围，可修改后重试', async () => {
    api.estimateOrganizeAiSuggestions.mockRejectedValueOnce(new Error('offline'));
    await mount();
    button('重新整理').click();
    await settle();
    (document.querySelector('.is-resource-type button:last-child') as HTMLButtonElement).click();
    button('确认整理范围').click();
    await settle();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('选择范围');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('offline');
    button('确认整理范围').click();
    await settle();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('确认整理范围');
    expect(api.createOrganizeAiSuggestionBatch).not.toHaveBeenCalled();
  });

  it('双类型部分创建失败在当前流程重试，只重试失败类型并复用 requestId', async () => {
    api.createOrganizeAiSuggestionBatch
      .mockImplementationOnce(async () => ok({ ...batch(), resourceType: 'bookmark' }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(ok({ ...batch(), resourceType: 'note' }));
    await mount();
    button('重新整理').click();
    await settle();
    button('确认整理范围').click();
    await settle();
    button('开始生成 2 项建议').click();
    await settle();
    button('开始生成 2 项建议').click();
    await settle();
    const payloads = api.createOrganizeAiSuggestionBatch.mock.calls.map(([value]) => value);
    expect(payloads).toHaveLength(3);
    expect(payloads[2]).toEqual(payloads[1]);
    expect(payloads[0].resourceType).toBe('bookmark');
    expect(payloads[2].resourceType).toBe('note');
  });
  it('刷新恢复同次整理的 23 项总进度；书签完成后继续轮询笔记并可切换结果', async () => {
    vi.useFakeTimers();
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    const groupId = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
    const bookmark = {
      ...batch(),
      id: 'bookmarks',
      groupId,
      resourceType: 'bookmark',
      progress: { ...batch().progress, total: 3, processed: 3, ready: 3 },
    };
    let note = {
      ...batch(),
      id: 'notes',
      groupId,
      status: 'running',
      progress: { ...batch().progress, total: 20, processed: 10, ready: 4 },
    };
    api.getOrganizeAiSuggestionBatches.mockImplementation(async (params) =>
      ok({ items: params?.groupId ? [bookmark, note] : [bookmark] }),
    );
    api.getOrganizeAiSuggestionBatch.mockImplementation(async (id) => ok(id === 'notes' ? note : bookmark));
    try {
      await mount();
      expect(host.textContent).toContain('本次整理 · 23 项');
      expect(host.querySelector('.organize-ai-batch-meta')?.textContent).toContain('已分析 13/23');
      expect(host.querySelectorAll('.organize-ai-resource-tabs button')).toHaveLength(2);
      note = { ...note, status: 'ready', progress: { ...note.progress, processed: 20, ready: 7 } };
      await vi.advanceTimersByTimeAsync(2500);
      await settle();
      expect(host.querySelector('.organize-ai-batch-meta')?.textContent).toContain('已分析 23/23');
      const requests = api.getOrganizeAiSuggestionBatches.mock.calls.length;
      await vi.advanceTimersByTimeAsync(3000);
      expect(api.getOrganizeAiSuggestionBatches.mock.calls).toHaveLength(requests);
      (host.querySelector('.organize-ai-resource-tabs button:last-child') as HTMLButtonElement).click();
      await settle();
      expect(api.getOrganizeAiSuggestionBatch).toHaveBeenLastCalledWith('notes', expect.any(Object));
      expect(host.textContent).toContain('本次整理 · 23 项');
    } finally {
      app?.unmount();
      app = undefined;
      vi.useRealTimers();
      if (hidden) Object.defineProperty(document, 'hidden', hidden);
      else delete (document as any).hidden;
    }
  });

  it('整组摘要失败保留已知类型并提供重试，历史刷新不会丢失当前组', async () => {
    const groupId = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
    const bookmark = { ...batch(), id: 'bookmarks', groupId, resourceType: 'bookmark' };
    const note = { ...batch(), id: 'notes', groupId };
    let failed = true;
    api.getOrganizeAiSuggestionBatches.mockImplementation(async (params) => {
      if (params?.groupId && failed) throw new Error('offline');
      return ok({ items: [bookmark, note] });
    });
    api.getOrganizeAiSuggestionBatch.mockResolvedValue(ok(bookmark));
    await mount();
    expect(host.querySelector('.organize-ai-inline-error')).toBeTruthy();
    expect(host.querySelectorAll('.organize-ai-resource-tabs button')).toHaveLength(2);
    failed = false;
    (host.querySelector('.organize-ai-inline-error button') as HTMLButtonElement).click();
    await settle();
    expect(host.querySelector('.organize-ai-inline-error')).toBeNull();
    api.getOrganizeAiSuggestionBatches.mockResolvedValue(ok({ items: [] }));
    button('历史记录').click();
    await settle();
    (document.querySelector('.organize-ai-batches .organize-ai-section-heading button') as HTMLButtonElement).click();
    await settle();
    expect(api.getOrganizeAiSuggestionBatches).toHaveBeenLastCalledWith({ cursor: null, limit: 12 });
    expect(host.querySelectorAll('.organize-ai-resource-tabs button')).toHaveLength(2);
  });

  it('等待、分析中和失败不能伪装成没有合适建议；不同组不累加', async () => {
    const queued = {
      ...batch(),
      groupId: 'group-1',
      suggestions: ['queued', 'running', 'failed'].map((status, index) => ({
        ...suggestion(),
        id: `s${index}`,
        status,
        recommendedTags: [],
      })),
    };
    api.getOrganizeAiSuggestionBatches.mockResolvedValue(
      ok({ items: [queued, { ...batch(), id: 'other', groupId: 'group-2' }] }),
    );
    api.getOrganizeAiSuggestionBatch.mockResolvedValue(ok(queued));
    await mount();
    expect(host.textContent).toContain('本次整理 · 1 项');
    expect(host.textContent).toContain('等待分析');
    expect(host.textContent).toContain('正在分析');
    expect(host.textContent).toContain('分析失败');
    expect(host.textContent).not.toContain('没有合适建议');
  });

  it('多类型创建共享关联标识，部分失败重试仍属于同一次整理', async () => {
    api.createOrganizeAiSuggestionBatch
      .mockImplementationOnce(async (payload) =>
        ok({ ...batch(), id: 'new-bookmark', resourceType: 'bookmark', groupId: payload.groupId }),
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (payload) =>
        ok({ ...batch(), id: 'new-note', resourceType: 'note', groupId: payload.groupId }),
      );
    await mount();
    button('重新整理').click();
    await settle();
    button('确认整理范围').click();
    await settle();
    button('开始生成 2 项建议').click();
    await settle();
    button('开始生成 2 项建议').click();
    await settle();
    const payloads = api.createOrganizeAiSuggestionBatch.mock.calls.map(([value]) => value);
    expect(new Set(payloads.map((p) => p.groupId)).size).toBe(1);
    expect(payloads[1].requestId).not.toBe(payloads[0].requestId);
    expect(payloads[2]).toEqual(payloads[1]);
    expect(host.textContent).toContain('本次整理 · 2 项');
    expect(host.querySelectorAll('.organize-ai-resource-tabs button')).toHaveLength(2);
  });
});
