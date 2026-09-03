import { describe, expect, it } from 'vitest';
import appSource from './App.vue?raw';

describe('应用加载反馈边界', () => {
  it('不再渲染移动端全局顶部进度条，仅在冷启动身份门禁使用 BLoading', () => {
    expect(appSource).toContain('<BLoading');
    expect(appSource).toContain('class="auth-startup-loading"');
    expect(appSource).toContain('inline');
    expect(appSource).not.toContain('mobileGlobalLoadingBarVisible');
    expect(appSource).not.toContain('routeNavigationLoading');
    expect(appSource).not.toContain('globalRefreshing');
    expect(appSource).not.toContain('networkRequestLoading');
    expect(appSource).toContain('AsyncFeatureLoadingOverlay');
    expect(appSource).toContain('loader: loadUserAuthModal');
    expect(appSource).toContain('AndroidDownloadProgress');
  });
});
