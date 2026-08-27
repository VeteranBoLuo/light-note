const EXTENSION_AUTH_RETURN_STORAGE_KEY = 'ln-extension-auth-return';
export const EXTENSION_AUTH_RETURN_TTL_MS = 15 * 60 * 1000;
const MAX_EXTENSION_RETURN_PATH_LENGTH = 8_000;

interface StoredExtensionAuthReturn {
  path: string;
  expiresAt: number;
}

function currentOrigin(): string {
  return window.location.origin;
}

export function normalizeExtensionAuthReturnPath(value: unknown, origin = currentOrigin()): string | null {
  if (typeof value !== 'string' || !value || value.length > MAX_EXTENSION_RETURN_PATH_LENGTH) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname !== '/extension/authorize' || url.username || url.password) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function rememberExtensionAuthReturnPath(value: unknown, now = Date.now()): string | null {
  const path = normalizeExtensionAuthReturnPath(value);
  if (!path) return null;
  const stored: StoredExtensionAuthReturn = {
    path,
    expiresAt: now + EXTENSION_AUTH_RETURN_TTL_MS,
  };
  try {
    sessionStorage.setItem(EXTENSION_AUTH_RETURN_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // 会话存储不可用时，邮箱登录仍停留在当前授权页；GitHub 登录按默认入口兜底。
  }
  return path;
}

export function resolveExtensionAuthReturnPath(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(EXTENSION_AUTH_RETURN_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredExtensionAuthReturn>;
    const path = normalizeExtensionAuthReturnPath(stored.path);
    if (!path || typeof stored.expiresAt !== 'number' || stored.expiresAt <= now) {
      sessionStorage.removeItem(EXTENSION_AUTH_RETURN_STORAGE_KEY);
      return null;
    }
    return path;
  } catch {
    try {
      sessionStorage.removeItem(EXTENSION_AUTH_RETURN_STORAGE_KEY);
    } catch {
      // 存储不可用时直接使用默认登录落点。
    }
    return null;
  }
}

export function clearExtensionAuthReturnPath(): void {
  try {
    sessionStorage.removeItem(EXTENSION_AUTH_RETURN_STORAGE_KEY);
  } catch {
    // 存储不可用时无需清理。
  }
}
