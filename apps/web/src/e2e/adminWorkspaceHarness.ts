// Local, in-memory acceptance fixture: every business request is intercepted before transport.
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import Admin from '@/view/admin/admin/Admin.vue';
import AdminOverview from '@/view/admin/components/overview/AdminOverview.vue';
import UserMg from '@/view/admin/components/userMg/UserMg.vue';
import UserMgMobile from '@/view/admin/components/userMg/UserMgMobile.vue';
import OperationLog from '@/view/admin/components/operationLog/OperationLog.vue';
import ConversionFunnel from '@/view/admin/components/conversion/ConversionFunnel.vue';
import { bookmarkStore, useUserStore } from '@/store';
import { isMobileViewport, usesMobileDeviceLayout } from '@/config/responsive';
import { applyUiDensity } from '@/composables/useUiDensity';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const state = params.get('state') || 'populated';
const mobile = isMobileViewport(innerWidth);
const pinia = createPinia();
useUserStore(pinia).setUserInfo({
  id: 'admin-layout-fixture',
  role: 'root',
  alias: 'Fixture',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = innerWidth;
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle(
  'light-note-mobile-rendering',
  usesMobileDeviceLayout(innerWidth) || params.get('renderProfile') === 'mobile',
);
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  usesMobileDeviceLayout(innerWidth),
);
const names = [
  '春风',
  '薄荷',
  '松果',
  '小满',
  '阿禾',
  '远山',
  '一个正在整理知识库的长昵称',
  '测试账号',
  '蓝鲸',
  '北辰',
];
const users = Array.from({ length: 1286 }, (_, index) => ({
  id: `fixture-${index}`,
  alias: names[index % names.length] + (index > 9 ? index : ''),
  email: `reader${index}@example.com`,
  role: index % 10 === 7 ? 'test' : 'user',
  delFlag: index % 10 === 5 ? 1 : 0,
  level: 1 + (index % 12),
  headPicture: '',
  equippedFrame: null,
  adminRemark: index % 3 === 0 ? '学习资料' : '',
  ip: `192.0.2.${1 + (index % 250)}`,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  lastActiveTime: index % 10 === 4 ? null : '2026-10-29 14:28:00',
  createTime: '2026-10-12 09:16:00',
  bookmarkTotal: 128,
  noteTotal: 42,
  storageUsed: 320 * 1024 * 1024,
}));
const logs = Array.from({ length: 250 }, (_, index) => ({
  id: index + 1,
  alias: names[index % 10],
  email: `reader${index % 10}@example.com`,
  createBy: `fixture-${index % 10}`,
  module: ['书签', '笔记', '云空间', '待办', '标签'][index % 5],
  operation: ['新增书签', '更新笔记', '上传文件', '完成待办', '创建标签'][index % 5],
  ip: `192.0.2.${(index % 250) + 1}`,
  createTime: `2026-10-29 14:${String(59 - (index % 60)).padStart(2, '0')}:08`,
  system: {
    os: index % 2 ? 'Android' : 'macOS',
    runtime: index % 2 ? 'android-app' : 'browser',
    appVersion: index % 2 ? '1.0.0' : '',
  },
}));
const snapshot = {
  users: { total: 1286, today: 12 },
  active: { available: state !== 'unavailable', today: state === 'unavailable' ? null : 64 },
  resources: {
    bookmarkToday: 52,
    noteToday: 24,
    fileToday: 10,
    bookmarkTotal: 11000,
    noteTotal: 4000,
    fileTotal: 2428,
    storageMb: 4915,
    trashMb: 126,
    trashCount: 8,
  },
  todos: { total: 3120, createdToday: 24, pending: 68, dueToday: 12, overdue: 3, completedToday: 18 },
  ai: { todayCount: 26, todayTokens: 32800 },
  system: { apiToday: 4218, apiBusinessErrorsToday: 8, apiInvalidRequestsToday: 5, apiServerErrorsToday: 0 },
  pending: { opinion: 3, security: 1 },
  generatedAt: '2026-10-29 14:32',
  todayBaseline:
    state === 'baseline'
      ? {
          available: true,
          timezone: 'Asia/Shanghai',
          mode: 'same_elapsed_time',
          cutoffTime: '14:32',
          sampleDays: 7,
          metrics: {
            users: { yesterday: 8, average7d: 7 },
            resources: { yesterday: 64, average7d: 56 },
            bookmarks: { yesterday: 40, average7d: 34 },
            notes: { yesterday: 16, average7d: 14 },
            files: { yesterday: 8, average7d: 8 },
            todos: { yesterday: 18, average7d: 17 },
            activeUsers: { yesterday: 48, average7d: 52 },
            aiCalls: { yesterday: 20, average7d: 18 },
          },
        }
      : undefined,
};
if (state === 'empty') {
  for (const group of Object.values(snapshot)) {
    if (group && typeof group === 'object')
      for (const key of Object.keys(group)) {
        if (typeof (group as Record<string, unknown>)[key] === 'number') (group as Record<string, unknown>)[key] = 0;
      }
  }
}
const recent = ['Vue 3 组件设计规范', '十月阅读笔记', '项目资料.pdf', '整理本周阅读清单', '前端性能优化指南'].map(
  (title, index) => ({
    id: index,
    type: ['bookmark', 'note', 'file', 'todo', 'bookmark'][index],
    title,
    userId: `fixture-${index}`,
    userName: names[index],
    createdAt: '2026-10-29 14:28:00',
  }),
);
const response = (config: any, data: unknown, status = 200) => ({
  data: { status, data, msg: status === 200 ? '' : 'Fixture unavailable' },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});
request.defaults.adapter = async (config) => {
  const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {};
  const url = config.url || '';
  if (state === 'loading') await new Promise((resolve) => setTimeout(resolve, 60000));
  else await new Promise((resolve) => setTimeout(resolve, state === 'slow' ? 1000 : 30));
  if (state === 'error' && !url.includes('community')) return response(config, null, 503);
  if (url.endsWith('getAdminOverviewSnapshot')) return response(config, snapshot);
  if (url.endsWith('getAdminOverviewTrend'))
    return response(config, {
      days: body.days,
      granularity: 'day',
      trend: Array.from({ length: 7 }, (_, i) => ({
        date: `2026-10-${23 + i}`,
        label: `10/${23 + i}`,
        users: [6, 9, 8, 11, 7, 10, 12][i],
        bookmarks: [34, 42, 38, 49, 43, 46, 52][i],
        notes: [18, 20, 20, 23, 19, 22, 24][i],
        files: [8, 10, 8, 9, 8, 9, 10][i],
      })),
    });
  if (url.endsWith('getAdminOverviewRecent')) {
    const items =
      state === 'empty'
        ? []
        : body.target === 'user'
          ? users.slice(0, 4).map((u) => ({ id: u.id, name: u.alias, role: u.role, createdAt: u.createTime }))
          : recent.filter((r) => !body.type || ['all', 'resource'].includes(body.type) || r.type === body.type);
    return response(config, { items, total: items.length, hasMore: false, nextCursor: null });
  }
  if (url.endsWith('getUserList') || url.endsWith('getOperationLogs')) {
    const isUsers = url.endsWith('getUserList'),
      filters = body.filters || {};
    let all: any[] = isUsers ? users : logs;
    if (state === 'empty') all = [];
    if (filters.key) all = all.filter((item) => JSON.stringify(item).includes(filters.key));
    if (isUsers && filters.role) all = all.filter((item) => item.role === filters.role);
    if (isUsers && filters.status !== 'all')
      all = all.filter((item) => item.delFlag === (filters.status === 'banned' ? 1 : 0));
    if (!isUsers && filters.module) all = all.filter((item) => item.module === filters.module);
    if (!isUsers && filters.userId) all = all.filter((item) => item.createBy === filters.userId);
    if (state === 'append-error' && body.cursor) return response(config, null, 503);
    const offset = Number(body.cursor || 0),
      end = offset + (body.limit || 50);
    return response(config, {
      items: all.slice(offset, end),
      total: all.length,
      hasMore: end < all.length,
      nextCursor: end < all.length ? String(end) : null,
    });
  }
  if (url.endsWith('/admin/detail')) {
    const profile = users.find((u) => u.id === body.userId) || users[0];
    return response(config, {
      profile: { ...profile, status: profile.delFlag ? 'banned' : 'active' },
      resources: { bookmarkTotal: 128, noteTotal: 42, fileTotal: 10, storageUsed: 320 },
      todos: { pendingTotal: 8, overdueTotal: 1 },
      aiUsage: { requestTotal: 26, tokenTotal: 32800 },
      growth: { level: profile.level, points: 120 },
      security: { eventTotal: 0, unhandledTotal: 0 },
    });
  }
  if (url.endsWith('getAdminOverviewActiveUsers')) {
    const activeUsers = state === 'empty' ? [] : users.slice(0, 64);
    const offset = Number(body.cursor || 0);
    const end = offset + (body.limit || 50);
    return response(config, {
      date: '2026-10-29',
      snapshotAt: '2026-10-29 14:32:00',
      hideInternal: body.hideInternal,
      total: activeUsers.length,
      items: activeUsers.slice(offset, end).map((u) => ({
        id: u.id,
        name: u.alias,
        userRemark: u.adminRemark,
        firstActiveAt: '2026-10-29 09:00:00',
        lastActiveAt: '2026-10-29 14:32:00',
      })),
      hasMore: end < activeUsers.length,
      nextCursor: end < activeUsers.length ? String(end) : null,
      partialToday: false,
      startedAt: '2026-09-01',
      trend: [],
    });
  }
  if (url.endsWith('getConversionFunnel')) {
    // ?state=empty 为没有来源记录，?state=unavailable 模拟旧后端不返回来源。
    const entrySources = [
      { source: 'search:baidu', visitors: 87, signupOpen: 21, registered: 9, activated: 4 },
      { source: 'direct', visitors: 64, signupOpen: 12, registered: 5, activated: 2 },
      { source: 'ref:github', visitors: 26, signupOpen: 8, registered: 4, activated: 3 },
      { source: 'search:bing', visitors: 24, signupOpen: 6, registered: 2, activated: 1 },
      { source: 'utm:v2ex', visitors: 12, signupOpen: 5, registered: 3, activated: 2 },
      {
        source: 'site:a-very-long-navigation-directory-example.com',
        visitors: 3,
        signupOpen: 0,
        registered: 0,
        activated: 0,
      },
    ];
    return response(config, {
      pageViewVisitors: 520,
      demoEnterVisitors: 122,
      wallHitVisitors: 48,
      signupOpenVisitors: 81,
      signupSubmitVisitors: 41,
      registerVisitors: 32,
      activatedUsers: 15,
      hotspots: [{ context: 'save-note', cnt: 4 }],
      trend: [],
      ...(state === 'unavailable' ? {} : { entrySources: state === 'empty' ? [] : entrySources }),
    });
  }
  if (url.includes('community')) return response(config, { items: [], total: 0 });
  // No unhandled endpoint can reach the live API, including mutation endpoints.
  throw new Error(`UNEXPECTED_ADMIN_FIXTURE_REQUEST: ${url}`);
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/admin',
      component: Admin,
      children: [
        { path: 'overview', component: AdminOverview },
        { path: 'userMg', component: UserMg },
        { path: 'operationLog', component: OperationLog },
        { path: 'conversion', component: ConversionFunnel },
      ],
    },
    { path: '/overview', component: AdminOverview },
    { path: '/userMg', component: UserMgMobile },
    { path: '/operationLog', component: OperationLog },
    { path: '/conversion', component: ConversionFunnel },
  ],
});
// Navigation in the production shell imports its router directly. Keep those
// actions inside this isolated fixture as well as the injected page router.
const navigationRouter = (await import('@/router')).default;
navigationRouter.push = router.push.bind(router);
navigationRouter.replace = router.replace.bind(router);
const page = ['overview', 'userMg', 'operationLog', 'conversion'].includes(params.get('page') || '')
  ? params.get('page')!
  : 'overview';
const app = createApp({
  render: () =>
    h('div', { style: 'height:100%;background:var(--background-color)' }, [
      !mobile
        ? h(
            'header',
            {
              style:
                'height:var(--ui-layout-54,54px);padding:0 var(--ui-space-20,20px);display:flex;align-items:center;border-bottom:1px solid var(--surface-border-color);color:var(--text-color)',
            },
            '轻笺 · 管理界面隔离预览',
          )
        : null,
      h('main', { style: mobile ? 'height:100%' : 'height:calc(100% - var(--ui-layout-54,54px))' }, [h(RouterView)]),
    ]),
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale, fallbackLocale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
await router.push(`${mobile ? '' : '/admin'}/${page}`);
await router.isReady();
app.mount('#app');
