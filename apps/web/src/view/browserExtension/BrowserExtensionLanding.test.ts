import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

const mocks = vi.hoisted(() => ({
  isMobile: false,
  routerPush: vi.fn(() => Promise.resolve()),
  recordOperation: vi.fn(() => Promise.resolve()),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  copyTextToClipboard: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('@/store', () => ({
  bookmarkStore: () => ({
    get isMobile() {
      return mocks.isMobile;
    },
  }),
}));

vi.mock('@/api/commonApi.ts', () => ({
  recordOperation: mocks.recordOperation,
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: mocks.messageSuccess, warning: mocks.messageWarning },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<span />' },
}));

vi.mock('@/utils/clipboard.ts', () => ({
  copyTextToClipboard: mocks.copyTextToClipboard,
}));

const { default: BrowserExtensionLanding } = await import('./BrowserExtensionLanding.vue');

let cleanup: (() => void) | undefined;

async function mountPage() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(BrowserExtensionLanding) });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': {} },
      missingWarn: false,
      fallbackWarn: false,
    }),
  );
  app.mount(host);
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

beforeEach(() => {
  mocks.isMobile = false;
  mocks.copyTextToClipboard.mockResolvedValue(true);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  mocks.routerPush.mockClear();
  mocks.recordOperation.mockClear();
  mocks.messageSuccess.mockClear();
  mocks.messageWarning.mockClear();
  mocks.copyTextToClipboard.mockClear();
});

describe('浏览器扩展公开介绍页', () => {
  it('桌面端公开两处 Chrome Web Store 长期链接和四个真实界面标签', async () => {
    const host = await mountPage();
    const storeLinks = host.querySelectorAll<HTMLAnchorElement>(
      'a[href="https://chromewebstore.google.com/detail/hfdpgaiggloacopnkihfkloicjepldig"]',
    );

    expect(storeLinks).toHaveLength(2);
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(host.querySelector('a[href="/legal/browser-extension-privacy.html"]')).not.toBeNull();
  });

  it('移动端不伪装可安装，改为复制介绍页地址', async () => {
    mocks.isMobile = true;
    const host = await mountPage();
    const copyButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('browserExtensionLanding.mobileAction'),
    );

    expect(host.querySelector('.browser-extension-mobile-notice')).not.toBeNull();
    expect(host.querySelector('.browser-extension-store-link')).toBeNull();
    copyButton?.click();
    await vi.waitFor(() => {
      expect(mocks.copyTextToClipboard).toHaveBeenCalledWith('http://localhost:3000/browser-extension');
    });
    expect(mocks.messageSuccess).toHaveBeenCalledWith('browserExtensionLanding.copySuccess');
  });

  it('移动端书签栏方案不跳转到隐藏设置，改为复制本页供电脑端继续', async () => {
    mocks.isMobile = true;
    const host = await mountPage();
    const bookmarkletButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('browserExtensionLanding.bookmarkletMobileAction'),
    );

    expect(bookmarkletButton).toBeDefined();
    bookmarkletButton?.click();
    await vi.waitFor(() => {
      expect(mocks.copyTextToClipboard).toHaveBeenCalledWith('http://localhost:3000/browser-extension');
    });
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });

  it('移动端复制不可用时显示明确失败提示', async () => {
    mocks.isMobile = true;
    mocks.copyTextToClipboard.mockResolvedValue(false);
    const host = await mountPage();
    const copyButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('browserExtensionLanding.mobileAction'),
    );

    copyButton?.click();
    await vi.waitFor(() => {
      expect(mocks.messageWarning).toHaveBeenCalledWith('browserExtensionLanding.copyFailed');
    });
    expect(mocks.messageSuccess).not.toHaveBeenCalled();
  });
});
