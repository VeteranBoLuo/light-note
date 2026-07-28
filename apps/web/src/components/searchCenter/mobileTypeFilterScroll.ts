import type { SearchType } from '@/api/search';

interface MobileTypeFilterMetrics {
  maxScroll: number;
  viewportWidth: number;
  activeOffsetLeft: number;
  activeWidth: number;
}

export function resolveMobileTypeFilterScrollLeft(type: SearchType | 'all', metrics: MobileTypeFilterMetrics): number {
  const maxScroll = Math.max(0, metrics.maxScroll);
  if (type === 'all' || type === 'bookmark') return 0;
  if (type === 'file' || type === 'tag') return maxScroll;

  const centeredLeft = metrics.activeOffsetLeft - (metrics.viewportWidth - metrics.activeWidth) / 2;
  return Math.min(maxScroll, Math.max(0, centeredLeft));
}
