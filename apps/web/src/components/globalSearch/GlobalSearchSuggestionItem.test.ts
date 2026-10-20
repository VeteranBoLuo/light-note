import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import GlobalSearchSuggestionItem from './GlobalSearchSuggestionItem.vue';
import type { SearchResultItem } from '@/api/search';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

async function mountResult(type: SearchResultItem['type'] = 'file') {
  const item: SearchResultItem = { id: '42', type, title: '项目报告.pdf', description: '虚构资料' };
  const onOpen = vi.fn();
  const onLocate = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(GlobalSearchSuggestionItem, { item, keyword: '项目', onOpen, onLocate }) });
  app.component('svg-icon', { template: '<span data-fallback-icon />' });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          resourceCenter: { locateFile: '在云空间定位', types: { file: '文件', note: '笔记' } },
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
  return { host, item, onOpen, onLocate };
}

it('移动文件标题与定位按钮是独立操作，定位含目标名称和真实图标', async () => {
  const { host, item, onOpen, onLocate } = await mountResult();
  const locate = host.querySelector<HTMLButtonElement>('.gs-suggestion__locate')!;
  expect(locate.getAttribute('aria-label')).toContain(item.title);
  expect(locate.querySelector('.icon-base64')?.getAttribute('style')).toContain('data:image/svg+xml;base64,');
  expect(locate.querySelector('[data-fallback-icon]')).toBeNull();
  expect(host.querySelector('button button')).toBeNull();
  locate.click();
  await nextTick();
  expect(onLocate).toHaveBeenCalledExactlyOnceWith(item);
  expect(onOpen).not.toHaveBeenCalled();
  host.querySelector<HTMLButtonElement>('.gs-suggestion')!.click();
  await nextTick();
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(item);
  expect(onLocate).toHaveBeenCalledTimes(1);
});

it('其他类型保留打开动作，不出现文件定位按钮', async () => {
  const { host, item, onOpen, onLocate } = await mountResult('note');
  expect(host.querySelector('.gs-suggestion__locate')).toBeNull();
  host.querySelector<HTMLButtonElement>('.gs-suggestion')!.click();
  await nextTick();
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(item);
  expect(onLocate).not.toHaveBeenCalled();
});
