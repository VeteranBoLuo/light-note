import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(() => Promise.resolve()),
  refreshBookmarks: vi.fn(),
  refreshInbox: vi.fn(() => Promise.resolve()),
  resetInbox: vi.fn(),
}));

const bookmark = {
  isMobile: false,
  isFold: false,
  type: 'all',
  bookmarkSearch: '',
  refreshData: mocks.refreshBookmarks,
};

vi.mock('@/router', () => ({
  default: {
    push: mocks.routerPush,
  },
}));

vi.mock('vue-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('vue-router')>();
  return {
    ...original,
    useRoute: () => ({ path: '/home', name: 'home' }),
  };
});

vi.mock('@/store', () => ({
  bookmarkStore: () => bookmark,
  inboxStore: () => ({
    resetForOwner: mocks.resetInbox,
    refreshCount: mocks.refreshInbox,
  }),
  useUserStore: () => ({
    id: '',
    role: 'visitor',
  }),
}));

vi.mock('@/components/home/navigation/RightArea.vue', () => ({
  default: { name: 'RightAreaStub', template: '<div></div>' },
}));

vi.mock('@/components/base/BasicComponents/BDropdown.vue', () => ({
  default: { name: 'BDropdownStub', template: '<div><slot /></div>' },
}));

const { default: Navigation } = await import('./Navigation.vue');

let cleanup: (() => void) | undefined;

async function mountNavigation() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(Navigation);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    }),
  );
  app.directive('click-log', {});
  app.mount(host);
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  mocks.routerPush.mockClear();
  bookmark.isFold = false;
});

describe('Navigation', () => {
  it('PC 应用内点击 Logo 进入稳定应用入口，而不是返回官网', async () => {
    const host = await mountNavigation();
    const logo = host.querySelector<HTMLElement>('.navigation-title-link');

    expect(logo).not.toBeNull();
    logo?.click();
    await Promise.resolve();
    await nextTick();

    expect(mocks.routerPush).toHaveBeenCalledWith('/app');
    expect(bookmark.isFold).toBe(true);
  });
});
