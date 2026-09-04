import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, provide, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { LANDING_AUTH_CONTEXT } from './landingAuth.ts';

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(() => Promise.resolve()),
  recordOperation: vi.fn(() => Promise.resolve()),
  retryAuth: vi.fn(() => Promise.resolve()),
  loadUserAuthModal: vi.fn(() => Promise.resolve()),
  scheduleLandingStartupPreload: vi.fn(() => vi.fn()),
  prefetchResolvedRoute: vi.fn(() => Promise.resolve()),
  messageWarning: vi.fn(),
  hasLoginHint: true,
  user: {
    id: '',
    role: 'visitor',
    preferences: { theme: 'day' },
  },
  bookmark: {
    isMobile: false,
    openAuthModal: vi.fn(),
  },
}));

vi.mock('vue-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('vue-router')>();
  return {
    ...original,
    useRouter: () => ({ push: mocks.routerPush }),
  };
});

vi.mock('@/store', () => ({
  useUserStore: () => mocks.user,
  bookmarkStore: () => mocks.bookmark,
}));

vi.mock('@/utils/authStorage.ts', () => ({
  hasLoggedInBefore: () => mocks.hasLoginHint,
}));

vi.mock('@/utils/userAuthModalLoader.ts', () => ({
  loadUserAuthModal: mocks.loadUserAuthModal,
}));

vi.mock('@/utils/routePrefetch.ts', () => ({
  prefetchResolvedRoute: mocks.prefetchResolvedRoute,
}));

vi.mock('./landingPreload.ts', () => ({
  scheduleLandingStartupPreload: mocks.scheduleLandingStartupPreload,
}));

vi.mock('@/api/commonApi.ts', () => ({
  recordOperation: mocks.recordOperation,
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { warning: mocks.messageWarning },
}));

vi.mock('@/http/request', () => ({
  apiBasePost: vi.fn(),
}));

vi.mock('@/utils/conversion', () => ({
  trackConversion: vi.fn(),
}));

vi.mock('@/composables/usePwaInstall', () => ({
  usePwaInstall: () => ({
    isStandalone: ref(false),
    openGuide: vi.fn(),
  }),
}));

vi.mock('@/utils/androidBridge', () => ({
  isLightNoteAndroidApp: () => false,
}));

vi.mock('@/utils/appRuntime.ts', () => ({
  resolveLightNoteRuntime: () => 'browser',
}));

vi.mock('@/utils/mobileLandingVisit.ts', () => ({
  markMobileLandingVisited: vi.fn(),
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<span />' },
}));

vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { name: 'BModalStub', template: '<div><slot /></div>' },
}));

const { default: Landing } = await import('./Landing.vue');

let cleanup: (() => void) | undefined;
let canvasContextSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeEach(() => {
  mocks.hasLoginHint = true;
  mocks.routerPush.mockImplementation(() => Promise.resolve());
  mocks.loadUserAuthModal.mockImplementation(() => Promise.resolve());
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
  } as unknown as CanvasRenderingContext2D;
  canvasContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

async function mountLanding(authState: 'pending' | 'authenticated' | 'anonymous' | 'error' = 'pending') {
  const host = document.createElement('div');
  document.body.append(host);
  const authStatus = ref(authState);
  const app = createApp({
    setup() {
      provide(LANDING_AUTH_CONTEXT, {
        status: authStatus,
        retry: mocks.retryAuth,
      });
      return () => h(Landing);
    },
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          landing: {
            websiteFilingName: '备案网站名称：{name}',
          },
        },
      },
      missingWarn: false,
      fallbackWarn: false,
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
  canvasContextSpy?.mockRestore();
  canvasContextSpy = undefined;
  vi.unstubAllGlobals();
  mocks.routerPush.mockClear();
  mocks.recordOperation.mockClear();
  mocks.retryAuth.mockClear();
  mocks.loadUserAuthModal.mockClear();
  mocks.prefetchResolvedRoute.mockClear();
  mocks.bookmark.openAuthModal.mockClear();
  mocks.messageWarning.mockClear();
  vi.useRealTimers();
});

