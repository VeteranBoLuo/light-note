import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import SearchResultItem from './SearchResultItem.vue';
import type { DisplaySearchItem, ResourceView } from './searchUtils.ts';

const itemSource = readFileSync(resolve(process.cwd(), 'src/components/searchCenter/SearchResultItem.vue'), 'utf8');
const centerSource = readFileSync(resolve(process.cwd(), 'src/view/search/SearchCenter.vue'), 'utf8');

let cleanup: (() => void) | undefined;

const item: DisplaySearchItem = {
  id: 'note-1',
  type: 'note',
  title: '测试笔记',
  description: '用于验证批量选择行为',
  raw: {},
  originalIndex: 0,
  updatedAtMs: 0,
  updatedAtText: '',
  tagNames: [],
  domain: '',
  fileMeta: '',
  searchScore: 0,
};

async function mountItem(view: ResourceView, selectable: boolean) {
  const onOpen = vi.fn();
  const onToggleSelect = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(SearchResultItem, {
        item,
        typeLabel: '笔记',
        keyword: '',
        view,
        selectable,
        onOpen,
        onToggleSelect,
      }),
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          tagManage: { relatedTag: '关联标签' },
          tagGraph: { panel: { updateTime: '更新时间' } },
        },
      },
    }),
  );
  app.mount(host);
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onOpen, onToggleSelect };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('SearchResultItem', () => {
  it.each([
    ['card', '.result-click-area'],
    ['list', '.result-row'],
  ] as const)('批量态点击 %s 正文只切换选择，不打开资源', async (view, selector) => {
    const { host, onOpen, onToggleSelect } = await mountItem(view, true);

    host.querySelector<HTMLButtonElement>(selector)?.click();
    await nextTick();

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it.each([
    ['card', '.result-click-area'],
    ['list', '.result-row'],
  ] as const)('普通态点击 %s 正文仍打开资源', async (view, selector) => {
    const { host, onOpen, onToggleSelect } = await mountItem(view, false);

    host.querySelector<HTMLButtonElement>(selector)?.click();
    await nextTick();

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('列表悬停、当前检查项和已选项使用三种不同视觉层级', () => {
    expect(itemSource).toMatch(
      /\.result-item--list:hover\s*\{[\s\S]*?border-color:\s*var\(--surface-border-color,[\s\S]*?background:\s*var\(--search-muted-bg,[\s\S]*?box-shadow:\s*none;/u,
    );
    expect(itemSource).toMatch(
      /\.result-item--list\.result-item--selected:hover\s*\{[\s\S]*?border-color:\s*var\(--primary-color\);[\s\S]*?box-shadow:\s*0 0 0 1px/u,
    );
    expect(centerSource).toMatch(
      /\.resource-result-entry\.is-inspected :deep\(\.result-item\)\s*\{[\s\S]*?border-left:\s*3px solid var\(--primary-color\);[\s\S]*?background:\s*var\(--search-muted-bg\);[\s\S]*?box-shadow:\s*none;/u,
    );
    expect(centerSource).toContain('.resource-result-entry.is-inspected :deep(.result-item.result-item--selected)');
  });
});
