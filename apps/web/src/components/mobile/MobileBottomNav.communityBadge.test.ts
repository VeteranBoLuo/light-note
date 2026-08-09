import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const communityUnreadTotal = ref(0);
const refreshCommunityUnread = vi.fn(async () => null);
const resetCommunityUnread = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'workbenches', query: {}, meta: { mobileShell: 'today' }, fullPath: '/workbenches' }),
  useRouter: () => ({ replace: vi.fn(), resolve: (target: unknown) => ({ fullPath: String(target) }) }),
}));
vi.mock('@/store', () => ({
  inboxStore: () => ({
    todoAttentionTotal: 0,
    todoOverdueTotal: 0,
    todoDueTodayTotal: 0,
    refreshCount: vi.fn(),
  }),
  useAiAssistantStore: () => ({ edgeStatus: ref('idle') }),
  useUserStore: () => ({ id: 'user-1', role: 'user' }),
}));
vi.mock('@/composables/useMobileNavigationState', () => ({
  getMobileResourceEntryPath: () => '/home',
  useMobileNavigationState: () => ({ saveResourceScroll: vi.fn(), scrollCurrentResourceToTop: vi.fn() }),
}));
vi.mock('@/composables/useCommunityChatUnread', () => ({
  useCommunityChatUnread: () => ({
    totalUnread: communityUnreadTotal,
    refresh: refreshCommunityUnread,
    reset: resetCommunityUnread,
  }),
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { name: 'BButtonStub', template: '<button><slot /></button>' },
}));

const { default: MobileBottomNav } = await import('./MobileBottomNav.vue');

let cleanup: (() => void) | undefined;

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(MobileBottomNav) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

beforeEach(() => {
  communityUnreadTotal.value = 0;
  refreshCommunityUnread.mockClear();
  resetCommunityUnread.mockClear();
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('移动底栏 · 聊天室未读角标', () => {
  it('登录账号挂载时重置旧账号状态并刷新真实频道未读', () => {
    mount();

    expect(resetCommunityUnread).toHaveBeenCalledTimes(1);
    expect(refreshCommunityUnread).toHaveBeenCalledTimes(1);
  });

  it('只把数字角标挂在聊天室入口，并提供完整读屏语义', async () => {
    const host = mount();
    communityUnreadTotal.value = 12;
    await nextTick();

    const badge = host.querySelector('.mobile-bottom-nav__badge[aria-label]') as HTMLElement;
    expect(badge?.textContent?.trim()).toBe('12');
    expect(badge?.getAttribute('aria-label')).toContain('12');
    expect(badge?.closest('.mobile-bottom-nav__item')?.textContent).toContain(zhCN.mobileNavigation.community);
  });

  it('无未读时隐藏，超过 99 条时显示 99+', async () => {
    const host = mount();
    expect(host.querySelector('.mobile-bottom-nav__badge[aria-label]')).toBeNull();

    communityUnreadTotal.value = 105;
    await nextTick();
    expect(host.querySelector('.mobile-bottom-nav__badge[aria-label]')?.textContent?.trim()).toBe('99+');
  });
});
