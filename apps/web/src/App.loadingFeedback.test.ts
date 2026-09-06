import { describe, expect, it } from 'vitest';
import appSource from './App.vue?raw';

describe('应用加载反馈边界', () => {
  it('不再渲染移动端全局顶部进度条，冷启动身份恢复阶段保持安静', () => {
    expect(appSource).not.toContain('class="auth-startup-loading"');
    expect(appSource).toContain('v-if="applicationAuthStatus === \'error\'" class="loading-container"');
    expect(appSource).not.toContain('mobileGlobalLoadingBarVisible');
    expect(appSource).not.toContain('routeNavigationLoading');
    expect(appSource).not.toContain('globalRefreshing');
    expect(appSource).not.toContain('networkRequestLoading');
    expect(appSource).toContain('AsyncFeatureLoadingOverlay');
    expect(appSource).toContain('loader: loadUserAuthModal');
    expect(appSource).toContain('AndroidDownloadProgress');
  });
});
