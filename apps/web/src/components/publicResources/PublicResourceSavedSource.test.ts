import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { publicResourcesZh } from '@/i18n/locales/publicResources';
const mocks = vi.hoisted(() => ({ scope: {} as any, get: vi.fn(), push: vi.fn() }));
vi.mock('@/store/publicResourceScope', () => ({ usePublicResourceScope: () => mocks.scope }));
vi.mock('@/api/publicResources', () => ({ publicGet: (...args: any[]) => mocks.get(...args) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
import PublicResourceSavedSource from './PublicResourceSavedSource.vue';
let app: ReturnType<typeof createApp>, host: HTMLElement;
const id = ref('copy');
const source = {
  authorName: '公开作者',
  authorPublicId: 'public-identity',
  url: 'https://boluo66.top/public-resources/10000000-0000-4000-8000-000000000001',
  revision: 1,
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick();
};
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(PublicResourceSavedSource, { resourceId: id.value }) });
  app.use(
    createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { publicResources: publicResourcesZh } } }),
  );
  app.mount(host);
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  id.value = 'copy';
  mocks.scope = reactive({ identity: 'one', eligible: true });
  mocks.get.mockResolvedValue({ source });
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});
it('单独展示作者与原公开链接，导航到公开条目；不将其当作书签目标网址', async () => {
  await mount();
  expect(host.textContent).toContain('公开作者');
  expect(mocks.get).toHaveBeenCalledWith('saved-source', { kind: 'bookmark', resourceId: 'copy' });
  host.querySelector('button')!.click();
  expect(mocks.push).toHaveBeenCalledWith('/public-resources/10000000-0000-4000-8000-000000000001');
});
it('没有来源或能力缺失时不阻断个人资源页面，切号即时清空来源', async () => {
  await mount();
  mocks.scope.identity = 'other';
  mocks.scope.eligible = false;
  await flush();
  expect(host.textContent).toBe('');
  mocks.scope.eligible = true;
  mocks.get.mockRejectedValueOnce(new Error('not installed'));
  id.value = 'ordinary';
  await flush();
  expect(host.textContent).toBe('');
});
it('资源切换后迟到的来源不能覆盖当前资源', async () => {
  let finish!: (value: any) => void;
  mocks.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  id.value = 'next';
  mocks.get.mockResolvedValueOnce({ source: null });
  await flush();
  finish({ source });
  await flush();
  expect(host.textContent).toBe('');
});
