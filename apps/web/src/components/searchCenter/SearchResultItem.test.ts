import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import SearchResultItem from './SearchResultItem.vue';
import type { DisplaySearchItem, ResourceView } from './searchUtils.ts';

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
});
