import type { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg';

/**
 * 用户通知属于需要筛选、分组和滚动浏览的完整信息页。移动端独立成页，
 * 不挂主导航壳，避免把接近全屏的内容伪装成底部抽屉。
 */
const notificationsRouter: RouteRecordRaw = {
  path: '/notifications',
  name: 'notifications',
  meta: {
    title: '通知',
    requireAuth: true,
    roles: ALL_ROLES,
  },
  component: () => import('@/view/notifications/Notifications.vue'),
};

export default notificationsRouter;
