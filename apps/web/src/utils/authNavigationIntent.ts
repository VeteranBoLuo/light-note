const AUTH_NAVIGATION_INTENT_STORAGE_KEY = 'light-note:auth-navigation-intent:v1';
const AUTH_NAVIGATION_INTENT_MAX_AGE_MS = 60 * 60 * 1000;

export interface AuthNavigationIntent {
  target: string;
  createdAt: number;
}

export type AnonymousProtectedNavigationMode = 'prompt' | 'redirect';
export type RouteAuthDecision = 'allow' | 'prompt-auth' | 'guest-home' | 'forbidden';

let memoryIntent: AuthNavigationIntent | null = null;

function currentOrigin(): string {
  return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://light-note.local';
}

function sessionStorageOrNull(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * 认证成功后的回跳只接受同源应用路径，避免把登录弹窗变成开放重定向入口。
 */
export function normalizeAuthNavigationTarget(value: unknown, origin = currentOrigin()): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), origin);
    if (url.origin !== origin) return null;
    const target = `${url.pathname}${url.search}${url.hash}`;
    if (!target.startsWith('/') || target.startsWith('//')) return null;
    if (url.pathname === '/login' || url.pathname === '/auth/callback') return null;
    return target;
  } catch {
    return null;
  }
}

export function rememberAuthNavigationIntent(target: unknown, now = Date.now()): boolean {
  const normalizedTarget = normalizeAuthNavigationTarget(target);
  if (!normalizedTarget) return false;

  const intent: AuthNavigationIntent = {
    target: normalizedTarget,
    createdAt: now,
  };
  memoryIntent = intent;
  try {
    sessionStorageOrNull()?.setItem(AUTH_NAVIGATION_INTENT_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // 隐私模式禁用 sessionStorage 时保留当前 SPA 会话内的内存回跳。
  }
  return true;
}

export function clearAuthNavigationIntent(): void {
  memoryIntent = null;
  try {
    sessionStorageOrNull()?.removeItem(AUTH_NAVIGATION_INTENT_STORAGE_KEY);
  } catch {
    // 清理失败时仍已清空内存事实；持久值下次读取还会经过时效和同源校验。
  }
}

export function resolveAuthNavigationIntent(now = Date.now()): string | null {
  let intent = memoryIntent;
  if (!intent) {
    try {
      const raw = sessionStorageOrNull()?.getItem(AUTH_NAVIGATION_INTENT_STORAGE_KEY);
      intent = raw ? (JSON.parse(raw) as AuthNavigationIntent) : null;
    } catch {
      intent = null;
    }
  }

  const createdAt = Number(intent?.createdAt || 0);
  const target = normalizeAuthNavigationTarget(intent?.target);
  if (!target || !createdAt || now - createdAt < 0 || now - createdAt > AUTH_NAVIGATION_INTENT_MAX_AGE_MS) {
    clearAuthNavigationIntent();
    return null;
  }
  memoryIntent = { target, createdAt };
  return target;
}

/**
 * 只有已经进入应用后由用户再次发起的受保护导航，才在原页面上打开认证弹窗。
 * 冷启动/被动会话恢复没有明确点击上下文，继续走游客首页，避免自动弹框。
 */
export function resolveAnonymousProtectedNavigationMode(options: {
  fromRouteName?: unknown;
  fromMatchedCount?: number;
  visitorWorkspace?: boolean;
}): AnonymousProtectedNavigationMode {
  if (options.visitorWorkspace) return 'redirect';
  return options.fromRouteName || Number(options.fromMatchedCount || 0) > 0 ? 'prompt' : 'redirect';
}

export function resolveRouteAuthDecision(options: {
  requiredRoles: readonly string[];
  userId?: unknown;
  userRole?: unknown;
  visitorWorkspace?: boolean;
  fromRouteName?: unknown;
  fromMatchedCount?: number;
}): RouteAuthDecision {
  const requiredRoles = options.requiredRoles.map((role) => String(role));
  const userRole = String(options.userRole || 'visitor');
  if (requiredRoles.length === 0 || requiredRoles.includes('visitor') || requiredRoles.includes(userRole)) {
    return 'allow';
  }

  const isGuest = !String(options.userId || '').trim() || userRole === 'visitor';
  if (!isGuest) return 'forbidden';
  // Root 专属入口不会因游客点击而诱导普通账号登录；只有登录后确实可进入的普通私有页才建立认证意图。
  if (!requiredRoles.includes('user') && !requiredRoles.includes('test')) return 'guest-home';

  return resolveAnonymousProtectedNavigationMode(options) === 'prompt' ? 'prompt-auth' : 'guest-home';
}
