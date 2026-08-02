import { ref } from 'vue';
import { getMobileResourcePath, isMobileResourcePath, type MobileResourcePath } from '@/config/mobileNavigation';
import { getMobileHomePath, type UserPreferences } from '@/utils/preferences';

// 用 sessionStorage 而不是 localStorage：底部「资料」只在当前会话内记住上次页签，
// 重开 App / 新标签页回到书签，避免上次停在标签页后就再也回不到默认入口。
const LAST_RESOURCE_STORAGE_KEY = 'ln-mobile-last-resource';
const lastMobileResourcePath = ref<MobileResourcePath | null>(readStoredResourcePath());

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

function resetResourceScroll(path: MobileResourcePath | null) {
  if (!path) return false;
  const element = findResourceScrollElement();
  if (!element) return false;
  // 不跨资料 Tab 记忆滚动位置。每个 Tab 都从自己的顶部开始，避免把上一页的阅读位置
  // 带到结构完全不同的书签、笔记、云空间或标签页面。
  element.scrollTop = 0;
  return true;
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

function resetMobilePrimaryScroll() {
  const shell = document.querySelector<HTMLElement>('.mobile-app-shell__content');
  if (!shell) return;
  const candidates = [
    shell,
    ...Array.from(
      shell.querySelectorAll<HTMLElement>('[data-mobile-primary-scroll], [data-mobile-resource-scroll]'),
    ),
  ];
  candidates.forEach((element) => {
    element.scrollTop = 0;
  });
}

export function useMobileNavigationState() {
  return {
    lastMobileResourcePath,
    getLastMobileResourcePath,
    rememberResourceFromRoute,
    setLastMobileResourcePath,
    resetResourceScroll,
    scrollCurrentResourceToTop,
    resetCurrentResourceScroll,
    resetMobilePrimaryScroll,
  };
}
