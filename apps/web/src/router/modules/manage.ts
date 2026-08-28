import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES, RoleEnum } from '@/config/bookmarkCfg.ts';
import { resolveTagSpaceEntryId } from '@/utils/tagSpaceNavigation';

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
      component: () => import('@/components/tagSpace/TagSpaceEntry.vue'),
      beforeEnter: async (to) => {
        if (String(to.query.create || '') === '1') return true;
        try {
          const entryId = await resolveTagSpaceEntryId();
          return entryId ? { name: 'tagDetail', params: { id: entryId }, replace: true } : true;
        } catch {
          return true;
        }
      },
      // 移动端作为资料区第四个页签(书签/笔记/云空间/标签),走统一移动壳
      meta: {
        roles: [RoleEnum.Root, RoleEnum.USER, RoleEnum.TEST],
        mobileShell: 'resources',
        mobileTopSwitcher: true,
        mobileBottomNav: true,
      },
    },
    {
      name: 'tagEditMg',
      path: 'editTag/:id',
      redirect: (to) =>
        String(to.params.id) === 'add'
          ? { name: 'tagMg', query: { create: '1' } }
          : { name: 'tagDetail', params: { id: to.params.id }, query: { edit: '1' } },
    },
    {
      path: 'bookmarkMg',
      name: 'bookmarkMg',
      component: () => import('@/view/manage/BookmarkMg.vue'),
      meta: {
        mobileShell: 'resources',
        mobileTopSwitcher: false,
        mobileBottomNav: true,
      },
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
