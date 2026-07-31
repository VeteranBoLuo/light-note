import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const searchRouter: RouteRecordRaw = {
  meta: {
    title: '资源中心',
    keepAlive: true,
    requireAuth: true,
    roles: ALL_ROLES,
    // 资源中心是「统一查找 + 待整理」，属于资料处理，不再是独立的搜索一级入口
    mobileShell: 'resources',
    mobileBottomNav: true,
  },
  path: '/search',
  name: 'searchCenter',
  component: () => import('@/view/search/SearchCenter.vue'),
};

export default searchRouter;
