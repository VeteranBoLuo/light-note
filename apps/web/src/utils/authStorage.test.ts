// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_HISTORY_STORAGE_KEYS, LOGIN_HISTORY_TTL_MS } from '@/config/appEntryBootstrap';
import {
  clearAdminLoginPreview,
  clearLoginHistory,
  getAdminContextToken,
  getAdminLoginPreviewPreferences,
  getAdminLoginPreviewUrl,
  getAdminLoginPreviewReturnUrl,
  hasLoggedInBefore,
  isAdminLoginPreview,
  markLoggedIn,
  normalizeAdminLoginPreviewReturnUrl,
  setAdminLoginPreview,
} from './authStorage';

describe('管理员预览前端令牌隔离', () => {
  beforeEach(() => {
    window.name = '';
    window.history.replaceState({}, '', '/admin/userMg');
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    clearAdminLoginPreview();
    window.name = '';
  });

  it('整页预览在业务路由移除查询标识后仍持续使用同标签页令牌', () => {
    setAdminLoginPreview('secret-context-token', { lang: 'zh-CN' }, '/admin/userMg?status=active');
    expect(localStorage.getItem('adminContextToken')).toBeNull();
    window.history.replaceState({}, '', '/home?adminLoginPreview=1');
    expect(isAdminLoginPreview()).toBe(true);
    expect(getAdminContextToken()).toBe('secret-context-token');
    window.history.replaceState({}, '', '/home');
    expect(isAdminLoginPreview()).toBe(true);
    expect(getAdminContextToken()).toBe('secret-context-token');
    expect(getAdminLoginPreviewPreferences()).toEqual({ lang: 'zh-CN' });
    expect(getAdminLoginPreviewReturnUrl()).toBe('/admin/userMg?status=active');
  });

  it('没有当前标签页预览材料时不会仅凭普通应用地址启用上下文', () => {
    window.history.replaceState({}, '', '/home');
    expect(isAdminLoginPreview()).toBe(false);
    expect(getAdminContextToken()).toBe('');
  });

  it('预览 URL 只携带非敏感标识，不包含原始 token', () => {
    setAdminLoginPreview('secret-context-token');
    const url = getAdminLoginPreviewUrl('/home');
    expect(url).toContain('adminLoginPreview=1');
    expect(url).not.toContain('secret-context-token');
  });

  it('返回地址只接受本站用户管理路径，并随本地材料一起清理', () => {
    expect(normalizeAdminLoginPreviewReturnUrl('/userMg#users')).toBe('/userMg#users');
    expect(normalizeAdminLoginPreviewReturnUrl('/admin/userMg?status=banned')).toBe('/admin/userMg?status=banned');
    expect(normalizeAdminLoginPreviewReturnUrl('https://evil.example/userMg')).toBe('/admin/userMg');
    expect(normalizeAdminLoginPreviewReturnUrl('/admin')).toBe('/admin/userMg');

    setAdminLoginPreview('token', null, '/userMg');
    expect(getAdminLoginPreviewReturnUrl()).toBe('/userMg');
    clearAdminLoginPreview();
    expect(getAdminLoginPreviewReturnUrl()).toBe('/admin/userMg');
  });
});

describe('账号注销后的本地登录记忆清理', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('同时清除曾登录、记住账号和持久会话标记', () => {
    markLoggedIn();
    localStorage.setItem('rememberedLoginEmail', 'owner@example.com');
    localStorage.setItem('rememberedSid', 'remembered-session');
    expect(hasLoggedInBefore()).toBe(true);

    clearLoginHistory();

    expect(hasLoggedInBefore()).toBe(false);
    expect(localStorage.getItem('rememberedLoginEmail')).toBeNull();
    expect(localStorage.getItem('rememberedSid')).toBeNull();
  });
});

describe('曾登录记录兼容性', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T08:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('兼容历史版本写入的 1 标记', () => {
    localStorage.setItem(LOGIN_HISTORY_STORAGE_KEYS.loggedIn, '1');
    expect(hasLoggedInBefore()).toBe(true);
  });

  it('保留有效时间戳并清理过期记录', () => {
    localStorage.setItem(LOGIN_HISTORY_STORAGE_KEYS.loggedIn, String(Date.now() - LOGIN_HISTORY_TTL_MS + 1));
    expect(hasLoggedInBefore()).toBe(true);

    localStorage.setItem(LOGIN_HISTORY_STORAGE_KEYS.loggedIn, String(Date.now() - LOGIN_HISTORY_TTL_MS - 1));
    expect(hasLoggedInBefore()).toBe(false);
    expect(localStorage.getItem(LOGIN_HISTORY_STORAGE_KEYS.loggedIn)).toBeNull();
  });
});
