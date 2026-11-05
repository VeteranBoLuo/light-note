import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({ post: vi.fn(), stored: vi.fn() }));
vi.mock('../api', () => ({
  extensionPost: mocks.post,
  isExtensionAuthError: () => false,
  ExtensionApiError: class extends Error {},
}));
vi.mock('../storage', () => ({
  getBookmarkDraft: mocks.stored,
  saveBookmarkDraft: async () => {},
  clearBookmarkDraft: async () => {},
}));
vi.mock('../capture', () => ({
  prepareCurrentPageTextCapture: async () => null,
  captureCurrentPageText: async () => null,
  captureTriggeredPage: async () => ({ url: 'https://example.com/', title: '当前页面', selection: '' }),
  captureCurrentTabAddress: async () => ({ url: 'https://example.com/', title: '当前页面' }),
}));
import BookmarkCapture from './BookmarkCapture.vue';

let app: App | undefined;
let host: HTMLDivElement;
beforeEach(() => {
  mocks.post.mockReset();
  mocks.stored.mockResolvedValue({
    sessionId: 'test',
    mode: 'formal',
    url: 'https://example.com/',
    name: '手写名称',
    description: '手写说明',
    selectedTagIds: ['manual'],
    selectedNewTags: [],
  });
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
});

it.each([
  { name: '', description: '', matchedTagIds: [], newTags: [] },
  { name: ' ', description: '\n', matchedTagIds: [], newTags: [] },
])('扩展收到空识别结果时保留草稿，不清除标签、不标记 AI 生成或采纳：%j', async (fields) => {
  const filled = vi.fn();
  let resultFields = fields;
  mocks.post.mockImplementation(async (url) => {
    if (url === '/api/bookmark/queryTagList') return [{ id: 'manual', name: '手动标签' }];
    if (url === '/api/ai/skills/execute')
      return {
        protocolVersion: 1,
        requestId: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
        skillId: 'bookmark.parse_url',
        skillVersion: 1,
        status: 'preview_ready',
        result: { kind: 'field_suggestions', fields: resultFields },
        sources: [],
        coverage: null,
        availableActions: [],
        receipt: null,
        error: null,
      };
    throw new Error('Unexpected fixture request');
  });
  const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } });
  app = createApp(BookmarkCapture, {
    authenticated: true,
    draftSessionId: 'test',
    aiAdoption: {
      setUrl: vi.fn(),
      begin: () => ({ current: () => true, filled }),
      selectNewTag: vi.fn(),
      prepareSave: () => () => {},
      reset: vi.fn(),
      setOwner: vi.fn(),
    },
  });
  app.component('svg-icon', { render: () => null });
  app.use(createPinia()).use(i18n).mount(host);
  await vi.waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/api/bookmark/queryTagList', expect.any(Object)));
  await nextTick();
  const button = [...host.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(i18n.global.t('browserExtension.bookmark.aiGenerate')),
  );
  expect(button).toBeDefined();
  button!.click();
  await vi.waitFor(() => expect(host.textContent).toContain(i18n.global.t('browserExtension.bookmark.aiFailed')));
  expect([...host.querySelectorAll('input')].map((input) => input.value)).toContain('手写名称');
  expect(host.querySelector('textarea')?.value).toBe('手写说明');
  expect(host.textContent).toContain('手动标签');
  expect(filled).not.toHaveBeenCalled();
  expect(button!.textContent).toContain(i18n.global.t('browserExtension.bookmark.aiGenerate'));

  resultFields = { name: '有效名称', description: '有效说明', matchedTagIds: ['manual'], newTags: [] };
  button!.click();
  await vi.waitFor(() => expect(filled).toHaveBeenCalledOnce());
  expect(host.querySelector('textarea')?.value).toBe('有效说明');
  expect(button!.textContent).toContain(i18n.global.t('browserExtension.bookmark.aiRegenerate'));
});
