const QUICK_SAVE_AUTH_RETURN_STORAGE_KEY = 'ln-quick-save-auth-return';
export const QUICK_SAVE_AUTH_RETURN_TTL_MS = 30 * 60 * 1000;
const MAX_QUICK_SAVE_RETURN_PATH_LENGTH = 20_000;

interface StoredQuickSaveAuthReturn {
  path: string;
  expiresAt: number;
}

function getCurrentOrigin(): string {
  return window.location.origin;
}

export function normalizeQuickSaveAuthReturnPath(value: unknown, origin = getCurrentOrigin()): string | null {
  if (typeof value !== 'string' || !value || value.length > MAX_QUICK_SAVE_RETURN_PATH_LENGTH) return null;

  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname !== '/quick-save' || url.username || url.password) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function getQuickSaveAuthReturnFromLoginSearch(
  search = window.location.search,
  origin = getCurrentOrigin(),
): string | null {
  try {
    return normalizeQuickSaveAuthReturnPath(new URLSearchParams(search).get('redirect'), origin);
  } catch {
    return null;
  }
}

export function rememberQuickSaveAuthReturnPath(value: unknown, now = Date.now()): string | null {
  const path = normalizeQuickSaveAuthReturnPath(value);
  if (!path) return null;

  const stored: StoredQuickSaveAuthReturn = {
    path,
    expiresAt: now + QUICK_SAVE_AUTH_RETURN_TTL_MS,
  };
  try {
    sessionStorage.setItem(QUICK_SAVE_AUTH_RETURN_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // 邮箱登录仍可从 /login?redirect=... 恢复；禁用会话存储时 GitHub OAuth 按默认入口兜底。
  }
  return path;
}

function getStoredQuickSaveAuthReturnPath(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(QUICK_SAVE_AUTH_RETURN_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredQuickSaveAuthReturn>;
    const path = normalizeQuickSaveAuthReturnPath(stored.path);
    if (!path || typeof stored.expiresAt !== 'number' || stored.expiresAt <= now) {
      sessionStorage.removeItem(QUICK_SAVE_AUTH_RETURN_STORAGE_KEY);
      return null;
    }
    return path;
  } catch {
    try {
      sessionStorage.removeItem(QUICK_SAVE_AUTH_RETURN_STORAGE_KEY);
    } catch {
      // 会话存储不可用时直接使用默认登录落点。
    }
    return null;
  }
}

export function resolveQuickSaveAuthReturnPath(search = window.location.search, now = Date.now()): string | null {
  return getQuickSaveAuthReturnFromLoginSearch(search) || getStoredQuickSaveAuthReturnPath(now);
}

export function clearQuickSaveAuthReturnPath(): void {
  try {
    sessionStorage.removeItem(QUICK_SAVE_AUTH_RETURN_STORAGE_KEY);
  } catch {
    // 会话存储不可用时无需清理。
  }
}
