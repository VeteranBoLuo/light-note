import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const manageRouter: RouteRecordRaw = {
  meta: {
    title: '数据管理',
    keepAlive: true,
    requireAuth: true,
    roles: ALL_ROLES,
  },
  path: '/manage',
  name: 'manage',
  children: [
    {
      path: 'tagMg',
      name: 'tagMg',
      component: () => import('@/view/manage/TagMg.vue'),
      // 移动端作为资料区第四个页签(书签/笔记/云空间/标签),走统一移动壳
      meta: {
        mobileShell: 'resources',
        mobileTopSwitcher: true,
        mobileBottomNav: true,
      },
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
