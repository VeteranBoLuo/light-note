import { describe, expect, it } from 'vitest';
import { hasLoginPassword } from './loginPasswordState.js';
describe('独立登录密码状态', () => {
  it('GitHub 随机密码不视为已设置', () => {
    expect(hasLoginPassword({ password: 'random-hash', login_type: 'github', login_password_set: 0 })).toBe(false);
  });
  it('GitHub 关联账号自行设置的密码保留', () => {
    expect(hasLoginPassword({ password: 'hash', login_type: 'github', login_password_set: 1 })).toBe(true);
  });
  it('不能猜测历史 GitHub 密码的来源', () => {
    expect(hasLoginPassword({ password: 'hash', login_type: 'github', login_password_set: null })).toBeNull();
  });
  it('历史邮箱账号与无密码账号可以明确区分', () => {
    expect(hasLoginPassword({ password: 'hash', login_type: 'local' })).toBe(true);
    expect(hasLoginPassword({ password: null, login_type: 'github' })).toBe(false);
  });
});
