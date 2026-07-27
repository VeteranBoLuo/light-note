import type { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg';

const aiRouter: RouteRecordRaw = {
  path: '/ai',
  name: 'mobileAiWorkspace',
  meta: {
    title: 'AI 助手',
    requireAuth: true,
    roles: ALL_ROLES,
    mobileShell: 'ai',
    mobileBottomNav: true,
  },
  component: () => import('@/view/aiAssistant/MobileAiWorkspace.vue'),
};

export default aiRouter;
