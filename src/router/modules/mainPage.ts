import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const mainPageRouter: RouteRecordRaw = {
  path: 'home',
  meta: {
    title: '书签',
    keepAlive: true,
    requireAuth: true,
    roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
  },
  children: [
    {
      path: '',
      name: 'home',
      component: () => import('@/view/home/Home.vue'),
    },
    {
      path: ':id',
      name: 'home:id',
      component: () => import('@/view/home/Home.vue'),
    },
    {
      path: 'search/:value(.*)',
      name: 'home:search',
      component: () => import('@/view/home/Home.vue'),
    },
  ],
};

export default mainPageRouter;
