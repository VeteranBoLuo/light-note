import type { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg';

const inboxRouter: RouteRecordRaw = {
  path: '/inbox',
  name: 'inbox',
  meta: {
    title: '待整理箱',
    keepAlive: true,
    requireAuth: true,
    roles: ALL_ROLES,
  },
  component: () => import('@/view/inbox/Inbox.vue'),
};

export default inboxRouter;
