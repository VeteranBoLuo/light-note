import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(() => Promise.resolve()),
  listUpdateLogs: vi.fn(),
  listManagedUpdateLogs: vi.fn(),
  user: { role: 'visitor' },
  bookmark: { isMobile: false },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('@/store', () => ({
  useUserStore: () => mocks.user,
  bookmarkStore: () => mocks.bookmark,
}));

vi.mock('@/api/updateLogApi', () => ({
  createUpdateLogDraft: vi.fn(),
  listManagedUpdateLogs: mocks.listManagedUpdateLogs,
  listUpdateLogs: mocks.listUpdateLogs,
}));

vi.mock('@/utils/common', () => ({
  backRouterPage: vi.fn(),
  noteContentToHtml: vi.fn(() => Promise.resolve('')),
}));

vi.mock('@/components/base/BasicComponents/CommonContainer.vue', () => ({
  default: { template: '<section><slot name="navigation" /><slot /></section>' },
}));

vi.mock('@/components/personCenter/UpdateLogEditor.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('@/components/mobile/MobileListSurface.vue', () => ({
  default: { template: '<div><slot /></div>' },
}));

vi.mock('@/components/mobile/MobileListRow.vue', () => ({
  default: { template: '<div><slot /></div>' },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span />' },
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { error: vi.fn() },
}));

const { default: UpdateLogs } = await import('./UpdateLogs.vue');

let app: ReturnType<typeof createApp> | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  mocks.listUpdateLogs.mockResolvedValue({ status: 200, data: { items: [] } });
  mocks.listManagedUpdateLogs.mockResolvedValue({ status: 200, data: { items: [] } });
});

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = undefined;
  host = undefined;
  mocks.routerPush.mockClear();
  mocks.listUpdateLogs.mockReset();
  mocks.listManagedUpdateLogs.mockReset();
});

describe('UpdateLogs support entry', () => {
  it('在更新日志标题旁用克制入口进入站内支持页', async () => {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(UpdateLogs);
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { support: { entry: '支持轻笺' } } },
        missingWarn: false,
        fallbackWarn: false,
      }),
    );
    app.directive('click-log', {});
    app.directive('mermaid', {});
    app.mount(host);

    await vi.waitFor(() => expect(mocks.listUpdateLogs).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(host.querySelector('.changelog-support-card')).toBeNull();
    const mobileAction = host.querySelector<HTMLButtonElement>('button.mobile-changelog-nav__support');
    expect(mobileAction?.getAttribute('aria-label')).toBe('支持轻笺');
    expect(mobileAction?.textContent?.trim()).toBe('');

    const action = host.querySelector<HTMLButtonElement>('button.logs-intro__support');
    expect(action).not.toBeNull();
    action?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await nextTick();

    expect(mocks.routerPush).toHaveBeenCalledWith('/support');
  });
});
