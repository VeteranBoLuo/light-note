import type { RouteLocationRaw } from 'vue-router';
import { resolvePendingResourcesRoute } from '@/utils/resourceNavigation';
import type { GrowthNextAction } from '@/composables/useGrowth';

/** 周挑战建议展示的是挑战进度，其余建议按具体动作前往业务入口。 */
export function growthNextActionCommand(item: GrowthNextAction): string {
  return item.type === 'weekly_challenge' ? 'open_weekly_challenges' : item.action;
}

/** 工作台和成长中心共用的建议目的地；个人资料由调用方打开对应端的入口。 */
export function resolveGrowthActionRoute(action: string, isMobile: boolean): RouteLocationRaw | null {
  if (action === 'create_note') return '/noteLibrary';
  if (action === 'create_bookmark') return '/home';
  if (action === 'upload_file') return '/cloudSpace';
  if (action === 'create_todo' || action === 'open_todos') return { path: '/inbox', query: { tab: 'todo' } };
  if (action === 'open_inbox') return resolvePendingResourcesRoute(isMobile);
  if (action === 'checkin') return { path: '/growth', query: { section: 'overview' } };
  if (action === 'open_weekly_challenges') {
    return { path: '/growth', query: { section: 'tasks' }, hash: '#growth-weekly' };
  }
  if (action === 'open_growth_tasks') return { path: '/growth', query: { section: 'tasks' }, hash: '#growth-tasks' };
  if (action === 'open_weekly_report') return { path: '/growth', query: { section: 'overview', report: 'weekly' } };
  return null;
}

/** 每日任务“去完成”的统一目的地，供成长中心和各端工作台共同使用。 */
export function resolveDailyQuestRoute(key: string, isMobile: boolean): RouteLocationRaw | null {
  if (key === 'create' || key === 'daily_note' || key === 'knowledge_action_1' || key === 'knowledge_action_2') {
    return '/noteLibrary';
  }
  if (key === 'daily_bookmark') return '/home';
  if (key === 'daily_file') return '/cloudSpace';
  if (key === 'daily_todo_create' || key === 'daily_todo') {
    return { path: '/inbox', query: { tab: 'todo' } };
  }
  if (key === 'daily_organize') return resolvePendingResourcesRoute(isMobile);
  return null;
}
