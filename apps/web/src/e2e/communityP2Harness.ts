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
import BButton from '@/components/base/BasicComponents/BButton.vue';
import Navigation from '@/components/home/navigation/Navigation.vue';
import MobileBottomNav from '@/components/mobile/MobileBottomNav.vue';
import '@/assets/css/index.less';

// Chat uses the P1 fixture; all feed operations call the disposable MySQL browser server.
const params = new URLSearchParams(location.search);
const fixturePort = ['19093', '19094', '19095'].includes(params.get('fixturePort') || '')
  ? params.get('fixturePort')
  : '19092';
const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
const demoPostImages = new Map<string, any[]>();
let campaignPublic = !params.has('noCampaign');
const campaignFixture = {
  campaignKey: 'autumn-fixture',
  campaignVersion: 1,
  title: '中秋 · 国庆，给灵感一个新起点',
  description: '秋日活动隔离展示：查看活动说明、活动时间与参与入口。',
  serverNow: new Date().toISOString(),
  startsAt: new Date(Date.now() - 86400000).toISOString(),
  endsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
  lifecycle: 'active',
  checkoutEnabled: false,
  themeKey: 'autumn-desk-v1',
  packages: [],
};
function withDemoImages(post: any) {
  // Display-only examples must never become image IDs in the current user's editor.
  if (!post?.publicId || post.isOwn || post.images?.length) return post;
  if (!demoPostImages.has(post.publicId) && demoPostImages.size < 3) {
    const count = [3, 1, 2][demoPostImages.size];
    demoPostImages.set(
      post.publicId,
      ['autumn-vista', 'store', 'campaign'].slice(0, count).map((name, i) => ({
        publicId: `demo-${post.publicId}-${i}`,
        url: `/brand-scenes/${name}.webp`,
        width: 1200,
        height: 800,
      })),
    );
  }
  return { ...post, images: demoPostImages.get(post.publicId) || post.images || [] };
}
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
  communityTenurePreviewLabel: '加入轻笺 1 年',
  bio: '记录生活，分享轻笺的使用心得。',
  showCommunityTenure: true,
  featuredAchievementKeys: [],
  revision: 1,
  usesDefaultFeaturedAchievements: true,
  availableAchievements: params.has('achievements')
    ? [
        { key: 'streak_7', group: 'checkin' },
        { key: 'bookmark_10', group: 'create' },
        { key: 'note_10', group: 'create' },
        { key: 'streak_30', group: 'checkin' },
      ]
    : [],
  publicPreview: {
    ...author,
    frameId: params.has('achievements') ? 'frame_dragon' : null,
    frameRarity: params.has('achievements') ? 'legendary' : null,
    role: params.has('achievements') ? 'official' : author.role,
    name: params.get('account') === 'b' ? '南风' : params.get('account') === 'root' ? '轻笺团队' : '薄荷',
    communityId: params.get('account') === 'b' ? 'LN-WIND' : params.get('account') === 'root' ? 'LN-ROOT' : 'LN-MINT',
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
  if (method === 'get' && url.includes('/community-chat/') && (url.endsWith('/rooms') || url.endsWith('/messages'))) {
    const delay = Math.min(2000, Math.max(0, Number(params.get('chatDelay')) || 0));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  }
  if (
    url.includes('/api/community/') ||
    (['19093', '19094', '19095'].includes(fixturePort || '') &&
      (url.endsWith('/growth/claimAll') || url.endsWith('/growth/claimable'))) ||
    (['19093', '19094', '19095'].includes(fixturePort || '') && url.endsWith('/community-chat/profile/me'))
  ) {
    const delay = Math.min(3000, Math.max(0, Number(params.get('delay')) || 0));
    if (delay && method === 'get') await new Promise((resolve) => setTimeout(resolve, delay));
    if (url.endsWith('/feed/capabilities') && params.has('failfeed')) throw new Error('Isolated capabilities failure');
    const destination = new URL(fixtureOrigin + url.slice(url.indexOf('/api/')));
    for (const [key, value] of Object.entries(config.params || {}))
      if (value !== undefined) destination.searchParams.set(key, String(value));
    if (control.failProfileSave && method === 'put' && url.endsWith('/community-chat/profile/me'))
      throw new Error('Fixture save failure');
    const response = await fetch(destination, {
      method: method.toUpperCase(),
      headers: {
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        'X-Fixture-Account': params.get('account') || 'a',
      },
      ...(method !== 'get' ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    if (url.endsWith('/profiles/options/me') && payload.status === 200 && !payload.data.userPublicId) {
      const headers = { 'X-Fixture-Account': params.get('account') || 'a' };
      const own = await fetch(fixtureOrigin + '/api/community/own/posts', { headers }).then((r) => r.json());
      const published = own.data?.items?.find((item) => item.hasPublishedVersion);
      if (published) {
        const detail = await fetch(fixtureOrigin + '/api/community/posts/' + published.publicId, { headers }).then(
          (r) => r.json(),
        );
        payload.data.userPublicId = detail.data?.author?.userPublicId;
      }
    }
    if (method === 'get' && payload.status === 200) {
      if (url.endsWith('/api/community/posts') && payload.data?.items)
        payload.data.items = payload.data.items.map(withDemoImages);
      else if (/\/posts\/[^/]+$/.test(url) && payload.data?.publicId) payload.data = withDemoImages(payload.data);
      else if (payload.data?.posts?.items) payload.data.posts.items = payload.data.posts.items.map(withDemoImages);
    }
    if (url.endsWith('/feed/capabilities') && params.has('closed')) payload.data.feedEnabled = false;
    if (url.endsWith('/feed/capabilities') && params.has('readonly')) payload.data.writesEnabled = false;
    return {
      config,
      status: response.status,
      statusText: response.statusText,
      headers: {},
      data: payload,
    };
  }
  let data: unknown = {};
  if (url.endsWith('/support/admin/campaigns')) {
    data = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        ...campaignFixture,
        version: 1,
        status: 'published',
        publicEnabled: campaignPublic,
        skus: [],
      },
    ];
  } else if (url.endsWith('/support/admin/campaigns/11111111-1111-4111-8111-111111111111/visibility')) {
    campaignPublic = Boolean(body.enabled);
    data = { publicEnabled: campaignPublic };
  } else if (url.endsWith('/support/campaign-entry') || url.includes('/support/campaigns/')) {
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { status: 200, data: campaignPublic ? campaignFixture : null },
    };
  }
  if (url.endsWith('/api/user/saveUserInfo')) {
    useUserStore().$patch(body);
    data = {};
  } else if (url.endsWith('/api/user/getUserInfo')) {
    data = { ...useUserStore().$state };
  } else if (url.endsWith('/api/search/global')) {
    const account = params.get('account') || 'a';
    const items = [
      { id: account + '-note', type: 'note', title: '我的知识整理方法', description: '本地隔离样例' },
      { id: account + '-image-note', type: 'note', title: '含图片的旅行笔记', description: '本地隔离样例' },
      { id: account + '-bookmark', type: 'bookmark', title: 'MDN 网页开发文档', description: '本地隔离样例' },
    ].filter((item) => !body?.keyword || item.title.includes(body.keyword));
    data = { items, total: items.length, hasMore: false, typeTotals: { note: 2, bookmark: 1 } };
  } else if (url.includes('/community/preferences/me')) {
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
  else if (url.includes('/blocks')) data = { items: [] };
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
  routes: [
    { path: '/campaign/:campaignKey', component: () => import('@/view/campaign/CampaignPage.vue') },
    chatRoute,
    ...communityRoutes,
    { path: '/myInfo', component: () => import('@/components/personCenter/myInfo/MyInfoMobile.vue') },
    { path: '/preferences', component: Preferences },
    { path: '/settings', name: 'settings', component: Settings },
  ],
});
const app = createApp({
  setup() {
    const bookmark = bookmarkStore(),
      user = useUserStore();
    user.$patch({
      id: params.has('guest') ? '' : params.get('account') || 'a',
      role: params.has('guest') ? 'visitor' : params.get('account') === 'root' ? 'root' : 'user',
      alias: params.get('account') === 'root' ? '轻笺团队' : params.get('account') === 'b' ? '南风' : '薄荷',
    });
    user.preferences.theme = params.get('theme') === 'night' ? 'night' : 'day';
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
          'aside',
          {
            style: `margin-top:${bookmark.isMobile ? '0' : '60px'};padding:8px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;border-bottom:1px solid var(--surface-border-color);color:var(--desc-color)`,
          },
          [
            h('span', '隔离体验环境 · 示例数据不会写入线上'),
            ...[
              ['a', '薄荷'],
              ['b', '南风'],
              ['root', '审核员'],
            ].map(([account, label]) =>
              h(
                BButton,
                {
                  size: 'small',
                  onClick: () => {
                    const target = new URL(location.href);
                    target.searchParams.set('account', account);
                    location.href = target.href;
                  },
                },
                () => label,
              ),
            ),
          ],
        ),
        h(
          'main',
          {
            style: `flex:1;min-height:0;overflow:auto;${router.currentRoute.value.path === '/preferences' ? 'padding:24px' : ''}`,
          },
          h(RouterView),
        ),
        bookmark.isMobile && router.currentRoute.value.meta.mobileBottomNav ? h(MobileBottomNav) : null,
      ]);
  },
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.push(params.get('path') || '/community/feed');
await router.isReady();
app.mount('#app');
