import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(() => Promise.resolve()),
  recordOperation: vi.fn(),
  loadGrowth: vi.fn(),
  markAnnouncementSeen: vi.fn(() => Promise.resolve({ status: 200 })),
}));

const user = { id: 'user-1', role: 'user', preferences: {}, adminContext: null, visitorWorkspace: null };
const bookmark = { isMobile: false, isFold: false, openAuthModal: vi.fn() };
const inbox = { openQuickCapture: vi.fn() };

vi.mock('@/store', () => ({
  bookmarkStore: () => bookmark,
  inboxStore: () => inbox,
  useUserStore: () => user,
}));
vi.mock('@/router', () => ({ default: { push: mocks.routerPush } }));
const route = { name: 'home', path: '/home' };
vi.mock('vue-router', () => ({ useRoute: () => route }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: mocks.recordOperation }));
vi.mock('@/api/userApi.ts', () => ({
  default: { markFeatureAnnouncementSeen: mocks.markAnnouncementSeen },
}));
vi.mock('@/composables/useGrowth.ts', () => ({
  useGrowth: () => ({ growth: ref(null), load: mocks.loadGrowth }),
}));
vi.mock('@/config/growthFrames', () => ({ frameVariant: () => null }));
vi.mock('@/utils/preferences.ts', () => ({ isMobileHomeRoute: () => false }));
vi.mock('@/utils/common.ts', () => ({ getLogDeviceId: () => 'guest-device-1' }));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: () => false }));
vi.mock('@/components/search/GlobalSearch.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/support/CampaignEntry.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/view/personCenter/PersonCenter.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/notification/NotificationBell.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/growth/AvatarFramePreview.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<i />' } }));
vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({ default: { template: '<span><slot /></span>' } }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { inheritAttrs: false, template: '<button v-bind="$attrs"><slot /></button>' },
}));
vi.mock('@/components/base/BasicComponents/BDropdown.vue', () => ({
  default: {
    props: ['menuOptions'],
    methods: {
      select(item: { function?: () => void }) {
        item.function?.();
      },
    },
    template:
      '<div><slot /><button v-for="(item, index) in menuOptions" :key="index" class="test-menu-item" :data-label="item.label" @click="select(item)"><span v-if="item.unread" class="test-menu-dot" /></button></div>',
  },
}));

const { default: RightArea } = await import('./RightArea.vue');

let cleanup: (() => void) | undefined;

async function mountRightArea() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(RightArea);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
  localStorage.clear();
  user.id = 'user-1';
  user.role = 'user';
  user.preferences = {};
  route.path = '/home';
  bookmark.isMobile = false;
  mocks.routerPush.mockClear();
  mocks.markAnnouncementSeen.mockReset().mockResolvedValue({ status: 200 });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});

describe('知识工坊常规入口', () => {
  it.each(['user', 'visitor'])('%s 打开、访问和刷新后均无上新红点，也不再写入已读', async (role) => {
    user.role = role;
    user.id = role === 'visitor' ? '' : 'user-1';
    const host = await mountRightArea();
    expect(host.querySelector('.more-menu-trigger')?.getAttribute('aria-label')).toBe(zhCN.navigation.moreEntries);
    expect(host.querySelector('.more-menu-trigger__unread-dot')).toBeNull();
    expect(host.querySelector('.test-menu-dot')).toBeNull();
    host.querySelector<HTMLElement>('.more-menu-trigger')?.click();
    expect(host.querySelector('[data-label="知识工坊"]')).toBeNull();
    host.querySelector<HTMLElement>('.workshop-entry-btn')?.click();
    await nextTick();
    expect(mocks.routerPush).toHaveBeenCalledWith('/toolbox');
    expect(mocks.markAnnouncementSeen).not.toHaveBeenCalled();
    expect(user.preferences).toEqual({});
    expect(localStorage.length).toBe(0);
    cleanup?.();
    cleanup = undefined;
    const remounted = await mountRightArea();
    expect(remounted.querySelector('.more-menu-trigger__unread-dot')).toBeNull();
    expect(remounted.querySelector('.test-menu-dot')).toBeNull();
  });
  it.each(['/toolbox', '/toolbox/forms/sample', '/toolbox/research_workspace'])('工坊路由 %s 标记当前入口', async (path) => {
    route.path = path;
    const host = await mountRightArea();
    expect(host.querySelector('.workshop-entry-btn')?.getAttribute('aria-current')).toBe('page');
  });
  it('其他页面不选中，移动端不增加桌面入口', async () => {
    const host = await mountRightArea();
    expect(host.querySelector('.workshop-entry-btn')?.hasAttribute('aria-current')).toBe(false);
    cleanup?.();
    bookmark.isMobile = true;
    const mobile = await mountRightArea();
    expect(mobile.querySelector('.workshop-entry-btn')).toBeNull();
  });
});
