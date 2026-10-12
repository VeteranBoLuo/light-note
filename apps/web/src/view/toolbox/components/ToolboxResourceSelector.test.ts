import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { fetchGlobalSearch } from '@/api/search';
import zhCN from '@/i18n/locales/zh-CN';
import type { ToolboxSelectedResource } from '@/utils/toolboxResourceSelection';
import ToolboxResourceSelector from './ToolboxResourceSelector.vue';

vi.mock('@/api/search', () => ({ fetchGlobalSearch: vi.fn() }));
vi.mock('@/api/noteTree', () => ({ fetchNoteBranchItems: vi.fn() }));

const materials: ToolboxSelectedResource[] = [
  { type: 'note', id: 'n1', title: '课程笔记' },
  { type: 'bookmark', id: 'b1', title: '课程官网' },
  { type: 'file', id: 'f1', title: '课程目录.PDF' },
  { type: 'file', id: 'f2', title: '课程附件.zip' },
];
let cleanup: (() => void) | undefined;

beforeEach(() => {
  vi.mocked(fetchGlobalSearch).mockReset();
  vi.mocked(fetchGlobalSearch).mockImplementation(async (_keyword, _limit, _track, options) => {
    const items = materials.filter((item) => !options?.types || options.types.includes(item.type));
    return { items, total: items.length, hasMore: false } as any;
  });
});
afterEach(() => cleanup?.());

async function mountSelector(overrides: Record<string, unknown> = {}) {
  const selected = ref<ToolboxSelectedResource[]>([]);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(ToolboxResourceSelector, {
        max: 20,
        pageScroll: false,
        expandNoteBranches: false,
        fileExtensions: ['pdf'],
        ...overrides,
        modelValue: selected.value,
        'onUpdate:modelValue': (value: ToolboxSelectedResource[]) => (selected.value = value),
      }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('auto-scrollbar', {});
  app.component('svg-icon', { render: () => h('span') });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await vi.waitFor(() => expect(host.querySelector('.resource-picker-panel__item')).not.toBeNull());
  const row = (title: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('.resource-picker-panel__item')].find((item) =>
      item.textContent?.includes(title),
    )!;
  const click = async (title: string) => {
    row(title).click();
    await nextTick();
  };
  return { host, selected, row, click };
}

describe('ToolboxResourceSelector 资料支持范围', () => {
  it('文件扩展名限制不拦截笔记与书签，支持逐项选择和取消', async () => {
    const { host, selected, row, click } = await mountSelector();
    expect(host.querySelector('input')?.placeholder).toBe('搜索笔记、书签或文件');
    expect(host.textContent).toContain(zhCN.toolbox.project.selectResourcesHint);
    for (const item of materials.slice(0, 3)) {
      await click(item.title);
      expect(row(item.title).getAttribute('aria-selected')).toBe('true');
    }
    expect(selected.value.map((item) => item.type)).toEqual(['note', 'bookmark', 'file']);
    await click('课程附件.zip');
    expect(selected.value).toHaveLength(3);
    await click('课程官网');
    expect(selected.value.map((item) => item.type)).toEqual(['note', 'file']);
    expect(row('课程官网').getAttribute('aria-selected')).toBe('false');
  });

  it('批量加入接受混合资料且跳过已有资料和不支持的文件', async () => {
    const { host, selected } = await mountSelector({ existingResourceKeys: ['note:n1'], externalCount: 1 });
    host.querySelector<HTMLButtonElement>('.resource-picker-panel__batch button')!.click();
    await nextTick();
    expect(selected.value.map((item) => item.id)).toEqual(['b1', 'f1']);
    host.querySelector<HTMLButtonElement>('.resource-picker-panel__batch button')!.click();
    await nextTick();
    expect(selected.value.map((item) => item.id)).toEqual(['b1', 'f1']);
  });

  it('达到上限仍能取消已选资料并继续选择其他类型', async () => {
    const { host, selected, row, click } = await mountSelector({ max: 2 });
    host.querySelector<HTMLButtonElement>('.resource-picker-panel__batch button')!.click();
    await nextTick();
    expect(selected.value.map((item) => item.id)).toEqual(['n1', 'b1']);
    expect(row('课程目录.PDF').disabled).toBe(true);
    await click('课程笔记');
    expect(row('课程目录.PDF').disabled).toBe(false);
    await click('课程目录.PDF');
    expect(selected.value.map((item) => item.id)).toEqual(['b1', 'f1']);
  });

  it('文件专用工具保留专用提示；未设置扩展名限制的工具仍支持全部文件', async () => {
    const { host, click, selected } = await mountSelector({ allowedTypes: ['file'] });
    expect(host.querySelector('input')?.placeholder).toBe(zhCN.toolbox.workbench.ocrSearchPlaceholder);
    expect(host.textContent).toContain(zhCN.toolbox.workbench.ocrSelectHint);
    expect(host.querySelectorAll('.resource-picker-panel__item')).toHaveLength(2);
    await click('课程目录.PDF');
    await click('课程附件.zip');
    expect(selected.value.map((item) => item.id)).toEqual(['f1']);
    cleanup?.();
    const unfiltered = await mountSelector({ fileExtensions: undefined });
    await unfiltered.click('课程附件.zip');
    await unfiltered.click('课程笔记');
    expect(unfiltered.selected.value.map((item) => item.id)).toEqual(['f2', 'n1']);
  });
});
