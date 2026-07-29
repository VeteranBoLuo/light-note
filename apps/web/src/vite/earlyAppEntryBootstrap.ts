import type { Plugin } from 'vite';
import {
  APPLICATION_ENTRY_PATH,
  LOGIN_HISTORY_STORAGE_KEYS,
  LOGIN_HISTORY_TTL_MS,
  MOBILE_LANDING_VISIT_STORAGE_KEY,
} from '../config/appEntryBootstrap';
import { VIEWPORT_BREAKPOINTS } from '../config/responsive';

export const EARLY_APP_ENTRY_SCRIPT_ATTRIBUTE = 'data-light-note-early-app-entry';

/**
 * 这个脚本必须作为经典内联脚本放在 <head> 顶部执行，不能等 Vue/main.ts：
 * 根官网是预渲染 HTML，模块加载期间就可能完成首次绘制，随后再跳转会闪一下官网。
 *
 * 只用轻笺明确的 App 身份、PWA display-mode、本地首访记录与共享移动断点分流；
 * 不识别搜索引擎 UA。普通移动浏览器首次访问和搜索引擎仍会得到完整根官网，
 * 回访浏览器则在首次绘制前进入 /app。
 */
export function createEarlyAppEntryScript(): string {
  const config = JSON.stringify({
    appEntryPath: APPLICATION_ENTRY_PATH,
    mobileLandingVisitedKey: MOBILE_LANDING_VISIT_STORAGE_KEY,
    loggedInKey: LOGIN_HISTORY_STORAGE_KEYS.loggedIn,
    rememberedEmailKey: LOGIN_HISTORY_STORAGE_KEYS.rememberedEmail,
    rememberedSessionKey: LOGIN_HISTORY_STORAGE_KEYS.rememberedSession,
    loginHistoryTtlMs: LOGIN_HISTORY_TTL_MS,
    mobileBreakpoint: VIEWPORT_BREAKPOINTS.mobile,
  });

  return `(function () {
  var config = ${config};
  try {
    if (window.location.pathname !== '/') return;

    function redirectToApplication() {
      var root = document.documentElement;
      var previousVisibility = root.style.visibility;
      root.style.visibility = 'hidden';
      try {
        window.location.replace(config.appEntryPath);
      } catch (error) {
        root.style.visibility = previousVisibility;
      }
    }

    var userAgent = String((window.navigator && window.navigator.userAgent) || '');
    var hasAndroidBridge = Boolean(
      window.LightNoteAndroid && typeof window.LightNoteAndroid.postMessage === 'function'
    );
    var isLightNoteAndroidApp =
      hasAndroidBridge || /\\bLightNoteAndroid\\/[\\w.-]+/i.test(userAgent);

    // APK 不受视口宽度影响，任何误入根路径的场景都直接回稳定应用入口。
    if (isLightNoteAndroidApp) {
      redirectToApplication();
      return;
    }

    // 该脚本位于 viewport meta 之前，部分移动浏览器此时会把 innerWidth 报成约 980px。
    // 同时参考屏幕短边，确保回访手机在官网首次绘制前就能被识别；桌面窄窗口仍沿用响应式宽度语义。
    var innerWidth = Number(window.innerWidth);
    var screenWidth = Number(window.screen && window.screen.width);
    var screenHeight = Number(window.screen && window.screen.height);
    var screenNarrowSide = Math.min(
      screenWidth > 0 ? screenWidth : Infinity,
      screenHeight > 0 ? screenHeight : Infinity
    );
    var effectiveViewportWidth = Math.min(
      innerWidth > 0 ? innerWidth : Infinity,
      screenNarrowSide
    );
    if (
      !Number.isFinite(effectiveViewportWidth) ||
      effectiveViewportWidth >= config.mobileBreakpoint
    ) return;

    // 普通第三方 Android WebView 可能错误报告 standalone，不能因此冒充轻笺 PWA。
    var isGenericAndroidWebView =
      /Android/i.test(userAgent) && /;\\s*wv\\)/i.test(userAgent);
    var isStandalone =
      !isGenericAndroidWebView &&
      Boolean(
        (window.navigator && window.navigator.standalone) ||
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(display-mode: standalone)').matches)
      );

    if (isStandalone) {
      redirectToApplication();
      return;
    }

    var storage = window.localStorage;
    var hasVisitedMobileLanding = storage.getItem(config.mobileLandingVisitedKey) === '1';
    var hasRememberedIdentity = Boolean(
      storage.getItem(config.rememberedEmailKey) || storage.getItem(config.rememberedSessionKey)
    );
    var rawLoginHistory = storage.getItem(config.loggedInKey);
    var hasRecentLogin = false;

    if (rawLoginHistory) {
      var loggedInAt = Number(rawLoginHistory);
      hasRecentLogin =
        rawLoginHistory === '1' ||
        !Number.isFinite(loggedInAt) ||
        Date.now() - loggedInAt <= config.loginHistoryTtlMs;
      if (!hasRecentLogin) storage.removeItem(config.loggedInKey);
    }

    if (!hasVisitedMobileLanding && !hasRememberedIdentity && !hasRecentLogin) return;
    redirectToApplication();
  } catch (error) {
    // localStorage 被禁用等异常必须 fail-open，继续展示公开官网。
  }
})();`;
}

export default function earlyAppEntryBootstrap(): Plugin {
  return {
    name: 'light-note-early-app-entry-bootstrap',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          {
            tag: 'script',
            attrs: {
              [EARLY_APP_ENTRY_SCRIPT_ATTRIBUTE]: 'true',
            },
            children: createEarlyAppEntryScript(),
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}
