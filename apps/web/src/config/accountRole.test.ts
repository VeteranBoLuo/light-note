import { describe, expect, it } from 'vitest';
import { resolveAccountRoleKind } from './accountRole';

describe('resolveAccountRoleKind', () => {
  it.each([
    ['root', 'root'],
    [' ROOT ', 'root'],
    ['admin', 'admin'],
    ['visitor', 'visitor'],
  ])('保留明确的系统角色 %s', (role, expected) => {
    expect(resolveAccountRoleKind(role, 'user-1')).toBe(expected);
  });

  it.each(['user', 'member', 'normal', '', undefined])('已登录账号的普通或历史角色 %s 统一展示为成员', (role) => {
    expect(resolveAccountRoleKind(role, 'user-1')).toBe('member');
  });

  it('没有登录身份时回退为游客', () => {
    expect(resolveAccountRoleKind(undefined, '')).toBe('visitor');
  });
});
