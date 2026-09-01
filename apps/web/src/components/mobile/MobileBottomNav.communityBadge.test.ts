import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const communityUnreadTotal = ref(0);
const openQuickCapture = vi.fn();
const routerPush = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'workbenches', query: {}, meta: { mobileShell: 'today' }, fullPath: '/workbenches' }),
  useRouter: () => ({
    replace: vi.fn(),
    push: routerPush,
    resolve: (target: unknown) => ({ fullPath: String(target) }),
  }),
}));
vi.mock('@/store', () => ({
  inboxStore: () => ({
    todoAttentionTotal: 0,
    todoOverdueTotal: 0,
    todoDueTodayTotal: 0,
    refreshCount: vi.fn(),
    openQuickCapture,
  }),
  useUserStore: () => ({ id: 'user-1', role: 'user' }),
}));
vi.mock('@/composables/useMobileNavigationState', () => ({
  getMobileResourceEntryPath: () => '/home',
  useMobileNavigationState: () => ({ saveResourceScroll: vi.fn(), scrollCurrentResourceToTop: vi.fn() }),
}));
vi.mock('@/composables/useCommunityChatUnread', () => ({
  useCommunityChatUnread: () => ({
    totalUnread: communityUnreadTotal,
  }),
}));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: () => false }));
vi.mock('@/components/mobile/MobilePageActionsDrawer.vue', () => ({
  default: {
    name: 'MobilePageActionsDrawerStub',
    props: ['open', 'actions'],
    emits: ['update:open', 'action'],
    template:
      '<div v-if="open" class="create-hub-stub"><button v-for="action in actions" :key="action.key" @click="$emit(\'action\', action)">{{ action.label }}</button></div>',
  },
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
  openQuickCapture.mockClear();
  routerPush.mockClear();
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('移动底栏 · 聊天室未读角标', () => {
  it('中间新建入口先打开动作面板，再按类型打开快速收集', async () => {
    const host = mount();
    const captureEntry = host.querySelector<HTMLButtonElement>(
      `.mobile-bottom-nav__item[aria-label="${zhCN.mobileNavigation.quickCapture}"]`,
    );

    captureEntry?.click();
    await nextTick();
    const noteAction = [...host.querySelectorAll<HTMLButtonElement>('.create-hub-stub button')].find((button) =>
      button.textContent?.includes(zhCN.mobileNavigation.createHub.note),
    );
    expect(noteAction).not.toBeUndefined();

    noteAction?.click();
    await nextTick();
    expect(openQuickCapture).toHaveBeenCalledWith('note');
  });

  it('中间新建入口把资料生成作为二级动作打开知识工坊', async () => {
    const host = mount();
    const captureEntry = host.querySelector<HTMLButtonElement>(
      `.mobile-bottom-nav__item[aria-label="${zhCN.mobileNavigation.quickCapture}"]`,
    );

    captureEntry?.click();
    await nextTick();
    const toolboxAction = [...host.querySelectorAll<HTMLButtonElement>('.create-hub-stub button')].find((button) =>
      button.textContent?.includes(zhCN.mobileNavigation.createHub.toolbox),
    );

    toolboxAction?.click();
    await nextTick();
    expect(routerPush).toHaveBeenCalledWith('/toolbox');
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
