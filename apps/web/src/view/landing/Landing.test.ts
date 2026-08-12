import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, provide, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { LANDING_AUTH_CONTEXT } from './landingAuth.ts';

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(() => Promise.resolve()),
  recordOperation: vi.fn(() => Promise.resolve()),
  retryAuth: vi.fn(() => Promise.resolve()),
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
  hasLoggedInBefore: () => true,
}));

vi.mock('@/api/commonApi.ts', () => ({
  recordOperation: mocks.recordOperation,
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

async function mountLanding() {
  const host = document.createElement('div');
  document.body.append(host);
  const authStatus = ref<'pending'>('pending');
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

  it('在官网页脚公开网站 ICP 与公安备案信息', async () => {
    const host = await mountLanding();
    const footer = host.querySelector<HTMLElement>('.landing-footer');
    const aboutLink = footer?.querySelector<HTMLAnchorElement>('a[href="/about.html"]');
    const publicSecurityLink = footer?.querySelector<HTMLAnchorElement>(
      'a[href="https://beian.mps.gov.cn/#/query/webSearch?code=51200002001211"]',
    );

    expect(footer?.textContent).toContain('轻笺知识库');
    expect(footer?.textContent).toContain('蜀ICP备2026017699号-1');
    expect(footer?.textContent).toContain('川公网安备51200002001211号');
    expect(publicSecurityLink?.querySelector('img')?.getAttribute('src')).toBe(
      '/public-security-filing-badge.png',
    );
    expect(aboutLink).not.toBeNull();
  });
});
