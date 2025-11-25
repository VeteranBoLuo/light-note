import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const manageRouter: RouteRecordRaw = {
  meta: {
    title: '数据管理',
    keepAlive: true,
    requireAuth: true,
    roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
  },
  path: '/manage',
  name: 'manage',
  children: [
    {
      path: 'tagMg',
      name: 'tagMg',
      component: () => import('@/view/manage/TagMg.vue'),
    },
    {
      name: 'tagEditMg',
      path: 'editTag/:id',
      component: () => import('@/view/manage/TagEditMg.vue'),
    },
    {
      path: 'bookmarkMg',
      name: 'bookmarkMg',
      component: () => import('@/view/manage/BookmarkMg.vue'),
    },
    {
      name: 'bookmarkEditMg',
      path: 'editBookmark/:id',
      component: () => import('@/view/manage/BookmarkEditMg.vue'),
    },
    {
      name: 'bookmarkEditMgAddByTag',
      path: 'editBookmark/add/:tagId', // 新增时，自动关联tag
      component: () => import('@/view/manage/BookmarkEditMg.vue'),
    },
  ],
};

export default manageRouter;
