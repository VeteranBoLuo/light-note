import { beforeEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import Showcase from './CommunityProfileShowcase.vue';
const mocks = vi.hoisted(() => ({ get: vi.fn(), operation: vi.fn(), write: vi.fn() }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'a', role: 'user' }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: ref('zh-CN') }) }));
vi.mock('@/api/communityFeedApi', () => ({ feedGet: mocks.get, feedOperation: mocks.operation }));
vi.mock('@/components/base/BasicComponents/BVirtualList.vue', () => ({
  default: { props: ['items'], template: '<div><slot v-for="item in items" :item="item" /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { template: '<button><slot /></button>' },
}));
const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick();
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(async (path: string) => {
    if (path.includes('capabilities')) return { feedEnabled: true, writesEnabled: true };
    if (path === 'topics') return ['one', 'two', 'three', 'four'].map((slug) => ({ slug, nameZh: slug }));
    if (path === 'own/posts')
      return { items: [{ publicId: 'post', status: 'published', title: 'Example', body: 'Body' }], nextCursor: null };
    return { revision: 2, interests: [], featuredPosts: [] };
  });
  mocks.operation.mockReturnValue(mocks.write);
  mocks.write.mockResolvedValue({ revision: 3 });
});
it('saves featured posts without overwriting stored interests', async () => {
  const host = document.createElement('div'),
    app = createApp(Showcase);
  app.directive('auto-scrollbar', {});
  app.mount(host);
  await flush();
  host.querySelector<HTMLButtonElement>('.featured-choices button')!.click();
  host.querySelector<HTMLButtonElement>('header button')!.click();
  await flush();
  expect(mocks.operation).toHaveBeenCalledWith(
    'profiles/options/me',
    { expectedRevision: 2, featuredPosts: ['post'] },
    'put',
  );
  expect(host.querySelector('[role=status]')).not.toBeNull();
  app.unmount();
});
it('retains selections and reuses the same operation when retrying a failed save', async () => {
  mocks.write.mockRejectedValueOnce(new Error('offline'));
  const host = document.createElement('div'),
    app = createApp(Showcase);
  app.directive('auto-scrollbar', {});
  app.mount(host);
  await flush();
  host.querySelector<HTMLButtonElement>('.featured-choices button')!.click();
  host.querySelector<HTMLButtonElement>('header button')!.click();
  await flush();
  expect(host.querySelector('[aria-pressed=true]')).not.toBeNull();
  host.querySelector<HTMLButtonElement>('header button')!.click();
  await flush();
  expect(mocks.operation).toHaveBeenCalledTimes(1);
  expect(mocks.write).toHaveBeenCalledTimes(2);
  app.unmount();
});
