import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const noteLibraryRouter: RouteRecordRaw[] = [
  {
    meta: {
      title: '笔记库',
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/noteLibrary',
    name: 'noteLibrary',
    component: () => import('@/view/noteLibrary/NoteLibrary.vue'),
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
