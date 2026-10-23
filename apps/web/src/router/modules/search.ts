import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const searchRouter: RouteRecordRaw = {
  meta: {
    title: '资源中心',
    keepAlive: true,
    requireAuth: true,
    roles: ALL_ROLES,
    // 资源中心用于全局查找与资料整理。
    mobileShell: 'resources',
    mobileBottomNav: true,
  },
  path: '/search',
  name: 'searchCenter',
  component: () => import('@/view/search/SearchCenter.vue'),
};

export default searchRouter;

export const publicationRoutes: RouteRecordRaw[] = [
  {
    path: '/search/publications',
    name: 'publications',
    component: () => import('@/view/search/Publications.vue'),
    meta: {
      title: '公开管理',
      requireAuth: true,
      roles: ['root', 'user', 'test'],
      mobileShell: 'resources',
      mobileBottomNav: false,
      seoIndexable: false,
    },
  },
  {
    path: '/public-resources/:id',
    name: 'publicResourceDetail',
    component: () => import('@/view/search/PublicResourceDetail.vue'),
    meta: {
      title: '公开资源',
      requireAuth: true,
      roles: ['root', 'user', 'test'],
      mobileShell: 'resources',
      mobileBottomNav: false,
      seoIndexable: false,
    },
  },
];
