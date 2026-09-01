import type { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg';
import { isMobileResourceInboxTab } from '@/config/mobileNavigation';
import { isMobileViewport } from '@/config/responsive';

const inboxRouter: RouteRecordRaw = {
  path: '/inbox',
  name: 'inbox',
  meta: {
    title: '待办',
    keepAlive: true,
    requireAuth: true,
    roles: ALL_ROLES,
    mobileShell: 'todo',
    mobileBottomNav: true,
  },
  beforeEnter: (to) => {
    const tab = String(to.query.tab || '');
    // Todo 继续使用原路由；todoId 是来自全局搜索的直达入口，也必须保留。
    if (tab === 'todo' || to.query.todoId) return true;
    if (isMobileResourceInboxTab(tab)) {
      return {
        path: '/organize',
        query: {
          issue: 'pending',
          ...(tab === 'all' ? {} : { resourceType: tab }),
        },
        replace: true,
      };
    }
    // 历史桌面 /inbox 默认是资源待整理；移动端无 query 的 /inbox 是底部“待办”。
    const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
    if (!isMobileViewport(viewportWidth)) {
      return { path: '/organize', query: { issue: 'pending' }, replace: true };
    }
    return true;
  },
  component: () => import('@/view/inbox/Inbox.vue'),
};

export default inboxRouter;
