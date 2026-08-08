import { resolveBookmarkUrlInput } from '@lightnote/shared';

const XHS_SHORT_LINK_HOSTS = new Set(['xhslink.cn', 'www.xhslink.cn', 'xhslink.com', 'www.xhslink.com']);

/**
 * 卡片只展示站点身份，不展示短链服务商。旧数据仍保留原始短链用于跳转，
 * 但已知的小红书分享域名统一显示为真实站点域名。
 */
export function getBookmarkDisplayDomain(rawUrl: string): string {
  const canonicalUrl = resolveBookmarkUrlInput(rawUrl, { allowTextExtraction: false }).canonicalUrl;
  try {
    const hostname = new URL(canonicalUrl).hostname.toLowerCase();
    if (XHS_SHORT_LINK_HOSTS.has(hostname)) return 'xiaohongshu.com';
    return hostname.replace(/^www\./, '');
  } catch {
    return String(rawUrl || '');
  }
}
