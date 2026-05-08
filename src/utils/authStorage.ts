import { UserPreferences } from '@/utils/preferences';

const PREVIEW_FLAG_KEY = 'adminLoginPreview';
const PREVIEW_USER_ID_KEY = 'adminLoginPreviewUserId';
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

export function getAdminLoginPreviewUserId(): string {
  return isAdminLoginPreview() ? window.sessionStorage.getItem(PREVIEW_USER_ID_KEY) || '' : '';
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

export function setAdminLoginPreview(userId: string, preferences?: Partial<UserPreferences> | null) {
  window.sessionStorage.setItem(PREVIEW_FLAG_KEY, '1');
  window.sessionStorage.setItem(PREVIEW_USER_ID_KEY, userId);
  if (preferences) {
    window.sessionStorage.setItem(PREVIEW_PREFERENCES_KEY, JSON.stringify(preferences));
  } else {
    window.sessionStorage.removeItem(PREVIEW_PREFERENCES_KEY);
  }
}

export function clearAdminLoginPreview() {
  window.sessionStorage.removeItem(PREVIEW_FLAG_KEY);
  window.sessionStorage.removeItem(PREVIEW_USER_ID_KEY);
  window.sessionStorage.removeItem(PREVIEW_PREFERENCES_KEY);
}

export function getAdminLoginPreviewUrl(path = '/home'): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set(PREVIEW_FLAG_KEY, '1');
  url.searchParams.set('t', String(Date.now()));
  return `${url.pathname}${url.search}${url.hash}`;
}
