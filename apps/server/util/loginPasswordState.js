// NULL 表示历史 GitHub 哈希来源不可判定；不能因此禁用或覆盖用户已有密码。
export function hasLoginPassword(user) {
  if (user?.login_password_set != null) return Number(user.login_password_set) === 1;
  if (!user?.password) return false;
  return user.login_type === 'github' ? null : true;
}
