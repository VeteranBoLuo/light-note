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
export interface OpenBookmarkUrlOptions {
  /**
   * 地址完成校验、真正切页之前同步执行。用于发起不能因页面卸载而丢失的轻量旁路写入；
   * 回调抛错也不能阻断用户打开内容。
   */
  beforeNavigate?: (target: { url: string; openInCurrent: boolean }) => void;
}

export function openBookmarkUrl(url: string, options: OpenBookmarkUrlOptions = {}): boolean {
  const finalUrl = normalizeUrl(url);
  if (!finalUrl) {
    message.warning(i18n.global.t('bookmarkUrl.invalid'));
    return false;
  }
  const openInCurrent = (useUserStore().preferences as any)?.openBookmarkIn === 'current';
  try {
    options.beforeNavigate?.({ url: finalUrl, openInCurrent });
  } catch (error) {
    console.warn('书签打开前旁路操作失败:', error);
  }
  if (openInCurrent) {
    window.location.href = finalUrl;
  } else {
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  }
  return true;
}
