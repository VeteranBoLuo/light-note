import { BOOKMARK_URL_STATE, resolveBookmarkUrlInput } from '@lightnote/shared';
import type { DailyBrief, DailyBriefInsight } from '@/api/dailyBriefApi';
import { resolveResourceRoute } from './resourceNavigation';

const organizeActions = [
  { id: 'organize_ai_pending', label: 'reviewAiSuggestions', route: '/organize?issue=ai_suggestions' },
  { id: 'organize_untagged', label: 'organizeUntagged', route: '/organize?issue=untagged' },
] as const;

/** 只使用结构化事实；审核入口仅接受服务端绑定的整理任务定位；旧简报保留默认入口。 */
export function resolveBriefOrganizeActions(insight: DailyBriefInsight, brief: DailyBrief | null) {
  // 站内导航沿用全局管理员上下文；只读权限由目标接口继续约束。
  const items = brief?.sections?.find((section) => section.id === 'organize')?.items || [];
  return organizeActions
    .filter(
      (action) =>
        insight.factIds.includes(action.id) &&
        items.some(
          (item) =>
            item.id === action.id && typeof item.count === 'number' && Number.isFinite(item.count) && item.count > 0,
        ),
    )
    .map((action) => {
      const item = items.find((item) => item.id === action.id);
      if (action.id !== 'organize_ai_pending' || !item?.route) return action;
      try {
        const url = new URL(item.route, 'https://lightnote.invalid');
        const runId = url.searchParams.get('runId');
        const resourceType = url.searchParams.get('resourceType');
        if (
          url.origin !== 'https://lightnote.invalid' ||
          url.pathname !== '/organize' ||
          url.searchParams.get('review') !== 'pending' ||
          !runId ||
          !/^[a-zA-Z0-9-]{1,64}$/.test(runId) ||
          !['bookmark', 'note', 'file', 'tag'].includes(resourceType || '')
        )
          return action;
        return {
          ...action,
          route: `/organize?issue=ai_suggestions&review=pending&runId=${encodeURIComponent(runId)}&resourceType=${resourceType}`,
        };
      } catch {
        return action;
      }
    });
}

export function resolveBriefSourceTarget(source: NonNullable<DailyBriefInsight['sources']>[number]) {
  if (!source.id) return null;
  if (source.type === 'toolbox_task')
    return { external: null, route: { path: `/toolbox/task/${encodeURIComponent(source.id)}` } };
  if (['research_workspace', 'learning_workspace', 'writing_workspace'].includes(source.type))
    return { external: null, route: { path: `/toolbox/${source.type}`, query: { workspace: source.id } } };
  if (!['bookmark', 'note', 'file'].includes(source.type)) return null;
  if (source.type === 'bookmark') {
    const resolved = resolveBookmarkUrlInput(source.url, { allowTextExtraction: false });
    return resolved.state === BOOKMARK_URL_STATE.VALID || resolved.state === BOOKMARK_URL_STATE.NORMALIZED
      ? { external: resolved.canonicalUrl, route: null }
      : null;
  }
  return { external: null, route: resolveResourceRoute(source, { noteReturnPath: '/workbenches' }) };
}
