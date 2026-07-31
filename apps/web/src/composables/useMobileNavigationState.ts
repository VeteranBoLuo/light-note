import { ref } from 'vue';
import { getMobileResourcePath, isMobileResourcePath, type MobileResourcePath } from '@/config/mobileNavigation';
import { getMobileHomePath, type UserPreferences } from '@/utils/preferences';

// 用 sessionStorage 而不是 localStorage：底部「资料」只在当前会话内记住上次页签，
// 重开 App / 新标签页回到书签，避免上次停在标签页后就再也回不到默认入口。
const LAST_RESOURCE_STORAGE_KEY = 'ln-mobile-last-resource';
const lastMobileResourcePath = ref<MobileResourcePath | null>(readStoredResourcePath());
const resourceScrollPositions = new Map<MobileResourcePath, number>();
const nonPersistentScrollPaths = new Set<MobileResourcePath>(['/noteLibrary']);

function readStoredResourcePath(): MobileResourcePath | null {
  try {
    // 早期版本把它存在 localStorage，改成会话级后清掉残留，避免长期占用本地存储
    localStorage.removeItem(LAST_RESOURCE_STORAGE_KEY);
    const value = sessionStorage.getItem(LAST_RESOURCE_STORAGE_KEY);
    return isMobileResourcePath(value) ? value : null;
  } catch {
    return null;
  }
}

function findResourceScrollElement(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-mobile-resource-scroll]'));
  return (
    candidates.find((element) => {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    }) || null
  );
}

function setLastMobileResourcePath(path: MobileResourcePath) {
  lastMobileResourcePath.value = path;
  try {
    sessionStorage.setItem(LAST_RESOURCE_STORAGE_KEY, path);
  } catch {
    // 隐私模式或存储空间不可用时保留当前会话内状态。
  }
}

function rememberResourceFromRoute(routeName: unknown) {
  const path = getMobileResourcePath(routeName);
  if (path) setLastMobileResourcePath(path);
  return path;
}

export function getLastMobileResourcePath(fallback: string): MobileResourcePath {
  if (lastMobileResourcePath.value) return lastMobileResourcePath.value;
  return isMobileResourcePath(fallback) ? fallback : '/home';
}

/**
 * 底部「资料」入口的落点。
 *
 * 移动端首页固定为「今日」，资料区不再读账号首页偏好：
 * 当前会话内回到上次打开的资料页签，新会话（重开 App）重置为书签。
 */
export function getMobileResourceEntryPath(): MobileResourcePath {
  return getLastMobileResourcePath('/home');
}

function saveResourceScroll(path: MobileResourcePath | null) {
  if (!path) return;
  if (nonPersistentScrollPaths.has(path)) {
    resourceScrollPositions.delete(path);
    return;
  }
  const element = findResourceScrollElement();
  if (element) resourceScrollPositions.set(path, element.scrollTop);
}

function restoreResourceScroll(path: MobileResourcePath | null) {
  if (!path) return false;
  if (nonPersistentScrollPaths.has(path)) {
    const element = findResourceScrollElement();
    if (!element) return false;
    element.scrollTop = 0;
    return true;
  }
  const top = resourceScrollPositions.get(path);
  if (top == null) return false;
  const element = findResourceScrollElement();
  if (!element) return false;
  element.scrollTop = top;
  return Math.abs(element.scrollTop - top) <= 1;
}

function scrollCurrentResourceToTop() {
  const element = findResourceScrollElement();
  if (!element) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function resetCurrentResourceScroll() {
  const element = findResourceScrollElement();
  if (element) element.scrollTop = 0;
}

export function useMobileNavigationState() {
  return {
    lastMobileResourcePath,
    getLastMobileResourcePath,
    rememberResourceFromRoute,
    setLastMobileResourcePath,
    saveResourceScroll,
    restoreResourceScroll,
    scrollCurrentResourceToTop,
    resetCurrentResourceScroll,
  };
}
