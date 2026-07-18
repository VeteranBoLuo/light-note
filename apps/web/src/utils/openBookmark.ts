import { useUserStore } from '@/store';
import { resolveBookmarkUrlInput } from '@lightnote/shared';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import i18n from '@/i18n';

function normalizeUrl(url: string): string {
  return resolveBookmarkUrlInput(url, { allowTextExtraction: false }).canonicalUrl;
}

/**
 * 统一的书签外链打开入口。
 * 按用户偏好 openBookmarkIn 决定打开方式:'newTab'(默认,新标签页)/ 'current'(当前标签页)。
 * 收口原先散落在首页卡片 / 全局搜索 / 资源中心 / 工作台 / 标签详情 / 图谱各处的
 * window.open(url, '_blank'),让「设置 - 书签打开方式」一处生效、行为一致。
 */
export function openBookmarkUrl(url: string): void {
  const finalUrl = normalizeUrl(url);
  if (!finalUrl) {
    message.warning(i18n.global.t('bookmarkUrl.invalid'));
    return;
  }
  const openInCurrent = (useUserStore().preferences as any)?.openBookmarkIn === 'current';
  if (openInCurrent) {
    window.location.href = finalUrl;
  } else {
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  }
}
