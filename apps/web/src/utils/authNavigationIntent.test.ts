import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAuthNavigationIntent,
  normalizeAuthNavigationTarget,
  rememberAuthNavigationIntent,
  resolveAnonymousProtectedNavigationMode,
  resolveAuthNavigationIntent,
  resolveRouteAuthDecision,
} from './authNavigationIntent';

describe('authNavigationIntent', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAuthNavigationIntent();
    vi.useRealTimers();
  });

  it.each([
    ['/points-usage', '/points-usage'],
    ['/ai-usage?range=month', '/ai-usage?range=month'],
    ['/manage/tagMg?create=1#editor', '/manage/tagMg?create=1#editor'],
    [`${window.location.origin}/tag/tag-1?edit=1`, '/tag/tag-1?edit=1'],
  ])('保留 PC 与移动受保护入口的同源完整路径：%s', (input, expected) => {
    expect(normalizeAuthNavigationTarget(input)).toBe(expected);
  });

  it.each([
    'https://attacker.example/path',
    '//attacker.example/path',
    'javascript:alert(1)',
    '/login',
    '/auth/callback',
  ])('拒绝外域或认证循环回跳：%s', (input) => {
    expect(normalizeAuthNavigationTarget(input)).toBeNull();
    expect(rememberAuthNavigationIntent(input)).toBe(false);
  });

  it('在同一标签页保存目标，并在一小时后自动失效', () => {
    const now = new Date('2026-08-31T10:00:00Z').getTime();
    expect(rememberAuthNavigationIntent('/points-usage', now)).toBe(true);
    expect(resolveAuthNavigationIntent(now + 59 * 60 * 1000)).toBe('/points-usage');
    expect(resolveAuthNavigationIntent(now + 61 * 60 * 1000)).toBeNull();
  });

  it('显式应用内点击打开登录，冷启动和游客维护上下文保持被动回退', () => {
    expect(resolveAnonymousProtectedNavigationMode({ fromRouteName: 'home', fromMatchedCount: 2 })).toBe('prompt');
    expect(resolveAnonymousProtectedNavigationMode({ fromRouteName: 'personCenter', fromMatchedCount: 1 })).toBe(
      'prompt',
    );
    expect(resolveAnonymousProtectedNavigationMode({ fromMatchedCount: 0 })).toBe('redirect');
    expect(
      resolveAnonymousProtectedNavigationMode({
        fromRouteName: 'home',
        fromMatchedCount: 2,
        visitorWorkspace: true,
      }),
    ).toBe('redirect');
  });

  it('统一覆盖 PC/移动、游客/登录和公开/受保护入口', () => {
    const privateRoles = ['root', 'user', 'test'];
    expect(
      resolveRouteAuthDecision({
        requiredRoles: privateRoles,
        userRole: 'visitor',
        fromRouteName: 'personCenter',
        fromMatchedCount: 1,
      }),
    ).toBe('prompt-auth');
    expect(
      resolveRouteAuthDecision({
        requiredRoles: privateRoles,
        userRole: 'visitor',
        fromRouteName: 'home',
        fromMatchedCount: 2,
      }),
    ).toBe('prompt-auth');
    expect(resolveRouteAuthDecision({ requiredRoles: privateRoles, userRole: 'visitor' })).toBe('guest-home');
    expect(resolveRouteAuthDecision({ requiredRoles: privateRoles, userId: 'u1', userRole: 'user' })).toBe('allow');
    expect(resolveRouteAuthDecision({ requiredRoles: ['root'], userId: 'u1', userRole: 'user' })).toBe('forbidden');
    expect(
      resolveRouteAuthDecision({
        requiredRoles: ['root'],
        userRole: 'visitor',
        fromRouteName: 'home',
        fromMatchedCount: 2,
      }),
    ).toBe('guest-home');
    expect(resolveRouteAuthDecision({ requiredRoles: ['visitor'], userRole: 'visitor' })).toBe('allow');
  });
});
