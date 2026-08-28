import { describe, expect, it } from 'vitest';
import router from './index';

describe('官网与应用入口路由', () => {
  it('根路径稳定匹配官网 Landing，不执行设备或偏好重定向', () => {
    const resolved = router.resolve('/');
    expect(resolved.name).toBe('landing');
    expect(resolved.matched.map((record) => record.name)).toEqual(['appShell', 'landing']);
    expect(resolved.matched.at(-1)?.beforeEnter).toBeUndefined();
    expect(resolved.meta.seoIndexable).toBe(true);
    expect(resolved.meta.canonicalPath).toBe('/');
  });

  it('保留独立 /app 稳定应用入口，并将旧 /landing 规范化到根路径', () => {
    expect(router.resolve('/app').name).toBe('appEntry');
    const legacyLanding = router.getRoutes().find((record) => record.name === 'legacyLanding');
    expect(legacyLanding?.redirect).toBe('/');
  });

  it('用户通知使用独立页面路由，且不挂移动端主导航壳', () => {
    const resolved = router.resolve('/notifications');
    expect(resolved.name).toBe('notifications');
    expect(resolved.meta.requireAuth).toBe(true);
    expect(resolved.meta.mobileTopSwitcher).not.toBe(true);
    expect(resolved.meta.mobileBottomNav).not.toBe(true);
  });

  it('移动端新建待办使用独立页面路由，不挂底部主导航', () => {
    const resolved = router.resolve('/todo/new');
    expect(resolved.name).toBe('todoCreate');
    expect(resolved.meta.requireAuth).toBe(true);
    expect(resolved.meta.mobileBottomNav).not.toBe(true);
  });

  it('社区客厅使用独立路由并占据移动底栏第五位', () => {
    const resolved = router.resolve('/community-chat');
    expect(resolved.name).toBe('communityChat');
    expect(resolved.meta.mobileShell).toBe('community');
    expect(resolved.meta.mobileTopBar).toBe(false);
    expect(resolved.meta.mobileBottomNav).toBe(true);
    expect(resolved.meta.roles).toContain('visitor');
  });

  it('支持轻笺页面允许游客直达，且使用统一的双端路径', () => {
    const resolved = router.resolve('/support');
    expect(resolved.name).toBe('support');
    expect(resolved.meta.roles).toContain('visitor');
    expect(resolved.meta.mobileTopSwitcher).not.toBe(true);
    expect(resolved.meta.mobileBottomNav).not.toBe(true);
  });

  it('AI 用量使用独立登录页，且旧设置深链接会兼容迁移', () => {
    const resolved = router.resolve('/ai-usage');
    expect(resolved.name).toBe('aiUsage');
    expect(resolved.meta.requireAuth).toBe(true);
    expect(resolved.meta.roles).not.toContain('visitor');

    const settingsRecord = router.getRoutes().find((record) => record.name === 'settings');
    expect(typeof settingsRecord?.beforeEnter).toBe('function');
    expect((settingsRecord?.beforeEnter as any)?.({ query: { section: 'ai' } })).toEqual({
      name: 'aiUsage',
      replace: true,
    });
  });

  it('标签列表与详情都是私人资源路由', () => {
    const index = router.resolve('/manage/tagMg');
    const detail = router.resolve('/tag/tag-1');
    expect(index.name).toBe('tagMg');
    expect(detail.name).toBe('tagDetail');
    expect(index.meta.roles).not.toContain('visitor');
    expect(detail.meta.roles).not.toContain('visitor');
    expect(detail.meta.mobileShell).toBe('resources');
    expect(detail.meta.mobileTopSwitcher).toBe(true);
    expect(detail.meta.mobileBottomNav).toBe(true);
  });

  it('笔记分享使用独立只读页面，并显式隔离登录探测、AI 与搜索引擎收录', () => {
    const resolved = router.resolve('/share/note?page=child#token=secret');
    expect(resolved.name).toBe('noteShare');
    expect(resolved.meta.publicStandalone).toBe(true);
    expect(resolved.meta.hideAiAssistant).toBe(true);
    expect(resolved.meta.seoIndexable).toBe(false);
    expect(resolved.meta.mobileTopBar).toBe(false);
    expect(resolved.path).toBe('/share/note');
    expect(router.resolve('/share/note/leaked-token').name).not.toBe('noteShare');
  });
});
