// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANDROID_WEBVIEW_CLASS,
  MOBILE_RENDERING_CLASS,
  RENDER_PROFILE_SESSION_KEY,
  installRenderingProfileSync,
  resolveMobileRenderingProfile,
  syncRenderingProfile,
} from './renderingProfile';

function configureViewport(width: number, coarsePointer = false) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: coarse)' ? coarsePointer : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('移动端共享渲染配置', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-light-note-render-profile');
    document.documentElement.removeAttribute('data-light-note-render-engine');
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('窄屏浏览器和 Android App 使用同一移动基线', () => {
    expect(resolveMobileRenderingProfile({ viewportWidth: 390 })).toBe(true);
    expect(resolveMobileRenderingProfile({ viewportWidth: 1440, androidWebView: true })).toBe(true);
  });

  it('桌面窄窗口以外保持桌面基线，平板粗指针沿用移动基线', () => {
    expect(resolveMobileRenderingProfile({ viewportWidth: 1366 })).toBe(false);
    expect(resolveMobileRenderingProfile({ viewportWidth: 1366, coarsePointer: true })).toBe(true);
  });

  it('移动浏览器同步共享类但不会伪装成 Android WebView', () => {
    configureViewport(390);
    const profile = syncRenderingProfile({ androidWebView: false });

    expect(profile.mobileRendering).toBe(true);
    expect(document.documentElement.classList.contains(MOBILE_RENDERING_CLASS)).toBe(true);
    expect(document.documentElement.classList.contains(ANDROID_WEBVIEW_CLASS)).toBe(false);
    expect(document.documentElement.dataset.lightNoteRenderEngine).toBe('browser');
  });

  it('Android WebView 同时保留引擎身份和共享移动类', () => {
    configureViewport(1440);
    syncRenderingProfile({ androidWebView: true });

    expect(document.documentElement.classList.contains(MOBILE_RENDERING_CLASS)).toBe(true);
    expect(document.documentElement.classList.contains(ANDROID_WEBVIEW_CLASS)).toBe(true);
  });

  it('电脑可用 renderProfile=mobile 强制验收，auto 会清除会话覆盖', () => {
    configureViewport(1440);
    window.history.replaceState(null, '', '/?renderProfile=mobile');
    syncRenderingProfile();
    expect(document.documentElement.classList.contains(MOBILE_RENDERING_CLASS)).toBe(true);
    expect(window.sessionStorage.getItem(RENDER_PROFILE_SESSION_KEY)).toBe('mobile');

    window.history.replaceState(null, '', '/?renderProfile=auto');
    syncRenderingProfile();
    expect(document.documentElement.classList.contains(MOBILE_RENDERING_CLASS)).toBe(false);
    expect(window.sessionStorage.getItem(RENDER_PROFILE_SESSION_KEY)).toBeNull();
  });

  it('兼容只提供旧版 MediaQueryList addListener 的 WebView', () => {
    configureViewport(390, true);
    const addListener = vi.fn();
    const removeListener = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(pointer: coarse)',
      addListener,
      removeListener,
    });

    const cleanup = installRenderingProfileSync();
    expect(addListener).toHaveBeenCalledOnce();

    cleanup();
    expect(removeListener).toHaveBeenCalledOnce();
  });
});
