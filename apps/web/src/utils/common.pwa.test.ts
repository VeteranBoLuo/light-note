import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiLogOsInfo, isPwaStandaloneMode } from './common';

describe('PWA API 日志设备标记', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'standalone');
  });

  it('普通浏览器保持原操作系统名称', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);
    expect(isPwaStandaloneMode()).toBe(false);
    expect(getApiLogOsInfo()).not.toContain('（app）');
  });

  it('独立窗口模式在操作系统名称后追加 app', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);
    expect(isPwaStandaloneMode()).toBe(true);
    expect(getApiLogOsInfo()).toMatch(/（app）$/);
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
    expect(getApiLogOsInfo()).toMatch(/（app）$/);
  });
});
