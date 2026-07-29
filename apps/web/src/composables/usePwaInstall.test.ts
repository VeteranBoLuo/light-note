import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordOperation = vi.fn();

vi.mock('@/api/commonApi', () => ({
  recordOperation,
}));

describe('usePwaInstall', () => {
  beforeEach(() => {
    vi.resetModules();
    delete window.LightNoteAndroid;
    localStorage.clear();
    sessionStorage.clear();
    recordOperation.mockReset();
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('detects the environment and handles standard, legacy, pending, broken, and unavailable install prompts', async () => {
    const { detectPwaBrowserFamily, initializePwaInstall, supportsReliablePwaPrompt, usePwaInstall } =
      await import('./usePwaInstall');
    expect(detectPwaBrowserFamily('Mozilla/5.0 HuaweiBrowser/16.0 Chrome/114.0')).toBe('huawei');
    expect(detectPwaBrowserFamily('Mozilla/5.0 Quark/7.7.0 Chrome/124.0')).toBe('quark');
    expect(detectPwaBrowserFamily('Mozilla/5.0 QHBrowser/14.5 Chrome/122.0')).toBe('360');
    expect(detectPwaBrowserFamily('Mozilla/5.0 EdgA/138.0 Chrome/138.0')).toBe('edge');
    expect(detectPwaBrowserFamily('Mozilla/5.0 Firefox/140.0')).toBe('firefox');
    expect(detectPwaBrowserFamily('Mozilla/5.0 MQQBrowser/6.2 MicroMessenger/8.0.60')).toBe('wechat');
    expect(detectPwaBrowserFamily('Mozilla/5.0 baiduboxapp/14.0')).toBe('baidu');
    expect(detectPwaBrowserFamily('Mozilla/5.0 TencentTraveler MQQBrowser/16.0')).toBe('qq');
    expect(supportsReliablePwaPrompt('harmony', 'huawei')).toBe(false);
    expect(supportsReliablePwaPrompt('harmony', 'chrome')).toBe(false);
    expect(supportsReliablePwaPrompt('android', 'quark')).toBe(false);
    expect(supportsReliablePwaPrompt('android', 'huawei')).toBe(false);
    expect(supportsReliablePwaPrompt('android', 'chrome')).toBe(true);
    expect(supportsReliablePwaPrompt('android', 'edge')).toBe(true);
    expect(supportsReliablePwaPrompt('desktop', 'opera')).toBe(true);
    expect(supportsReliablePwaPrompt('desktop', 'firefox')).toBe(false);
    expect(supportsReliablePwaPrompt('ios', 'safari')).toBe(false);

    initializePwaInstall();
    const pwa = usePwaInstall();

    expect(pwa.detectedBrowser.value).toBe('chrome');
    expect(pwa.detectedPlatform.value).toBe('android');
    expect(await pwa.requestInstall('settings')).toBe('unsupported');
    expect(pwa.guideVisible.value).toBe(false);
    expect(recordOperation).toHaveBeenCalledWith({
      module: 'PWA安装',
      operation: '点击一键安装【设置】',
    });
    expect(recordOperation).toHaveBeenCalledWith({
      module: 'PWA安装',
      operation: '浏览器不支持一键安装【设置】',
    });

    pwa.openGuide('settings');
    expect(pwa.guideVisible.value).toBe(true);
    expect(pwa.guidePlatform.value).toBe('android');
    expect(recordOperation).toHaveBeenCalledWith({
      module: 'PWA安装',
      operation: '查看安装教程【设置】',
    });

    const acceptedPrompt = vi.fn().mockResolvedValue({ outcome: 'accepted', platform: 'web' });
    const acceptedEvent = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: typeof acceptedPrompt;
    };
    acceptedEvent.prompt = acceptedPrompt;
    window.dispatchEvent(acceptedEvent);

    expect(pwa.canPrompt.value).toBe(true);
    expect(await pwa.requestInstall('settings')).toBe('accepted');
    expect(acceptedPrompt).toHaveBeenCalledOnce();
    expect(pwa.canPrompt.value).toBe(false);

    const legacyPrompt = vi.fn().mockResolvedValue(undefined);
    const legacyEvent = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: typeof legacyPrompt;
      userChoice: Promise<{ outcome: 'dismissed'; platform: string }>;
    };
    legacyEvent.prompt = legacyPrompt;
    legacyEvent.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
    window.dispatchEvent(legacyEvent);
    expect(await pwa.requestInstall('settings')).toBe('dismissed');

    const brokenPrompt = vi.fn().mockResolvedValue(undefined);
    const brokenEvent = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: typeof brokenPrompt;
    };
    brokenEvent.prompt = brokenPrompt;
    window.dispatchEvent(brokenEvent);
    expect(await pwa.requestInstall('settings')).toBe('failed');

    let resolvePendingPrompt!: (choice: { outcome: 'accepted'; platform: string }) => void;
    const pendingPrompt = vi.fn(
      () =>
        new Promise<{ outcome: 'accepted'; platform: string }>((resolve) => {
          resolvePendingPrompt = resolve;
        }),
    );
    const pendingEvent = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: typeof pendingPrompt;
    };
    pendingEvent.prompt = pendingPrompt;
    window.dispatchEvent(pendingEvent);
    const pendingResult = pwa.requestInstall('settings');
    await Promise.resolve();
    expect(pwa.prompting.value).toBe(true);
    resolvePendingPrompt({ outcome: 'accepted', platform: 'web' });
    expect(await pendingResult).toBe('accepted');
    expect(pwa.prompting.value).toBe(false);

    const throwingPrompt = vi.fn().mockRejectedValue(new Error('not implemented'));
    const throwingEvent = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: typeof throwingPrompt;
    };
    throwingEvent.prompt = throwingPrompt;
    window.dispatchEvent(throwingEvent);
    expect(await pwa.requestInstall('settings')).toBe('failed');

    window.dispatchEvent(new Event('appinstalled'));
    expect(pwa.isStandalone.value).toBe(true);
    expect(pwa.guideVisible.value).toBe(false);
  });

  it('轻笺安卓 App 不初始化 PWA 安装能力，也不会打开安装教程', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36 LightNoteAndroid/1.0.0',
    });

    const { initializePwaInstall, usePwaInstall } = await import('./usePwaInstall');
    initializePwaInstall();
    const pwa = usePwaInstall();

    pwa.openGuide('settings');
    expect(pwa.guideVisible.value).toBe(false);
    expect(pwa.canPrompt.value).toBe(false);
    expect(await pwa.requestInstall('settings')).toBe('unsupported');
    expect(recordOperation).not.toHaveBeenCalled();
  });
});
