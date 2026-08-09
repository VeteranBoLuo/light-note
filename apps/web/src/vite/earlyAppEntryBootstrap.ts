import type { Plugin } from 'vite';
import {
  APPLICATION_ENTRY_PATH,
  LOGIN_HISTORY_STORAGE_KEYS,
  LOGIN_HISTORY_TTL_MS,
  MOBILE_LANDING_VISIT_STORAGE_KEY,
  PWA_LAUNCH_QUERY_KEY,
  PWA_LAUNCH_QUERY_VALUE,
  PWA_RUNTIME_SESSION_KEY,
} from '../config/appEntryBootstrap';
import { VIEWPORT_BREAKPOINTS } from '../config/responsive';
import {
  ANDROID_WEBVIEW_CLASS,
  MOBILE_RENDERING_CLASS,
  RENDER_PROFILE_QUERY_KEY,
  RENDER_PROFILE_SESSION_KEY,
} from '../config/renderingProfile';

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
    desktopBreakpoint: VIEWPORT_BREAKPOINTS.desktop,
    compactBreakpoint: VIEWPORT_BREAKPOINTS.compact,
    mobileRenderingClass: MOBILE_RENDERING_CLASS,
    androidWebViewClass: ANDROID_WEBVIEW_CLASS,
    renderProfileQueryKey: RENDER_PROFILE_QUERY_KEY,
    renderProfileSessionKey: RENDER_PROFILE_SESSION_KEY,
    pwaLaunchQueryKey: PWA_LAUNCH_QUERY_KEY,
    pwaLaunchQueryValue: PWA_LAUNCH_QUERY_VALUE,
    pwaRuntimeSessionKey: PWA_RUNTIME_SESSION_KEY,
  });

  return `(function () {
  var config = ${config};
  try {
    // manifest start_url 的来源标记只保留在本次独立窗口会话中，供 API 日志识别运行环境。
    // 它不是身份或权限凭据；sessionStorage 不可用时继续依赖标准 display-mode 信号。
    try {
      if (window.location.pathname === config.appEntryPath) {
        var launchParams = new URLSearchParams(String(window.location.search || ''));
        if (launchParams.get(config.pwaLaunchQueryKey) === config.pwaLaunchQueryValue) {
          window.sessionStorage.setItem(config.pwaRuntimeSessionKey, '1');
        }
      }
    } catch (markerError) {}

    var userAgent = String((window.navigator && window.navigator.userAgent) || '');
    var hasAndroidBridge = Boolean(
      window.LightNoteAndroid && typeof window.LightNoteAndroid.postMessage === 'function'
    );
    var isLightNoteAndroidApp =
      hasAndroidBridge || /\\bLightNoteAndroid\\/[\\w.-]+/i.test(userAgent);
    var isGenericAndroidWebView =
      /Android/i.test(userAgent) && /;\\s*wv\\)/i.test(userAgent);
    var isAndroidWebView = isLightNoteAndroidApp || isGenericAndroidWebView;

    // 该脚本位于 viewport meta 之前，部分移动浏览器此时会把 innerWidth 报成约 980px。
    // 同时参考屏幕短边，确保首屏渲染基线与 viewport meta 生效后的真实移动布局一致。
    var innerWidth = Number(window.innerWidth);
    var screenWidth = Number(window.screen && window.screen.width);
    var screenHeight = Number(window.screen && window.screen.height);
    var screenNarrowSide = Math.min(
      screenWidth > 0 ? screenWidth : Infinity,
      screenHeight > 0 ? screenHeight : Infinity
    );
    var effectiveViewportWidth = innerWidth > 0 ? innerWidth : screenNarrowSide;
    // 只在真正的手机短边上用 screen 修正 viewport meta 生效前约 980px 的假宽度。
    // 桌面屏幕的“短边”通常是高度（例如 900px），不能拿它参与 1200px 布局断点，
    // 否则宽屏桌面首帧会误套移动基线，等 main.ts 运行后才恢复并产生闪烁。
    if (screenNarrowSide < config.mobileBreakpoint) {
      effectiveViewportWidth = Math.min(effectiveViewportWidth, screenNarrowSide);
    }
    if (!Number.isFinite(effectiveViewportWidth)) {
      effectiveViewportWidth = config.compactBreakpoint;
    }

    var coarsePointer = Boolean(
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
    );
    var renderProfileOverride = 'auto';
    try {
      var renderProfileParams = new URLSearchParams(String(window.location.search || ''));
      var queryRenderProfile = renderProfileParams.get(config.renderProfileQueryKey);
      if (queryRenderProfile === 'auto') {
        window.sessionStorage.removeItem(config.renderProfileSessionKey);
      } else if (queryRenderProfile === 'mobile' || queryRenderProfile === 'desktop') {
        window.sessionStorage.setItem(config.renderProfileSessionKey, queryRenderProfile);
        renderProfileOverride = queryRenderProfile;
      } else {
        var storedRenderProfile = window.sessionStorage.getItem(config.renderProfileSessionKey);
        if (storedRenderProfile === 'mobile' || storedRenderProfile === 'desktop') {
          renderProfileOverride = storedRenderProfile;
        }
      }
    } catch (renderProfileError) {}

    var usesMobileLayout =
      effectiveViewportWidth < config.desktopBreakpoint ||
      (effectiveViewportWidth < config.compactBreakpoint && coarsePointer);
    var usesMobileRendering =
      isAndroidWebView ||
      renderProfileOverride === 'mobile' ||
      (renderProfileOverride !== 'desktop' && usesMobileLayout);
    var root = document.documentElement;
    root.classList.toggle(config.mobileRenderingClass, usesMobileRendering);
    root.classList.toggle(config.androidWebViewClass, isAndroidWebView);
    root.setAttribute(
      'data-light-note-render-profile',
      usesMobileRendering ? 'mobile' : 'desktop'
    );
    root.setAttribute(
      'data-light-note-render-engine',
      isAndroidWebView ? 'android-webview' : 'browser'
    );

    if (window.location.pathname !== '/') return;

    function redirectToApplication() {
      var previousVisibility = root.style.visibility;
      root.style.visibility = 'hidden';
      try {
        window.location.replace(config.appEntryPath);
      } catch (error) {
        root.style.visibility = previousVisibility;
      }
    }

    // APK 不受视口宽度影响，任何误入根路径的场景都直接回稳定应用入口。
    if (isLightNoteAndroidApp) {
      redirectToApplication();
      return;
    }

    if (effectiveViewportWidth >= config.mobileBreakpoint) return;

    // 普通第三方 Android WebView 可能错误报告 standalone，不能因此冒充轻笺 PWA。
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
