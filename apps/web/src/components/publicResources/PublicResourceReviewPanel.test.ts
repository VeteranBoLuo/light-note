import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import { publicResourcesZh } from '@/i18n/locales/publicResources';
vi.mock('@/api/publicResources', () => ({ publicGet: vi.fn() }));
import Panel from './PublicResourceReviewPanel.vue';
let app: ReturnType<typeof createApp>, host: HTMLElement;
afterEach(() => {
  app?.unmount();
  host?.remove();
});
it('已公开队列阅读当前公开版；待审队列阅读最新提交，举报始终阅读证据版本', async () => {
  const state = reactive<any>({ publishedView: true, report: null });
  const detail: any = {
    publicId: 'public-id',
    kind: 'note',
    version: 4,
    latestRevision: 2,
    publishedRevision: 1,
    authorName: '作者',
    removed: false,
    withdrawn: false,
    hasPending: true,
    reason: '',
    actions: [],
    revisions: [
      { revision: 1, title: '公开标题', body: '当前公开正文' },
      { revision: 2, title: '更新标题', body: '尚未公开的更新正文' },
    ],
  };
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(Panel, { detail, ...state }) });
  app.use(
    createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { publicResources: publicResourcesZh } } }),
  );
  app.component('svg-icon', { render: () => h('span') });
  app.mount(host);
  await nextTick();
  expect(host.querySelector('article')?.textContent).toContain('当前公开正文');
  expect(host.querySelector('.review-version')?.textContent).toContain('V1');
  expect(host.textContent).not.toContain('尚未公开的更新正文');
  expect([...host.querySelectorAll('button')].some((b) => b.textContent?.trim() === publicResourcesZh.approve)).toBe(
    false,
  );
  state.publishedView = false;
  await nextTick();
  expect(host.querySelector('article')?.textContent).toContain('尚未公开的更新正文');
  expect(host.querySelector('.review-version')?.textContent).toContain('V2');
  expect([...host.querySelectorAll('button')].some((b) => b.textContent?.trim() === publicResourcesZh.approve)).toBe(
    true,
  );
  state.report = {
    status: 'pending',
    reason: '举报原因',
    evidence: { revision: 1, title: '证据标题', body: '举报时的正文' },
  };
  await nextTick();
  expect(host.querySelector('article')?.textContent).toContain('举报时的正文');
  expect(host.querySelector('.review-version')?.textContent).toContain('V1');
});
