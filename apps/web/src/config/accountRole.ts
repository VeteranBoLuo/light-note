export type AccountRoleKind = 'root' | 'user' | 'visitor' | 'test';

const ACCOUNT_ROLE_LABEL_KEYS: Record<AccountRoleKind, string> = {
  root: 'myInfo.root',
  user: 'myInfo.user',
  visitor: 'myInfo.visitor',
  test: 'myInfo.test',
};

export function resolveAccountRoleKind(role: unknown, userId: unknown): AccountRoleKind {
  const normalizedRole = String(role ?? '')
    .trim()
    .toLowerCase();

  if (
    normalizedRole === 'root' ||
    normalizedRole === 'user' ||
    normalizedRole === 'visitor' ||
    normalizedRole === 'test'
  ) {
    return normalizedRole;
  }

  // 权限仍由服务端原始 role 判断；这里仅负责稳定展示。
  // 已登录账号遇到历史值或资料接口暂未返回 role 时，按普通用户展示。
  return String(userId ?? '').trim() ? 'user' : 'visitor';
}

export function resolveAccountRoleLabelKey(role: unknown, userId: unknown): string {
  return ACCOUNT_ROLE_LABEL_KEYS[resolveAccountRoleKind(role, userId)];
}
