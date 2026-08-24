import type { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg';

const aiRouter: RouteRecordRaw = {
  path: '/ai',
  name: 'mobileAiWorkspace',
  meta: {
    title: '旧 AI 会话',
    requireAuth: true,
    roles: ALL_ROLES,
  },
  component: () => import('@/view/aiAssistant/MobileAiWorkspace.vue'),
};

export default aiRouter;
