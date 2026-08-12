export type AccountRoleKind = 'root' | 'admin' | 'visitor' | 'member';

export function resolveAccountRoleKind(role: unknown, userId: unknown): AccountRoleKind {
  const normalizedRole = String(role ?? '')
    .trim()
    .toLowerCase();

  if (normalizedRole === 'root' || normalizedRole === 'admin' || normalizedRole === 'visitor') {
    return normalizedRole;
  }

  // 权限仍由服务端原始 role 判断；这里仅负责稳定展示。
  // 已登录账号遇到历史值、大小写差异或资料接口暂未返回 role 时，按普通成员展示。
  return String(userId ?? '').trim() ? 'member' : 'visitor';
}
