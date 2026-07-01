import { useUserStore } from '@/store';

/**
 * 本地应用并持久化用户偏好(主题/语言/视图模式等),不触发后端。
 * 游客换主题/语言/视图时用:偏好本地生效并存 localStorage(本浏览器留存),
 * 但不调 saveUserInfo(游客写接口会被 ensureNotVisitor 拦成 'preview' 而误弹注册墙)。
 */
export function applyPreferenceLocally(patch: Record<string, any>): void {
  const user = useUserStore();
  user.preferences = { ...user.preferences, ...patch };
  try {
    localStorage.setItem('preferences', JSON.stringify(user.preferences));
  } catch {
    /* 隐私模式下 localStorage 不可用,忽略 */
  }
}

/** 是否游客(未登录或 visitor 角色)。用于决定偏好是否同步到服务器。 */
export function isGuestUser(): boolean {
  const user = useUserStore();
  return !user.id || user.role === 'visitor';
}
