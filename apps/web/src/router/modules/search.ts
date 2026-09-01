import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const searchRouter: RouteRecordRaw = {
  meta: {
    title: '资源中心',
    keepAlive: true,
    requireAuth: true,
    roles: ALL_ROLES,
    // 资源中心包含「全部资源 / 整理中心 / 知识地图」，属于资料处理。
    mobileShell: 'resources',
    mobileBottomNav: true,
  },
  path: '/search',
  name: 'searchCenter',
  component: () => import('@/view/search/SearchCenter.vue'),
};

export default searchRouter;
