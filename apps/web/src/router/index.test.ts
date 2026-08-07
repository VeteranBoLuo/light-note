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
});
