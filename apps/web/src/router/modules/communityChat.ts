import type { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg';

const communityChatRouter: RouteRecordRaw = {
  path: '/community-chat',
  name: 'communityChat',
  meta: {
    title: '社区客厅',
    roles: ALL_ROLES,
    mobileShell: 'community',
    mobileBottomNav: true,
  },
  component: () => import('@/view/communityChat/CommunityChat.vue'),
};

export default communityChatRouter;
