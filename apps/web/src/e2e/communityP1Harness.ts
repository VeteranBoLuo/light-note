import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, useUserStore } from '@/store';
import { useCommunityChatUnread } from '@/composables/useCommunityChatUnread';
import { communityChatWorkspaceActive } from '@/composables/useCommunityChatActivation';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import chatRoute, { communityRoutes } from '@/router/modules/communityChat';
import Preferences from '@/components/community/CommunityPreferencesPanel.vue';
import Settings from '@/view/settings/Settings.vue';
import Navigation from '@/components/home/navigation/Navigation.vue';
import MobileBottomNav from '@/components/mobile/MobileBottomNav.vue';
import '@/assets/css/index.less';

// Isolated browser fixture: every request is served by this adapter, with no backend connection.
const params = new URLSearchParams(location.search);
const calls: { url: string; method: string; data: unknown; params: unknown }[] = [];
const control = { failPreferences: params.has('error'), failProfileSave: false };
const preferences = {
  defaultView: 'chat',
  revision: 0,
  protocolVersion: 1,
  availableViews: ['chat'],
  feedEnabled: false,
};
const author = {
  name: '薄荷',
  communityId: 'LN-MINT',
  role: 'member',
  avatar: '',
  frameId: null,
  level: 3,
  levelName: '秀才',
  title: null,
};
let ownProfile = {
  bio: '记录生活，分享轻笺的使用心得。',
  showCommunityTenure: true,
  featuredAchievementKeys: [],
  revision: 1,
  usesDefaultFeaturedAchievements: true,
  availableAchievements: [],
  publicPreview: {
    ...author,
    bio: '记录生活，分享轻笺的使用心得。',
    communityTenureLabel: '加入轻笺 1 年',
    achievements: [],
    achievementCount: 0,
    hasMoreAchievements: false,
  },
};
const access = {
  accessMode: 'public',
  messagingEnabled: true,
  canEnter: true,
  canRead: true,
  canPost: true,
  authenticated: true,
  realtimeEnabled: false,
  canManage: false,
  postingEnabled: true,
  status: 'active',
  notificationLevel: 'mentions',
  notificationsEnabled: true,
  memberRole: 'member',
  pollsEnabled: false,
  readReceiptsEnabled: false,
  filesEnabled: false,
};
const rooms = [
  {
    slug: 'general',
    name: '轻笺聊天室',
    description: '使用心得与日常交流',
    type: 'text',
    status: 'active',
    notificationLevel: 'mentions',
    slowModeSeconds: 0,
    sortOrder: 0,
    unreadCount: 8,
    mentionCount: 0,
  },
];
const messages = Array.from({ length: 50 }, (_, index) => ({
  publicId: `message-${index}`,
  content: `第 ${index + 1} 条交流：欢迎分享你的轻笺使用心得。`,
  status: 'active',
  createdAt: new Date(Date.UTC(2026, 8, 14, 8, index)).toISOString(),
  editedAt: null,
  isOwn: index % 4 === 0,
  images: [],
  attachments: [],
  mentions: [],
  likeCount: 0,
  likedByMe: false,
  likePreview: [],
  author,
  reply: null,
}));
request.defaults.adapter = async (config) => {
  const url = String(config.url),
    method = config.method || 'get';
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  calls.push({ url, method, data: body, params: config.params });
  let data: unknown = {};
  if (url.includes('/community/preferences/me')) {
    if (control.failPreferences) throw new Error('Fixture unavailable');
    if (method === 'put') {
      preferences.revision++;
      preferences.defaultView = body.defaultView;
    }
    data = { ...preferences };
  } else if (url.endsWith('/community-chat/rooms')) data = { access, messagingEnabled: true, items: rooms };
  else if (url.endsWith('/messages'))
    data = {
      items: messages,
      hasMore: false,
      focusPublicId: config.params?.focus || null,
      hasNewer: Boolean(config.params?.focus),
      nextAfter: 'message-49',
    };
  else if (url.endsWith('/pinned-message')) data = { message: null };
  else if (url.endsWith('/profile/me')) {
    if (method === 'put') {
      if (control.failProfileSave) throw new Error('Fixture revision conflict');
      ownProfile = {
        ...ownProfile,
        ...body,
        revision: ownProfile.revision + 1,
        publicPreview: { ...ownProfile.publicPreview, bio: body.bio },
      };
    }
    data = ownProfile;
  } else if (url.endsWith('/read')) {
    rooms[0].unreadCount = 0;
  } else if (url.includes('/profile')) data = ownProfile.publicPreview;
  else if (url.includes('/notifications'))
    data = {
      enabled: true,
      level: 'mentions',
      defaultEnabled: true,
      channels: {
        inApp: { available: true, enabled: true },
        browser: { available: false },
        android: { available: false },
      },
    };
  else if (url.includes('/stickers')) data = { items: [], limits: { maxCount: 24 } };
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data } };
};
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
for (const el of [document.documentElement, document.body, document.getElementById('app')!]) {
  el.style.height = '100%';
  el.style.margin = '0';
}
document.body.style.display = 'block';
document.getElementById('app')!.style.width = '100%';
const router = createRouter({
  history: createMemoryHistory(),
  routes: [chatRoute, ...communityRoutes, { path: '/preferences', component: Preferences }, { path: '/settings', name: 'settings', component: Settings }],
});
const app = createApp({
  setup() {
    const bookmark = bookmarkStore(),
      user = useUserStore();
    user.$patch({
      id: params.has('guest') ? '' : 'fixture-user',
      role: params.has('guest') ? 'visitor' : 'user',
      alias: '薄荷',
    });
    bookmark.screenWidth = innerWidth;
    bookmark.screenHeight = innerHeight;
    const unread = useCommunityChatUnread();
    unread.syncDirectory({ access, messagingEnabled: true, items: rooms } as any);
    Object.assign(window, {
      communityFixture: { calls, control, router, user, unread, active: communityChatWorkspaceActive },
    });
    return () =>
      h('div', { style: 'height:100%;display:flex;flex-direction:column' }, [
        !bookmark.isMobile ? h(Navigation) : null,
        h(
          'main',
          {
            style: `flex:1;min-height:0;overflow:auto;${bookmark.isMobile ? '' : 'margin-top:60px'};${router.currentRoute.value.path === '/preferences' ? 'padding:24px' : ''}`,
          },
          h(RouterView),
        ),
        bookmark.isMobile && router.currentRoute.value.meta.mobileBottomNav ? h(MobileBottomNav) : null,
      ]);
  },
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.push(params.get('path') || '/community');
await router.isReady();
app.mount('#app');
