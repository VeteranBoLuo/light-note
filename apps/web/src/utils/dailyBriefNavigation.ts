import { BOOKMARK_URL_STATE, resolveBookmarkUrlInput } from '@lightnote/shared';
import type { DailyBriefInsight } from '@/api/dailyBriefApi';
import { resolveResourceRoute } from './resourceNavigation';

export function resolveBriefSourceTarget(source: NonNullable<DailyBriefInsight['sources']>[number]) {
  if (!source.id || !['bookmark', 'note', 'file'].includes(source.type)) return null;
  if (source.type === 'bookmark') {
    const resolved = resolveBookmarkUrlInput(source.url, { allowTextExtraction: false });
    return resolved.state === BOOKMARK_URL_STATE.VALID || resolved.state === BOOKMARK_URL_STATE.NORMALIZED
      ? { external: resolved.canonicalUrl, route: null }
      : null;
  }
  return { external: null, route: resolveResourceRoute(source, { noteReturnPath: '/workbenches' }) };
}
