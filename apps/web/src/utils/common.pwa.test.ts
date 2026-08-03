import { afterEach, describe, expect, it, vi } from 'vitest';
import { PWA_RUNTIME_SESSION_KEY } from '@/config/appEntryBootstrap.ts';
import { isPwaStandaloneMode } from './common';

describe('PWA API 日志设备标记', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'standalone');
    window.sessionStorage.removeItem(PWA_RUNTIME_SESSION_KEY);
  });

  it('普通浏览器不标记为 PWA', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);
    expect(isPwaStandaloneMode()).toBe(false);
  });

  it('通过 display-mode 识别独立窗口模式', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);
    expect(isPwaStandaloneMode()).toBe(true);
  });

  it('兼容 iOS 的 navigator.standalone 标记', () => {
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true,
    });
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);
    expect(isPwaStandaloneMode()).toBe(true);
  });

  it('兼容 macOS PWA 当前窗口的启动标记', () => {
    window.sessionStorage.setItem(PWA_RUNTIME_SESSION_KEY, '1');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);

    expect(isPwaStandaloneMode()).toBe(true);
  });
});
