import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import Discussion from './CommunityPostDiscussion.vue';
const mocks = vi.hoisted(() => ({ get: vi.fn(), query: { comment: 'target' } }));
vi.mock('@/api/communityFeedApi', () => ({ feedGet: mocks.get, feedOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: vi.fn() } }));
vi.mock('@/utils/mobileOverlayHistory', () => ({ closeCurrentMobileOverlayThen: vi.fn() }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'viewer' }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: mocks.query }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('./CommunitySavePost.vue', () => ({ default: { template: '<div />' } }));
vi.mock('./CommunityPostCard.vue', () => ({ default: { template: '<div />' } }));
vi.mock('./CommunityPostOutline.vue', () => ({ default: { template: '<div />' } }));
vi.mock('./CommunityCommentComposer.vue', () => ({ default: { template: '<div />' } }));
vi.mock('./CommunityContentMenu.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/communityChat/ChatInlineEmojiText.vue', () => ({
  default: { props: ['content'], template: '<span>{{content}}</span>' },
}));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/base/BasicComponents/BVirtualList.vue', () => ({
  default: {
    props: ['items'],
    methods: { scrollToIndex() {} },
    template: '<div><slot v-for="item in items" :item="item" /></div>',
  },
}));
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  delete (HTMLElement.prototype as any).scrollIntoView;
});
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  mocks.get.mockReset();
});
const comment = (id: string) => ({
  publicId: id,
  body: id,
  status: 'published',
  replyCount: 0,
  author: { name: id },
  revision: 1,
});
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(Discussion, {
    post: { publicId: 'post', topics: [], commentCount: 2 } as any,
    canWrite: false,
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  for (let i = 0; i < 30; i++) await nextTick();
  return host;
}
it('keeps earlier comments when the notification target is already in the first page', async () => {
  mocks.get.mockResolvedValue({ items: [comment('earlier'), comment('target')], nextCursor: null });
  const host = await mount();
  expect(host.querySelectorAll('.feed-comment')).toHaveLength(2);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});
it('appends pages to find a later target without replacing the first page', async () => {
  mocks.get.mockImplementation(async (path, params) =>
    path === 'comments/context'
      ? { root: null }
      : params.before
        ? { items: [comment('target')], nextCursor: null }
        : { items: [comment('earlier')], nextCursor: '1' },
  );
  const host = await mount();
  expect(Array.from(host.querySelectorAll('.feed-body')).map((x) => x.textContent)).toEqual(['earlier', 'target']);
});
it('keeps prior replies while locating a child comment', async () => {
  mocks.get.mockImplementation(async (path, params) => {
    if (path === 'comments/context') return { root: 'root' };
    if (!params.root) return { items: [{ ...comment('root'), replyCount: 2 }], nextCursor: null };
    return params.before
      ? { items: [comment('target')], nextCursor: null }
      : { items: [comment('earlier-reply')], nextCursor: '2' };
  });
  const host = await mount();
  expect(Array.from(host.querySelectorAll('.feed-body')).map((x) => x.textContent)).toEqual([
    'root',
    'earlier-reply',
    'target',
  ]);
});
it('retains the list if the target is no longer accessible', async () => {
  mocks.get.mockImplementation(async (path) => {
    if (path === 'comments/context') throw new Error('unavailable');
    return { items: [comment('earlier')], nextCursor: null };
  });
  const host = await mount();
  expect(host.querySelectorAll('.feed-comment')).toHaveLength(1);
  expect(host.textContent).toContain('community.feed.commentUnavailable');
});
