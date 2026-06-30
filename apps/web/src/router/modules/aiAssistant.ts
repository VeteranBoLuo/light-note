import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const aiAssistantRouter: RouteRecordRaw[] = [
  {
    meta: {
      title: 'AI智能助手',
      keepAlive: true,
      requireAuth: true,
      roles: [RoleEnum.Root],
    },
    path: '/aiAssistant',
    name: 'aiAssistant',
    component: () => import('@/view/aiAssistant/AiAssistant.vue'),
  },
];

export default aiAssistantRouter;