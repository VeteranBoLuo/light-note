import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import appSource from './App.vue?raw';

const script = appSource.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)?.[1] || '';
const parsed = ts.createSourceFile('App.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const preloadBlock = parsed.statements.find(
  node => ts.isFunctionDeclaration(node) && node.name?.text === 'syncAppStartupPrewarm',
)?.getText(parsed) || '';

describe('应用启动预热接入', () => {
  it('提交字节预热，由统一调度器决定网络范围', () => {
    expect(appSource).toContain('scheduleAppStartupPrewarm');
    expect(preloadBlock).not.toContain('bookmark.isDesktop');
    expect(preloadBlock).not.toContain('isAndroidApp || bookmark.isDesktop');
    expect(preloadBlock).toContain('!appStartupReady.value || !applicationRoute');
    expect(preloadBlock).not.toContain('user.id');
    expect(preloadBlock).not.toContain('user.role');
    expect(appSource).toContain('appStartupReady.value = true');
    expect(appSource).toContain('disposeAppStartupPrewarm?.()');
    expect(preloadBlock).toContain('scheduleAppStartupPrewarm()');
  });

  it('官网等纯展示路由不会下载编辑器运行时', () => {
    expect(appSource).toContain("'landing'");
    expect(appSource).toContain("'downloadAndroid'");
    expect(appSource).toContain('startupPrewarmExcludedRoutes.has(currentRouteName)');
  });

  it('启动只提交静态资源，不导航或请求虚构笔记', () => {
    expect(preloadBlock).not.toContain('prefetchResolvedRoute');
    expect(preloadBlock).not.toContain('router.push');
    expect(preloadBlock).not.toContain('import(');
  });
});
