import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const toolsRouter: RouteRecordRaw[] = [
  {
    meta: {
      title: '工具',
      keepAlive: true,
      requireAuth: true,
      roles: [RoleEnum.Root],
    },
    path: '/tools',
    name: 'tools',
    redirect: '/tools/jsonEditor',
    component: () => import('@/view/tools/Tools.vue'),
    children: [
      {
        path: 'jsonEditor',
        name: 'toolsJsonEditor',
        component: () => import('@/view/tools/jsonEditor/JsonEditor.vue'),
      },
    ],
  },
];

export default toolsRouter;
