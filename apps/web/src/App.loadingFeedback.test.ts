import { describe, expect, it } from 'vitest';
import appSource from './App.vue?raw';

describe('应用加载反馈边界', () => {
  it('不再渲染移动端全局顶部进度条，保留业务局部加载组件', () => {
    expect(appSource).not.toContain('<BLoading');
    expect(appSource).not.toContain('mobileGlobalLoadingBarVisible');
    expect(appSource).not.toContain('routeNavigationLoading');
    expect(appSource).not.toContain('globalRefreshing');
    expect(appSource).not.toContain('networkRequestLoading');
    expect(appSource).toContain('AsyncFeatureLoadingOverlay');
    expect(appSource).toContain('AndroidDownloadProgress');
  });
});
