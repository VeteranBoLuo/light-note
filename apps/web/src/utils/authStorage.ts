import { UserPreferences } from '@/utils/preferences';

const PREVIEW_FLAG_KEY = 'adminLoginPreview';
const PREVIEW_TOKEN_KEY = 'adminContextToken';
const PREVIEW_PREFERENCES_KEY = 'adminLoginPreviewPreferences';

export const ADMIN_LOGIN_PREVIEW_FRAME_NAME = 'admin-login-preview-frame';

export function isAdminLoginPreview(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const hasPreviewQuery = new URLSearchParams(window.location.search).get(PREVIEW_FLAG_KEY) === '1';
  const isNamedPreviewFrame = window.name === ADMIN_LOGIN_PREVIEW_FRAME_NAME;
  const isMarkedPreviewFrame = window.self !== window.top && window.sessionStorage.getItem(PREVIEW_FLAG_KEY) === '1';
  return hasPreviewQuery || isNamedPreviewFrame || isMarkedPreviewFrame;
}

export function getAdminContextToken(): string {
  return isAdminLoginPreview() ? window.sessionStorage.getItem(PREVIEW_TOKEN_KEY) || '' : '';
}

export function getAdminLoginPreviewPreferences(): Partial<UserPreferences> {
  if (!isAdminLoginPreview()) {
    return {};
  }
  try {
    return JSON.parse(window.sessionStorage.getItem(PREVIEW_PREFERENCES_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

export function setAdminLoginPreview(token: string, preferences?: Partial<UserPreferences> | null) {
  window.sessionStorage.setItem(PREVIEW_FLAG_KEY, '1');
  window.sessionStorage.setItem(PREVIEW_TOKEN_KEY, token);
  if (preferences) {
    window.sessionStorage.setItem(PREVIEW_PREFERENCES_KEY, JSON.stringify(preferences));
  } else {
    window.sessionStorage.removeItem(PREVIEW_PREFERENCES_KEY);
  }
}

export function clearAdminLoginPreview() {
  window.sessionStorage.removeItem(PREVIEW_FLAG_KEY);
  window.sessionStorage.removeItem(PREVIEW_TOKEN_KEY);
  window.sessionStorage.removeItem(PREVIEW_PREFERENCES_KEY);
}

export function getAdminLoginPreviewUrl(path = '/home'): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set(PREVIEW_FLAG_KEY, '1');
  url.searchParams.set('t', String(Date.now()));
  return `${url.pathname}${url.search}${url.hash}`;
}

/* ------------------------------------------------------------------ *
 * 「曾登录过」本地标记
 *
 * 用于区分两类「当前是游客」的访客：
 *  - 曾经登录过、只是会话过期的老用户 → 应弹登录框提示重新登录；
 *  - 始终是游客、从未登录过的新访客 → 永不弹登录框，让其自由预览。
 *
 * 不依赖 rememberedSid（仅勾选「记住我」才写入，会漏判没勾选的老用户），
 * 而是登录成功时无条件写入一个独立标记，与「记住我」解耦，登出时也不清除。
 * ------------------------------------------------------------------ */

const LOGGED_IN_KEY = 'hasLoggedInBefore';
// 历史上「记住账号」会写入邮箱，可作为「曾登录」的兼容信号
const REMEMBERED_EMAIL_KEY = 'rememberedLoginEmail';
// 标记有效期，避免公共电脑登录过后长期误弹（30 天）
const LOGGED_IN_TTL = 30 * 24 * 60 * 60 * 1000;

/** 登录成功时调用，记录「这台设备曾登录过」。 */
export function markLoggedIn(): void {
  try {
    localStorage.setItem(LOGGED_IN_KEY, String(Date.now()));
  } catch {
    // localStorage 不可用（隐私模式等）时静默忽略
  }
}

/** 当前设备是否曾登录过（且未超过有效期）。 */
export function hasLoggedInBefore(): boolean {
  try {
    // 双保险：兼容历史上仅写了 rememberedLoginEmail 的老用户
    if (localStorage.getItem(REMEMBERED_EMAIL_KEY)) {
      return true;
    }
    const raw = localStorage.getItem(LOGGED_IN_KEY);
    if (!raw) {
      return false;
    }
    const ts = Number(raw);
    // 非时间戳（如老格式 '1'）也视为曾登录
    if (!Number.isFinite(ts)) {
      return true;
    }
    if (Date.now() - ts > LOGGED_IN_TTL) {
      localStorage.removeItem(LOGGED_IN_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** 清除「曾登录」标记（如登录页的「退出并清除登录记忆」入口）。 */
export function clearLoggedIn(): void {
  try {
    localStorage.removeItem(LOGGED_IN_KEY);
  } catch {
    // 静默忽略
  }
}
