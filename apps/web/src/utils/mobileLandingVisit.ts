import { MOBILE_LANDING_VISIT_STORAGE_KEY } from '@/config/appEntryBootstrap.ts';

/** 当前浏览器是否已经完整展示过一次移动官网。 */
export function hasVisitedMobileLanding(): boolean {
  try {
    return localStorage.getItem(MOBILE_LANDING_VISIT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 在移动官网真正挂载后记录首访。
 * 不在 <head> 守卫里提前写，避免首次访问在同一轮路由初始化中被误判为回访。
 */
export function markMobileLandingVisited(): void {
  try {
    localStorage.setItem(MOBILE_LANDING_VISIT_STORAGE_KEY, '1');
  } catch {
    // 隐私模式或禁用存储时保持 fail-open；官网仍然可访问。
  }
}
