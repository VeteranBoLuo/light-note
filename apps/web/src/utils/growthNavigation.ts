import type { RouteLocationRaw } from 'vue-router';
import { resolvePendingResourcesRoute } from '@/utils/resourceNavigation';

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
