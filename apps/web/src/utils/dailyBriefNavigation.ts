import { BOOKMARK_URL_STATE, resolveBookmarkUrlInput } from '@lightnote/shared';
import type { DailyBrief, DailyBriefInsight } from '@/api/dailyBriefApi';
import { resolveResourceRoute } from './resourceNavigation';

const organizeActions = [
  { id: 'organize_ai_pending', label: 'reviewAiSuggestions', route: '/organize?issue=ai_suggestions' },
  { id: 'organize_untagged', label: 'organizeUntagged', route: '/organize?issue=untagged' },
] as const;

/** 只使用结构化事实；旧简报入口打开最新列表，不携带过期数量或模型生成的地址。 */
export function resolveBriefOrganizeActions(insight: DailyBriefInsight, brief: DailyBrief | null, readOnly = false) {
  // 管理员代看不提供会离开当前账号上下文的操作入口。
  if (readOnly) return [];
  const items = brief?.sections?.find((section) => section.id === 'organize')?.items || [];
  return organizeActions.filter(
    (action) =>
      insight.factIds.includes(action.id) &&
      items.some(
        (item) =>
          item.id === action.id && typeof item.count === 'number' && Number.isFinite(item.count) && item.count > 0,
      ),
  );
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
