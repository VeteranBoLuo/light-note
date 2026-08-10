export interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

export interface LargeFeaturePreloadContext {
  mobile: boolean;
  online: boolean;
  visibilityState: DocumentVisibilityState | string;
  connection?: NetworkInformationLike | null;
}

const CONSTRAINED_CONNECTIONS = new Set(['slow-2g', '2g']);

/**
 * 大型功能只能在“用户当前无感、网络也有余量”时后台预热。
 * 移动端和省流/弱网下，后台下载会与用户刚点击的页面争抢带宽，反而放大“点了没反应”。
 */
export function shouldPreloadLargeFeature(context: LargeFeaturePreloadContext): boolean {
  if (context.mobile || !context.online || context.visibilityState !== 'visible') return false;
  if (context.connection?.saveData) return false;
  return !CONSTRAINED_CONNECTIONS.has(String(context.connection?.effectiveType || '').toLowerCase());
}