describe('Landing CTA', () => {
  it('近期登录用户在身份恢复完成前首次点击也能进入应用', async () => {
    const host = await mountLanding();
    const enterButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('landing.ctaEnterApp'),
    );

    expect(enterButton).not.toBeUndefined();
    enterButton?.click();
    await nextTick();

    expect(mocks.routerPush).toHaveBeenCalledWith('/app');
  });

  it('进入应用导航未完成时只把右侧箭头切换为加载状态并阻止重复点击', async () => {
    let finishNavigation!: () => void;
    mocks.routerPush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishNavigation = resolve;
        }),
    );
    const host = await mountLanding();
    const enterButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('landing.ctaEnterApp'),
    );

    enterButton?.click();
    await nextTick();

    expect(enterButton?.textContent).toContain('landing.ctaEnterApp');
    expect(enterButton?.disabled).toBe(true);
    expect(enterButton?.getAttribute('aria-busy')).toBe('true');
    expect(enterButton?.querySelector('.btn-arrow--loading')).not.toBeNull();
    expect(enterButton?.querySelector('.btn-spinner')).toBeNull();
    enterButton?.click();
    expect(mocks.routerPush).toHaveBeenCalledTimes(1);

    finishNavigation();
    await vi.waitFor(() => {
      expect(enterButton?.disabled).toBe(false);
      expect(enterButton?.querySelector('.btn-arrow--loading')).toBeNull();
    });
  });

  it('进入应用导航失败时恢复按钮并给出收口提示', async () => {
    mocks.routerPush.mockRejectedValueOnce(new Error('route load failed'));
    const host = await mountLanding();
    const enterButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('landing.ctaEnterApp'),
    );

    enterButton?.click();
    await vi.waitFor(() => expect(mocks.messageWarning).toHaveBeenCalledWith('landing.serviceUnavailable'));

    expect(enterButton?.disabled).toBe(false);
    expect(enterButton?.getAttribute('aria-busy')).toBeNull();
    expect(enterButton?.querySelector('.btn-arrow--loading')).toBeNull();
  });

  it('首次访客统一显示“开始使用轻笺”，加载注册弹窗后再打开', async () => {
    mocks.hasLoginHint = false;
    const host = await mountLanding('anonymous');
    const startButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('landing.ctaStart'),
    );

    expect(startButton).not.toBeUndefined();
    expect(host.textContent).not.toContain('landing.ctaCreateSpace');
    startButton?.click();
    await vi.waitFor(() => expect(mocks.bookmark.openAuthModal).toHaveBeenCalledWith('注册', 'landing_primary'));

    expect(mocks.loadUserAuthModal).toHaveBeenCalledTimes(1);
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });

  it('体验示例加载时使用不参与排版的原位图标，不插入会撑宽按钮的基础 loading', async () => {
    let finishNavigation!: () => void;
    mocks.hasLoginHint = false;
    mocks.routerPush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishNavigation = resolve;
        }),
    );
    const host = await mountLanding('anonymous');
    const demoButton = host.querySelector<HTMLButtonElement>('.s-cover .btn-ghost');

    expect(demoButton?.querySelector('.btn-ghost__loading-indicator.is-visible')).toBeNull();
    expect(demoButton?.querySelector('.btn-spinner')).toBeNull();

    demoButton?.click();
    await nextTick();

    expect(demoButton?.textContent).toContain('landing.ctaTryDemo');
    expect(demoButton?.disabled).toBe(true);
    expect(demoButton?.getAttribute('aria-busy')).toBe('true');
    expect(demoButton?.querySelector('.btn-ghost__loading-indicator.is-visible')).not.toBeNull();
    expect(demoButton?.querySelector('.btn-spinner')).toBeNull();

    finishNavigation();
    await vi.waitFor(() => {
      expect(demoButton?.disabled).toBe(false);
      expect(demoButton?.getAttribute('aria-busy')).toBeNull();
    });
  });

  it('慢于阈值的应用跳转显示可理解的加载说明，完成后自动收起', async () => {
    vi.useFakeTimers();
    let finishNavigation!: () => void;
    mocks.routerPush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishNavigation = resolve;
        }),
    );
    const host = await mountLanding();
    const enterButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('landing.ctaEnterApp'),
    );

    enterButton?.click();
    await vi.advanceTimersByTimeAsync(349);
    expect(host.querySelector('.landing-navigation-feedback')).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(host.querySelector('.landing-navigation-feedback')?.textContent).toContain('landing.navigationOpeningApp');
    await vi.advanceTimersByTimeAsync(850);
    expect(host.querySelector('.landing-navigation-feedback')?.textContent).toContain('landing.navigationLoadingHint');
    await vi.advanceTimersByTimeAsync(6_800);
    expect(host.querySelector('.landing-navigation-feedback')?.textContent).toContain('landing.navigationStillLoading');

    finishNavigation();
    await Promise.resolve();
    await nextTick();
    await vi.advanceTimersByTimeAsync(200);
    expect(host.querySelector('.landing-navigation-feedback')).toBeNull();
  });

  it('把官网的支持入口收敛到站内说明页', async () => {
    const host = await mountLanding();
    const reasonLink = host.querySelector<HTMLAnchorElement>('.reason-support-link');
    const footerLink = host.querySelector<HTMLAnchorElement>('.footer-support-link');

    expect(reasonLink?.getAttribute('href')).toBe('/support');
    expect(footerLink?.getAttribute('href')).toBe('/support');
    expect(host.querySelectorAll<HTMLAnchorElement>('a[href="/support"]')).toHaveLength(2);

    reasonLink?.click();
    await nextTick();
    expect(mocks.routerPush).toHaveBeenCalledWith('/support');
  });

  it('展示浏览器扩展独立展区、长期商店链接与六段导航', async () => {
    const host = await mountLanding();
    const storeLink = host.querySelector<HTMLAnchorElement>('.landing-extension-store-link');
    const detailButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('landing.extensionLearnMore'),
    );

    expect(storeLink?.href).toBe('https://chromewebstore.google.com/detail/hfdpgaiggloacopnkihfkloicjepldig');
    expect(host.querySelectorAll('.nav-dots .nav-dot')).toHaveLength(6);
    expect(host.querySelector('.landing-footer a[href="/browser-extension"]')).not.toBeNull();

    detailButton?.click();
    await nextTick();
    expect(mocks.routerPush).toHaveBeenCalledWith('/browser-extension');
  });

  it('在官网页脚公开网站 ICP 与公安备案信息', async () => {
    const host = await mountLanding();
    const footer = host.querySelector<HTMLElement>('.landing-footer');
    const aboutLink = footer?.querySelector<HTMLAnchorElement>('a[href="/about.html"]');
    const helpLink = footer?.querySelector<HTMLAnchorElement>('a[href="/helpCenter"]');
    const publicSecurityLink = footer?.querySelector<HTMLAnchorElement>(
      'a[href="https://beian.mps.gov.cn/#/query/webSearch?code=51200002001211"]',
    );

    expect(footer?.textContent).toContain('轻笺知识库');
    expect(footer?.textContent).toContain('蜀ICP备2026017699号-1');
    expect(footer?.textContent).toContain('川公网安备51200002001211号');
    expect(publicSecurityLink?.querySelector('img')?.getAttribute('src')).toBe('/public-security-filing-badge.png');
    expect(aboutLink).not.toBeNull();
    expect(helpLink).not.toBeNull();
  });
});
