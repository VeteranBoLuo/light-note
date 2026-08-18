// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  QUICK_SAVE_AUTH_RETURN_TTL_MS,
  clearQuickSaveAuthReturnPath,
  getQuickSaveAuthReturnFromLoginSearch,
  normalizeQuickSaveAuthReturnPath,
  rememberQuickSaveAuthReturnPath,
  resolveQuickSaveAuthReturnPath,
} from './quickSaveAuthReturn';

describe('快速收藏登录回跳', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/login');
    sessionStorage.clear();
  });

  it('只接受当前站点的 quick-save 路由', () => {
    expect(normalizeQuickSaveAuthReturnPath('/quick-save?u=https%3A%2F%2Fexample.com')).toBe(
      '/quick-save?u=https%3A%2F%2Fexample.com',
    );
    expect(normalizeQuickSaveAuthReturnPath(`${window.location.origin}/quick-save?t=LightNote`)).toBe(
      '/quick-save?t=LightNote',
    );
    expect(normalizeQuickSaveAuthReturnPath('/app')).toBeNull();
    expect(normalizeQuickSaveAuthReturnPath('https://evil.example/quick-save')).toBeNull();
    expect(normalizeQuickSaveAuthReturnPath('//evil.example/quick-save')).toBeNull();
  });

  it('能从登录页 redirect 参数恢复完整收藏地址', () => {
    const returnPath = '/quick-save?u=https%3A%2F%2Fexample.com%2Farticle&t=Article&d=quote';
    const search = `?redirect=${encodeURIComponent(returnPath)}`;

    expect(getQuickSaveAuthReturnFromLoginSearch(search)).toBe(returnPath);
    expect(resolveQuickSaveAuthReturnPath(search)).toBe(returnPath);
  });

  it('跨 GitHub OAuth 导航时从会话存储恢复，并在过期后清理', () => {
    const returnPath = '/quick-save?u=https%3A%2F%2Fexample.com';
    rememberQuickSaveAuthReturnPath(returnPath, 1_000);

    expect(resolveQuickSaveAuthReturnPath('', 1_001)).toBe(returnPath);
    expect(resolveQuickSaveAuthReturnPath('', 1_000 + QUICK_SAVE_AUTH_RETURN_TTL_MS)).toBeNull();
  });

  it('完成回跳后可以显式清除一次性意图', () => {
    rememberQuickSaveAuthReturnPath('/quick-save?t=LightNote');
    clearQuickSaveAuthReturnPath();

    expect(resolveQuickSaveAuthReturnPath('')).toBeNull();
  });
});
