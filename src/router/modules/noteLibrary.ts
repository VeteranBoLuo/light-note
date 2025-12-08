import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const noteLibraryRouter: RouteRecordRaw[] = [
  {
    meta: {
      title: '笔记库',
      keepAlive: true,
      requireAuth: true,
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/noteLibrary',
    name: 'noteLibrary',
    component: () => import('@/view/noteLibrary/NoteLibrary.vue'),
  },
  {
    meta: {
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/noteLibrary/:id(.*)',
    name: 'noteDetail',
    component: () => import('@/view/noteLibrary/NoteDetail.vue'),
  },
];

export default noteLibraryRouter;
