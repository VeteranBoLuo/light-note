import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import {
  featureAnnouncementSeenVersion,
  featureAnnouncementStorageKey,
  KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID,
} from '@/utils/featureAnnouncements';

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
vi.mock('vue-router', () => ({ useRoute: () => ({ name: 'home' }) }));
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
  mocks.routerPush.mockClear();
  mocks.markAnnouncementSeen.mockReset().mockResolvedValue({ status: 200 });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});

describe('更多菜单的知识工坊上新提示', () => {
  it('打开菜单或点击其他入口不会消除，只有点击知识工坊才同时清除两处红点', async () => {
    const host = await mountRightArea();
    expect(host.querySelector('.more-menu-trigger__unread-dot')).not.toBeNull();
    expect(host.querySelector('.test-menu-dot')).not.toBeNull();

    host.querySelector<HTMLElement>('.more-menu-trigger')?.click();
    host.querySelector<HTMLElement>('[data-label="官网"]')?.click();
    await nextTick();
    expect(host.querySelector('.more-menu-trigger__unread-dot')).not.toBeNull();
    expect(host.querySelector('.test-menu-dot')).not.toBeNull();

    host.querySelector<HTMLElement>('[data-label="知识工坊"]')?.click();
    await nextTick();
    expect(host.querySelector('.more-menu-trigger__unread-dot')).toBeNull();
    expect(host.querySelector('.test-menu-dot')).toBeNull();
    expect(featureAnnouncementSeenVersion(user.preferences, KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID)).toBe(
      'knowledge-workshop-v1',
    );
    expect(mocks.markAnnouncementSeen).toHaveBeenCalledWith({
      announcementId: 'knowledge-workshop',
      version: 'knowledge-workshop-v1',
    });
    expect(mocks.routerPush).toHaveBeenCalledWith('/toolbox');
  });

  it('清空浏览器存储后仍按账号服务端偏好保持已读', async () => {
    const host = await mountRightArea();
    host.querySelector<HTMLElement>('[data-label="知识工坊"]')?.click();
    await nextTick();
    cleanup?.();
    cleanup = undefined;
    localStorage.clear();

    const remounted = await mountRightArea();
    expect(remounted.querySelector('.more-menu-trigger__unread-dot')).toBeNull();
    expect(remounted.querySelector('.test-menu-dot')).toBeNull();
  });

  it('服务端已读回写失败时，本机刷新后也不会恢复红点', async () => {
    mocks.markAnnouncementSeen.mockRejectedValueOnce(new Error('network unavailable'));
    const host = await mountRightArea();
    host.querySelector<HTMLElement>('[data-label="知识工坊"]')?.click();
    await nextTick();
    await Promise.resolve();

    expect(
      localStorage.getItem(featureAnnouncementStorageKey(KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID, 'guest-device-1')),
    ).toBe('knowledge-workshop-v1');

    cleanup?.();
    cleanup = undefined;
    user.preferences = {};
    const remounted = await mountRightArea();
    expect(remounted.querySelector('.more-menu-trigger__unread-dot')).toBeNull();
    expect(remounted.querySelector('.test-menu-dot')).toBeNull();
  });

  it('游客只在当前浏览器本地记录已读，不调用账号接口', async () => {
    user.id = '';
    user.role = 'visitor';
    const host = await mountRightArea();

    host.querySelector<HTMLElement>('[data-label="知识工坊"]')?.click();
    await nextTick();

    expect(host.querySelector('.more-menu-trigger__unread-dot')).toBeNull();
    expect(mocks.markAnnouncementSeen).not.toHaveBeenCalled();
    expect(
      localStorage.getItem(featureAnnouncementStorageKey(KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID, 'guest-device-1')),
    ).toBe('knowledge-workshop-v1');
  });

  it('绝对失效时间后新老账号都不展示红点', async () => {
    vi.setSystemTime(new Date('2026-09-14T16:00:00.000Z'));
    const host = await mountRightArea();

    expect(host.querySelector('.more-menu-trigger__unread-dot')).toBeNull();
    expect(host.querySelector('.test-menu-dot')).toBeNull();
  });
});
