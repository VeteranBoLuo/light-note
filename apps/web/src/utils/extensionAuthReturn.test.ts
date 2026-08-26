// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EXTENSION_AUTH_RETURN_TTL_MS,
  clearExtensionAuthReturnPath,
  normalizeExtensionAuthReturnPath,
  rememberExtensionAuthReturnPath,
  resolveExtensionAuthReturnPath,
} from './extensionAuthReturn';

describe('浏览器插件网站授权登录回跳', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/extension/authorize');
    sessionStorage.clear();
  });

  it('只接受当前站点的插件授权路由，拒绝开放重定向', () => {
    const path = '/extension/authorize?client_id=abcdefghijklmnopabcdefghijklmnop&state=state_value_12345678901234567890';
    expect(normalizeExtensionAuthReturnPath(path)).toBe(path);
    expect(normalizeExtensionAuthReturnPath('/quick-save')).toBeNull();
    expect(normalizeExtensionAuthReturnPath('https://evil.example/extension/authorize')).toBeNull();
    expect(normalizeExtensionAuthReturnPath('//evil.example/extension/authorize')).toBeNull();
  });

  it('跨 GitHub OAuth 保留完整授权参数，并在过期后清理', () => {
    const path = '/extension/authorize?client_id=abcdefghijklmnopabcdefghijklmnop&code_challenge=challenge';
    rememberExtensionAuthReturnPath(path, 1_000);
    expect(resolveExtensionAuthReturnPath(1_001)).toBe(path);
    expect(resolveExtensionAuthReturnPath(1_000 + EXTENSION_AUTH_RETURN_TTL_MS)).toBeNull();
  });

  it('完成授权回跳后可以显式清除意图', () => {
    rememberExtensionAuthReturnPath('/extension/authorize?state=state_value_12345678901234567890');
    clearExtensionAuthReturnPath();
    expect(resolveExtensionAuthReturnPath()).toBeNull();
  });
});
