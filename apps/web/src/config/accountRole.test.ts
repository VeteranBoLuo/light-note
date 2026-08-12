import { describe, expect, it } from 'vitest';
import { resolveAccountRoleKind, resolveAccountRoleLabelKey } from './accountRole';

describe('resolveAccountRoleKind', () => {
  it.each([
    ['root', 'root'],
    [' ROOT ', 'root'],
    ['user', 'user'],
    ['visitor', 'visitor'],
    ['test', 'test'],
  ])('保留明确的系统角色 %s', (role, expected) => {
    expect(resolveAccountRoleKind(role, 'user-1')).toBe(expected);
  });

  it.each(['admin', 'member', 'normal', '', undefined])('已登录账号的未知或历史角色 %s 回退为普通用户', (role) => {
    expect(resolveAccountRoleKind(role, 'user-1')).toBe('user');
  });

  it('没有登录身份时回退为游客', () => {
    expect(resolveAccountRoleKind(undefined, '')).toBe('visitor');
  });

  it.each([
    ['root', 'myInfo.root'],
    ['user', 'myInfo.user'],
    ['visitor', 'myInfo.visitor'],
    ['test', 'myInfo.test'],
  ])('为平台角色 %s 返回唯一的资料页文案键', (role, expected) => {
    expect(resolveAccountRoleLabelKey(role, 'user-1')).toBe(expected);
  });
});
