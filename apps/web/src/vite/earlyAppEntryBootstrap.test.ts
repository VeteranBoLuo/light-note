// @vitest-environment node
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  LOGIN_HISTORY_STORAGE_KEYS,
  LOGIN_HISTORY_TTL_MS,
  MOBILE_LANDING_VISIT_STORAGE_KEY,
} from '../config/appEntryBootstrap';
import { createEarlyAppEntryScript } from './earlyAppEntryBootstrap';

interface ScriptExecutionOptions {
  pathname?: string;
  viewportWidth?: number;
  storage?: Record<string, string>;
  storageThrows?: boolean;
  userAgent?: string;
  standalone?: boolean;
  androidBridge?: boolean;
}

function executeBootstrap({
  pathname = '/',
  viewportWidth = 390,
  storage: initialStorage = {},
  storageThrows = false,
  userAgent = 'Mozilla/5.0 Mobile Safari/537.36',
  standalone = false,
  androidBridge = false,
}: ScriptExecutionOptions = {}) {
  const values = new Map(Object.entries(initialStorage));
  const removedKeys: string[] = [];
  let replacedWith = '';
  const style = { visibility: '' };
  const localStorage = {
    getItem(key: string) {
      if (storageThrows) throw new Error('storage unavailable');
      return values.get(key) ?? null;
    },
    removeItem(key: string) {
      if (storageThrows) throw new Error('storage unavailable');
      values.delete(key);
      removedKeys.push(key);
    },
  };

  vm.runInNewContext(createEarlyAppEntryScript(), {
    Date,
    Number,
    document: {
      documentElement: { style },
    },
    window: {
      innerWidth: viewportWidth,
      localStorage,
      navigator: {
        userAgent,
        standalone,
      },
      matchMedia() {
        return { matches: standalone };
      },
      LightNoteAndroid: androidBridge ? { postMessage() {} } : undefined,
      location: {
        pathname,
        replace(target: string) {
          replacedWith = target;
        },
      },
    },
  });

  return {
    removedKeys,
    replacedWith,
    visibility: style.visibility,
  };
}

describe('首屏前移动应用入口守卫', () => {
  it('不包含搜索引擎 UA 特判', () => {
    expect(createEarlyAppEntryScript()).not.toMatch(/googlebot|baiduspider|bingbot/i);
  });

  it('已经看过移动官网的回访浏览器在官网绘制前进入 /app', () => {
    const result = executeBootstrap({
      storage: {
        [MOBILE_LANDING_VISIT_STORAGE_KEY]: '1',
      },
    });

    expect(result.replacedWith).toBe('/app');
    expect(result.visibility).toBe('hidden');
  });

  it('兼容近期登录过但尚无新版首访记录的移动浏览器', () => {
    const result = executeBootstrap({
      storage: {
        [LOGIN_HISTORY_STORAGE_KEYS.loggedIn]: String(Date.now()),
      },
    });

    expect(result.replacedWith).toBe('/app');
    expect(result.visibility).toBe('hidden');
  });

  it.each([
    [LOGIN_HISTORY_STORAGE_KEYS.rememberedEmail, 'owner@example.com'],
    [LOGIN_HISTORY_STORAGE_KEYS.rememberedSession, 'remembered-session'],
    [LOGIN_HISTORY_STORAGE_KEYS.loggedIn, '1'],
  ])('兼容本地身份信号 %s', (key, value) => {
    expect(executeBootstrap({ storage: { [key]: value } }).replacedWith).toBe('/app');
  });

  it('过期登录记录不跳转并主动清理', () => {
    const result = executeBootstrap({
      storage: {
        [LOGIN_HISTORY_STORAGE_KEYS.loggedIn]: String(Date.now() - LOGIN_HISTORY_TTL_MS - 1),
      },
    });

    expect(result.replacedWith).toBe('');
    expect(result.visibility).toBe('');
    expect(result.removedKeys).toEqual([LOGIN_HISTORY_STORAGE_KEYS.loggedIn]);
  });

  it('无本地记录的手机首访与移动搜索引擎都保留完整官网', () => {
    expect(executeBootstrap().replacedWith).toBe('');
  });

  it('移动 PWA 首次启动也不展示官网', () => {
    expect(executeBootstrap({ standalone: true }).replacedWith).toBe('/app');
  });

  it('轻笺 APK 即使在宽屏模式误入根路径也进入 /app', () => {
    expect(executeBootstrap({ viewportWidth: 1280, androidBridge: true }).replacedWith).toBe('/app');
    expect(
      executeBootstrap({
        viewportWidth: 1280,
        userAgent: 'Mozilla/5.0 LightNoteAndroid/1.2.3',
      }).replacedWith,
    ).toBe('/app');
  });

  it('普通 Android WebView 即使报告 standalone 仍按移动浏览器首访处理', () => {
    const result = executeBootstrap({
      standalone: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A; wv) AppleWebKit/537.36',
    });

    expect(result.replacedWith).toBe('');
  });

  it('桌面浏览器和桌面 PWA 即使已登录也保留根官网', () => {
    const result = executeBootstrap({
      viewportWidth: 1440,
      standalone: true,
      storage: {
        [LOGIN_HISTORY_STORAGE_KEYS.loggedIn]: String(Date.now()),
      },
    });

    expect(result.replacedWith).toBe('');
  });

  it('非根路径不参与官网入口分流', () => {
    const result = executeBootstrap({
      pathname: '/noteLibrary',
      storage: {
        [LOGIN_HISTORY_STORAGE_KEYS.loggedIn]: String(Date.now()),
      },
    });

    expect(result.replacedWith).toBe('');
  });

  it('localStorage 不可用时 fail-open 到公开官网', () => {
    const result = executeBootstrap({ storageThrows: true });

    expect(result.replacedWith).toBe('');
    expect(result.visibility).toBe('');
  });
});
