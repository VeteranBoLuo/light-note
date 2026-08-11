import { describe, expect, it } from 'vitest';
import appSource from './App.vue?raw';

describe('笔记编辑器启动预热接入', () => {
  it('在 App 初始化后为 Android App 和 PC 调度，并允许游客复用同一链路', () => {
    const preloadBlock = appSource.slice(
      appSource.indexOf('function syncNoteEditorStartupPreload'),
      appSource.indexOf('const skipRouter'),
    );
    expect(appSource).toContain('scheduleNoteEditorStartupPreload');
    expect(preloadBlock).toContain('const supportedPlatform = isAndroidApp || bookmark.isDesktop');
    expect(preloadBlock).toContain('!appStartupReady.value || !supportedPlatform || !applicationRoute');
    expect(preloadBlock).not.toContain('user.id');
    expect(preloadBlock).not.toContain('user.role');
    expect(appSource).toContain('appStartupReady.value = true');
    expect(appSource).toContain('disposeNoteEditorStartupPreload?.()');
    expect(appSource).toContain('delayMs: isAndroidApp ? 2_000 : 5_000');
  });

  it('官网等纯展示路由不会下载编辑器运行时', () => {
    expect(appSource).toContain("'landing'");
    expect(appSource).toContain("'downloadAndroid'");
    expect(appSource).toContain('noteEditorPreloadExcludedRoutes.has(currentRouteName)');
  });

  it('只预热详情路由，不导航或请求虚构笔记', () => {
    expect(appSource).toContain("name: 'noteDetail'");
    expect(appSource).toContain("params: { id: '__editor_runtime_warmup__' }");
    expect(appSource).not.toContain("router.push('__editor_runtime_warmup__')");
  });
});
