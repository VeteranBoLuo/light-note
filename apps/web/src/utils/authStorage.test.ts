// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_LOGIN_PREVIEW_FRAME_NAME,
  clearAdminLoginPreview,
  clearLoginHistory,
  getAdminContextToken,
  getAdminLoginPreviewUrl,
  hasLoggedInBefore,
  isAdminLoginPreview,
  markLoggedIn,
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

  it('父级后台即使共享 sessionStorage 也不会读取上下文令牌', () => {
    setAdminLoginPreview('secret-context-token', { lang: 'zh-CN' });
    expect(isAdminLoginPreview()).toBe(false);
    expect(getAdminContextToken()).toBe('');
    expect(localStorage.getItem('adminContextToken')).toBeNull();
  });

  it('只有命名预览 iframe 才读取 sessionStorage 令牌', () => {
    setAdminLoginPreview('secret-context-token');
    window.name = ADMIN_LOGIN_PREVIEW_FRAME_NAME;
    expect(isAdminLoginPreview()).toBe(true);
    expect(getAdminContextToken()).toBe('secret-context-token');
    clearAdminLoginPreview();
    expect(getAdminContextToken()).toBe('');
  });

  it('预览 URL 只携带非敏感标识，不包含原始 token', () => {
    setAdminLoginPreview('secret-context-token');
    const url = getAdminLoginPreviewUrl('/home');
    expect(url).toContain('adminLoginPreview=1');
    expect(url).not.toContain('secret-context-token');
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
