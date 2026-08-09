import { usesMobileDeviceLayout } from './responsive';

export const MOBILE_RENDERING_CLASS = 'light-note-mobile-rendering';
export const ANDROID_WEBVIEW_CLASS = 'light-note-android-webview';
export const RENDER_PROFILE_QUERY_KEY = 'renderProfile';
export const RENDER_PROFILE_SESSION_KEY = 'light-note-render-profile';

export type RenderingProfileOverride = 'auto' | 'mobile' | 'desktop';

interface RenderingProfileInput {
  viewportWidth: number;
  coarsePointer?: boolean;
  androidWebView?: boolean;
  override?: RenderingProfileOverride;
}

interface RenderingProfileSyncOptions {
  androidWebView?: boolean;
  windowObject?: Window;
  documentObject?: Document;
}

export function resolveMobileRenderingProfile({
  viewportWidth,
  coarsePointer = false,
  androidWebView = false,
  override = 'auto',
}: RenderingProfileInput): boolean {
  // App 的旧 WebView 必须始终启用稳定回退，不能被调试参数意外关闭。
  if (androidWebView) return true;
  if (override === 'mobile') return true;
  if (override === 'desktop') return false;
  return usesMobileDeviceLayout(viewportWidth, coarsePointer);
}

function normalizeRenderingProfile(value: string | null | undefined): RenderingProfileOverride {
  return value === 'mobile' || value === 'desktop' ? value : 'auto';
}

function readRenderingProfileOverride(windowObject: Window): RenderingProfileOverride {
  try {
    const queryValue = new URLSearchParams(windowObject.location.search).get(RENDER_PROFILE_QUERY_KEY);
    if (queryValue === 'auto') {
      windowObject.sessionStorage.removeItem(RENDER_PROFILE_SESSION_KEY);
      return 'auto';
    }
    if (queryValue === 'mobile' || queryValue === 'desktop') {
      windowObject.sessionStorage.setItem(RENDER_PROFILE_SESSION_KEY, queryValue);
      return queryValue;
    }
    return normalizeRenderingProfile(windowObject.sessionStorage.getItem(RENDER_PROFILE_SESSION_KEY));
  } catch {
    return 'auto';
  }
}

export function syncRenderingProfile({
  androidWebView = false,
  windowObject = window,
  documentObject = document,
}: RenderingProfileSyncOptions = {}) {
  const coarsePointer = Boolean(windowObject.matchMedia?.('(pointer: coarse)').matches);
  const override = readRenderingProfileOverride(windowObject);
  const mobileRendering = resolveMobileRenderingProfile({
    viewportWidth: Number(windowObject.innerWidth),
    coarsePointer,
    androidWebView,
    override,
  });
  const root = documentObject.documentElement;

  root.classList.toggle(MOBILE_RENDERING_CLASS, mobileRendering);
  root.classList.toggle(ANDROID_WEBVIEW_CLASS, androidWebView);
  root.dataset.lightNoteRenderProfile = mobileRendering ? 'mobile' : 'desktop';
  root.dataset.lightNoteRenderEngine = androidWebView ? 'android-webview' : 'browser';

  return { mobileRendering, androidWebView, coarsePointer, override };
}

/**
 * 窗口缩放、横竖屏与主要输入方式变化时同步共享渲染基线。
 * 返回清理函数，便于测试和将来微前端卸载。
 */
export function installRenderingProfileSync(options: RenderingProfileSyncOptions = {}) {
  const windowObject = options.windowObject ?? window;
  const update = () => syncRenderingProfile({ ...options, windowObject });
  const pointerQuery = windowObject.matchMedia?.('(pointer: coarse)');

  update();
  windowObject.addEventListener('resize', update, { passive: true });
  windowObject.addEventListener('orientationchange', update, { passive: true });
  if (pointerQuery?.addEventListener) pointerQuery.addEventListener('change', update);
  else pointerQuery?.addListener?.(update);

  return () => {
    windowObject.removeEventListener('resize', update);
    windowObject.removeEventListener('orientationchange', update);
    if (pointerQuery?.removeEventListener) pointerQuery.removeEventListener('change', update);
    else pointerQuery?.removeListener?.(update);
  };
}
