import { useUserStore } from '@/store';

/** 裸域名归一化:无协议头则补 https://(与各调用点原先的处理一致) */
function normalizeUrl(url: string): string {
  const u = String(url || '').trim();
  if (!u) return u;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/**
 * 统一的书签外链打开入口。
 * 按用户偏好 openBookmarkIn 决定打开方式:'newTab'(默认,新标签页)/ 'current'(当前标签页)。
 * 收口原先散落在首页卡片 / 全局搜索 / 资源中心 / 工作台 / 标签详情 / 图谱各处的
 * window.open(url, '_blank'),让「设置 - 书签打开方式」一处生效、行为一致。
 */
export function openBookmarkUrl(url: string): void {
  const finalUrl = normalizeUrl(url);
  if (!finalUrl) return;
  const openInCurrent = (useUserStore().preferences as any)?.openBookmarkIn === 'current';
  if (openInCurrent) {
    window.location.href = finalUrl;
  } else {
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  }
}
