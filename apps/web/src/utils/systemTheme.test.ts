import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import { getAndroidSystemTheme } from './androidBridge';
import { onSystemThemeChange, resetSystemThemeForTest, resolveSystemTheme } from './systemTheme';

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
  // 原生推送值是模块级状态，不会随用例自动复位
  resetSystemThemeForTest();
});

afterEach(() => {
  Object.defineProperty(navigator, 'userAgent', { get: () => originalUa, configurable: true });
  vi.unstubAllGlobals();
  // 不要 delete window.__lightNoteAndroidSystemTheme：androidBridge 里的安装标记是模块级的，
  // 删掉属性后 hook 不会重装，后续用例的推送会静默失效 —— 期望值恰好为空的断言会假通过。
  // 各用例的监听由 onSystemThemeChange 返回的 dispose 负责摘除，hook 本身留着无害。
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

    // 值现在被响应式缓存（这正是修复的一部分），换 stub 相当于换了一台设备，需要重新初始化
    stubMatchMedia(false);
    resetSystemThemeForTest();
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

  it('推送到达后 resolveSystemTheme 必须返回新值，而不是 UA 里的旧快照', () => {
    // 真机症状就出在这里：Toast 显示已推送，但订阅者回调里重新求值又读回 UA 的旧值，
    // 主题被设回原样，看起来毫无变化。UA 是 WebView 创建那一刻的快照、永远不变。
    stubUserAgent(`${CHROME_UA} LightNoteAndroid/1.0.2 LightNoteSystemTheme/day`);
    stubMatchMedia(false);
    expect(resolveSystemTheme()).toBe('day');

    const seen: string[] = [];
    const dispose = onSystemThemeChange(() => seen.push(resolveSystemTheme()));

    window.__lightNoteAndroidSystemTheme?.('night');
    // 回调执行时数据源就该是新值 —— 顺序颠倒的话这里会读到 'day'
    expect(seen).toEqual(['night']);
    expect(resolveSystemTheme()).toBe('night');

    window.__lightNoteAndroidSystemTheme?.('day');
    expect(resolveSystemTheme()).toBe('day');
    dispose();
  });

  it('resolveSystemTheme 必须是响应式的 —— 否则 Pinia getter 会缓存住第一次的值', () => {
    // 真机症状「系统主题只有第一次切换生效」就出在这：useUser.currentTheme 是 Pinia getter
    // （computed，会缓存），只追踪响应式依赖。系统主题若是普通变量，getter 求值一次后
    // 再也不失效 —— 因为 preferences.theme 一直是 'system' 没变过。原生怎么推都没用。
    stubUserAgent(`${CHROME_UA} LightNoteAndroid/1.0.2 LightNoteSystemTheme/day`);
    stubMatchMedia(false);
    const themeLikeGetter = computed(() => resolveSystemTheme());
    expect(themeLikeGetter.value).toBe('day');

    window.__lightNoteAndroidSystemTheme?.('night');
    expect(themeLikeGetter.value).toBe('night');

    // 反复切换都要生效，不能只有第一次
    window.__lightNoteAndroidSystemTheme?.('day');
    expect(themeLikeGetter.value).toBe('day');
    window.__lightNoteAndroidSystemTheme?.('night');
    expect(themeLikeGetter.value).toBe('night');
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

  it('取消订阅只摘掉自己那条媒体查询监听', () => {
    stubUserAgent(CHROME_UA);
    const mq = stubMatchMedia(true);
    // 模块内部常驻一条（负责维护数据源，不随订阅者增减），这里记下基线
    resolveSystemTheme();
    const baseline = mq.listenerCount();

    const dispose = onSystemThemeChange(() => {});
    expect(mq.listenerCount()).toBe(baseline + 1);

    dispose();
    expect(mq.listenerCount()).toBe(baseline);
  });
});
