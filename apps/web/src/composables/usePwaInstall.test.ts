import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordOperation = vi.fn();

vi.mock('@/api/commonApi', () => ({
  recordOperation,
}));

describe('usePwaInstall', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    recordOperation.mockReset();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === '(max-width: 767px)',
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

  it('falls back to the guide, captures the browser prompt, and detects an installed app', async () => {
    const { initializePwaInstall, usePwaInstall } = await import('./usePwaInstall');
    initializePwaInstall();
    const pwa = usePwaInstall();

    expect(await pwa.requestInstall('settings')).toBe('manual');
    expect(pwa.guideVisible.value).toBe(true);
    expect(pwa.guidePlatform.value).toBe('harmony');

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: typeof prompt;
      userChoice: Promise<{ outcome: 'accepted'; platform: string }>;
    };
    event.prompt = prompt;
    event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.dispatchEvent(event);

    expect(pwa.canPrompt.value).toBe(true);
    expect(await pwa.requestInstall('settings')).toBe('accepted');
    expect(prompt).toHaveBeenCalledOnce();
    expect(pwa.canPrompt.value).toBe(false);

    window.dispatchEvent(new Event('appinstalled'));
    expect(pwa.isStandalone.value).toBe(true);
    expect(pwa.guideVisible.value).toBe(false);
  });
});
