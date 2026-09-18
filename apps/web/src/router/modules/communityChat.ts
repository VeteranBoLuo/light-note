import type { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg';

const communityChatRouter: RouteRecordRaw = {
  path: '/community/chat',
  alias: '/community-chat',
  name: 'communityChat',
  meta: {
    title: '聊天室',
    communityView: 'chat',
    roles: ALL_ROLES,
    mobileShell: 'community',
    mobileTopBar: false,
    mobileBottomNav: true,
  },
  component: () => import('@/view/communityChat/CommunityChat.vue'),
};

export default communityChatRouter;

export const communityRoutes: RouteRecordRaw[] = [
  {
    path: '/community/preferences',
    name: 'communityFeedPreferences',
    meta: { title: '社区设置', roles: ALL_ROLES, mobileShell: 'community', mobileTopBar: false, mobileBottomNav: true },
    component: () => import('@/view/community/CommunitySettings.vue'),
  },
  ...[
    ['/community/feed', 'communityFeed', 'feed'],
    ['/community/topics/:slug', 'communityTopic', 'feed'],
    ['/community/posts/:id', 'communityPost', 'detail'],
    ['/community/manage', 'communityManage', 'manage'],
    ['/community/moderation', 'communityModeration', 'moderation'],
    ['/community/people/:id', 'communityPublicProfile', 'profile'],
  ].map<RouteRecordRaw>(([path, name, feedMode]) => ({
    path,
    name,
    meta: {
      title: '社区',
      roles: ALL_ROLES,
      feedMode,
      mobileShell: 'community',
      mobileTopBar: false,
      mobileBottomNav: true,
    },
    component: () => import('@/view/community/CommunityFeed.vue'),
  })),
  {
    path: '/community',
    name: 'communityEntry',
    meta: { title: '社区', roles: ALL_ROLES, mobileShell: 'community', mobileTopBar: false, mobileBottomNav: true },
    component: () => import('@/view/community/CommunityEntry.vue'),
  },
  {
    path: '/community/profile',
    name: 'communityOwnProfile',
    meta: {
      title: '公开主页',
      feedMode: 'profile',
      roles: ALL_ROLES,
      mobileShell: 'community',
      mobileTopBar: false,
      mobileBottomNav: true,
    },
    component: () => import('@/view/community/CommunityFeed.vue'),
  },
];
