import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const noteLibraryRouter: RouteRecordRaw[] = [
  {
    meta: {
      title: '笔记库',
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
      mobileShell: 'resources',
      mobileTopSwitcher: true,
      mobileBottomNav: true,
      mobileCompactResourceHeading: true,
    },
    path: '/noteLibrary',
    name: 'noteLibrary',
    component: () => import('@/view/noteLibrary/NoteLibrary.vue'),
  },
  {
    meta: {
      title: '模板管理',
      requireAuth: true,
      roles: ALL_ROLES,
      mobileShell: 'resources',
      mobileBottomNav: false,
    },
    path: '/noteLibrary/templates',
    name: 'noteTemplateManage',
    component: () => import('@/view/noteLibrary/NoteTemplateManage.vue'),
  },
  {
    meta: {
      roles: ALL_ROLES,
    },
    path: '/noteLibrary/:id(.*)',
    name: 'noteDetail',
    component: () => import('@/view/noteLibrary/NoteDetail.vue'),
  },
];

export default noteLibraryRouter;
