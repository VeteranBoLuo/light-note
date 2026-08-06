import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAndroidSystemTheme } from './androidBridge';
import { onSystemThemeChange, resolveSystemTheme } from './systemTheme';

/**
 * 「跟随系统」的判定来源。
 *
 * 真机上出过一次：鸿蒙系统开着深色、App 里也选了「跟随系统」，界面却一直浅色。
 * 原因是 WebView 的 prefers-color-scheme 只反映宿主主题的 isLightTheme、还会被旧 API 的
 * setForceDark 钉死，跟系统开关无关。所以 App 内必须以原生打在 UA 里的 uiMode 为准，
 * 而不是媒体查询 —— 这组断言就是防止有人图省事把判定改回 matchMedia。
 */

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36';
const originalUa = navigator.userAgent;

function stubUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', { get: () => value, configurable: true });
}

/** 控制 prefers-color-scheme 的返回值，用来验证「App 内不听它」 */
function stubMatchMedia(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: prefersDark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mq),
  );
  return { fire: () => listeners.forEach((fn) => fn()), listenerCount: () => listeners.size };
}

beforeEach(() => {
  stubUserAgent(originalUa);
});

afterEach(() => {
  Object.defineProperty(navigator, 'userAgent', { get: () => originalUa, configurable: true });
  vi.unstubAllGlobals();
  delete window.__lightNoteAndroidSystemTheme;
});

describe('getAndroidSystemTheme', () => {
  it('从 UA 读出原生打的系统主题标记', () => {
    expect(getAndroidSystemTheme(`${CHROME_UA} LightNoteAndroid/1.0.2 LightNoteSystemTheme/night`)).toBe('night');
    expect(getAndroidSystemTheme(`${CHROME_UA} LightNoteAndroid/1.0.2 LightNoteSystemTheme/day`)).toBe('day');
  });

  it('旧版 App 与普通浏览器都没有这个标记，返回空串让调用方回退', () => {
    // 1.0.1 及更早的包 UA 里只有版本号，没有系统主题
    expect(getAndroidSystemTheme(`${CHROME_UA} LightNoteAndroid/1.0.1`)).toBe('');
    expect(getAndroidSystemTheme(CHROME_UA)).toBe('');
  });
});

describe('resolveSystemTheme', () => {
  it('App 内以原生信号为准，即使媒体查询说的相反', () => {
    // 这正是真机上的情形：系统深色，但 WebView 的 prefers-color-scheme 恒为 light
    stubUserAgent(`${CHROME_UA} LightNoteAndroid/1.0.2 LightNoteSystemTheme/night`);
    stubMatchMedia(false);

    expect(resolveSystemTheme()).toBe('night');
  });

  it('非 App 环境回退到媒体查询', () => {
    stubUserAgent(CHROME_UA);
    stubMatchMedia(true);
    expect(resolveSystemTheme()).toBe('night');

    stubMatchMedia(false);
    expect(resolveSystemTheme()).toBe('day');
  });

  it('旧版 App（UA 无标记）同样回退媒体查询，不会卡死在某一色', () => {
    stubUserAgent(`${CHROME_UA} LightNoteAndroid/1.0.1`);
    stubMatchMedia(true);
    expect(resolveSystemTheme()).toBe('night');
  });
});

describe('onSystemThemeChange', () => {
  it('原生推送能触发回调', () => {
    stubUserAgent(`${CHROME_UA} LightNoteAndroid/1.0.2 LightNoteSystemTheme/day`);
    stubMatchMedia(false);
    const seen: string[] = [];
    const dispose = onSystemThemeChange((theme) => seen.push(theme));

    window.__lightNoteAndroidSystemTheme?.('night');
    window.__lightNoteAndroidSystemTheme?.('day');
    expect(seen).toEqual(['night', 'day']);

    dispose();
    window.__lightNoteAndroidSystemTheme?.('night');
    expect(seen).toEqual(['night', 'day']);
  });

  it('原生推来的非法值被忽略', () => {
    stubMatchMedia(false);
    const seen: string[] = [];
    const dispose = onSystemThemeChange((theme) => seen.push(theme));

    window.__lightNoteAndroidSystemTheme?.('dark');
    window.__lightNoteAndroidSystemTheme?.(null);
    window.__lightNoteAndroidSystemTheme?.(undefined);
    expect(seen).toEqual([]);
    dispose();
  });

  it('App 内忽略媒体查询那一路 —— 它在 WebView 里不可信', () => {
    stubUserAgent(`${CHROME_UA} LightNoteAndroid/1.0.2 LightNoteSystemTheme/night`);
    const mq = stubMatchMedia(false);
    const seen: string[] = [];
    const dispose = onSystemThemeChange((theme) => seen.push(theme));

    mq.fire();
    expect(seen).toEqual([]);
    dispose();
  });

  it('浏览器里媒体查询变化能触发回调', () => {
    stubUserAgent(CHROME_UA);
    const mq = stubMatchMedia(true);
    const seen: string[] = [];
    const dispose = onSystemThemeChange((theme) => seen.push(theme));

    mq.fire();
    expect(seen).toEqual(['night']);
    dispose();
  });

  it('取消订阅后两路都不再回调，且媒体查询监听被摘掉', () => {
    stubUserAgent(CHROME_UA);
    const mq = stubMatchMedia(true);
    const dispose = onSystemThemeChange(() => {});
    expect(mq.listenerCount()).toBe(1);

    dispose();
    expect(mq.listenerCount()).toBe(0);
  });
});
