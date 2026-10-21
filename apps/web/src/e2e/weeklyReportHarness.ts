import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { h } from 'vue';
import '@/assets/css/index.less';
import { RoleEnum } from '@/config/bookmarkCfg';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { applyUiDensity } from '@/composables/useUiDensity';
import { MOBILE_OVERLAY_HISTORY_STATE_KEY } from '@/utils/mobileOverlayHistory';
import { bookmarkStore, useUserStore } from '@/store';
import type { WeeklyReportData, WeeklyReportDay } from '@/utils/weeklyReport';
import WeeklyReportHarness from './WeeklyReportHarness.vue';

/*
 * 成长周报视觉验收：?state=friday|monday|history|loading|error&period=current|last&theme=night&locale=en-US&density=small|large
 * 数字取自一次真实账号的只读探针结果，资源标题为示例。
 */
const params = new URLSearchParams(window.location.search);
// 独立夹具常在浮层打开时整页重载；清掉上一份文档留下的占位，避免污染下一用例。
const initialHistoryState = { ...window.history.state };
delete initialHistoryState[MOBILE_OVERLAY_HISTORY_STATE_KEY];
window.history.replaceState(initialHistoryState, '', window.location.href);
window.addEventListener('keydown', (event) => {
  if (event.key === 'F8') {
    event.preventDefault();
    window.history.back();
  }
});
const integration = params.get('integration') === 'local';
if (params.get('share') === 'unsupported') {
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
}
const state = params.get('state') || 'friday';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const mobileRendering = params.get('renderProfile') === 'mobile' || window.innerWidth <= 640;

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobileRendering);
document.body.dataset.visualState = state;
// ?density=small|large 对应紧凑/宽松档；移动端固定标准档。
applyUiDensity(params.get('density'), window.innerWidth <= 767);

function days(start: string, rows: Array<Partial<WeeklyReportDay>>, elapsed = 7): WeeklyReportDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(Date.parse(`${start}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10);
    const row = index < elapsed ? rows[index] || {} : {};
    const total = ['bookmarks', 'notes', 'files', 'todos', 'organized'].reduce(
      (sum, key) => sum + Number(row[key as keyof WeeklyReportDay] || 0),
      0,
    );
    return { day, ...row, total, future: index >= elapsed };
  });
}

const fridayCurrent: WeeklyReportData = {
  bookmarks: 0,
  notes: 2,
  files: 7,
  todos: 4,
  organized: 0,
  exp: 250,
  checkinDays: 4,
  activeDays: 4,
  level: 15,
  levelName: '文圣',
  generatedAt: '2026-10-16',
  period: {
    kind: 'current',
    start: '2026-10-12',
    end: '2026-10-18',
    dataEnd: '2026-10-16',
    elapsedDays: 5,
    inProgress: true,
    week: 42,
    weekYear: 2026,
    compareStart: '2026-10-05',
    compareEnd: '2026-10-09',
  },
  days: days(
    '2026-10-12',
    [
      {},
      { files: 3, notes: 1, checkins: 1 },
      { files: 2, todos: 1, checkins: 1 },
      { notes: 1, todos: 2, checkins: 1 },
      { files: 2, todos: 1, checkins: 1 },
    ],
    5,
  ),
  prev: { bookmarks: 1, notes: 0, files: 0, todos: 1, organized: 0, exp: 58 },
  items: [
    { type: 'file', id: '901', title: '轻笺 Android 分享入口验收记录-1016.png', day: '2026-10-16' },
    { type: 'file', id: '900', title: '周报改版原型截图.png', day: '2026-10-16' },
    { type: 'note', id: 'n-2', title: '成长周报改版：口径、隐私与行动入口的取舍记录', day: '2026-10-15' },
    { type: 'file', id: '899', title: 'Q4 产品路线图.pdf', day: '2026-10-14' },
    { type: 'file', id: '898', title: '用户访谈提纲.docx', day: '2026-10-14' },
    { type: 'file', id: '897', title: '季度复盘数据.xlsx', day: '2026-10-13' },
    { type: 'file', id: '896', title: '竞品截图.png', day: '2026-10-13' },
    { type: 'file', id: '895', title: '', day: '2026-10-13' },
    { type: 'note', id: 'n-1', title: '读书笔记：《原则》第三章', day: '2026-10-13' },
  ],
};

const lastWeek: WeeklyReportData = {
  bookmarks: 1,
  notes: 2,
  files: 0,
  todos: 1,
  organized: 0,
  exp: 92,
  checkinDays: 5,
  activeDays: 3,
  level: 15,
  levelName: '文圣',
  generatedAt: '2026-10-16',
  period: {
    kind: 'last',
    start: '2026-10-05',
    end: '2026-10-11',
    dataEnd: '2026-10-11',
    elapsedDays: 7,
    inProgress: false,
    week: 41,
    weekYear: 2026,
    compareStart: '2026-09-28',
    compareEnd: '2026-10-04',
  },
  days: days('2026-10-05', [
    {},
    { checkins: 1 },
    {},
    { bookmarks: 1, checkins: 1 },
    { todos: 1, checkins: 1 },
    { notes: 2, checkins: 1 },
    { checkins: 1 },
  ]),
  prev: { bookmarks: 0, notes: 0, files: 0, todos: 0, organized: 0, exp: 6 },
  items: [
    { type: 'note', id: 'n-0', title: '一周计划复盘', day: '2026-10-10' },
    { type: 'note', id: 'n-00', title: '设计系统 Token 命名指南', day: '2026-10-10' },
    { type: 'bookmark', id: 'b-0', title: 'MySQL 5.7 排序规则', day: '2026-10-08' },
  ],
};

const mondayCurrent: WeeklyReportData = {
  ...fridayCurrent,
  bookmarks: 0,
  notes: 0,
  files: 0,
  todos: 0,
  organized: 0,
  exp: 0,
  checkinDays: 0,
  activeDays: 0,
  period: { ...fridayCurrent.period, dataEnd: '2026-10-12', elapsedDays: 1, compareEnd: '2026-10-05' },
  days: days('2026-10-12', [], 1),
  prev: { bookmarks: 0, notes: 0, files: 0, todos: 0, organized: 0, exp: 0 },
  items: [],
};

// 更早一周的通知快照：旧版没有 kind 与条目，按历史周报原样展示。
const historySnapshot: WeeklyReportData = {
  bookmarks: 3,
  notes: 1,
  files: 2,
  todos: 5,
  organized: 1,
  exp: 180,
  checkinDays: 6,
  activeDays: 6,
  level: 15,
  levelName: '文圣',
  generatedAt: '2026-10-05',
  period: { start: '2026-09-28', end: '2026-10-04', week: 40, weekYear: 2026 },
  days: days('2026-09-28', [
    { todos: 2, checkins: 1 },
    { bookmarks: 1, checkins: 1 },
    { checkins: 1 },
    { notes: 1, files: 2, checkins: 1 },
    { todos: 3, checkins: 1 },
    { bookmarks: 2, organized: 1, checkins: 1 },
    {},
  ]),
  prev: { bookmarks: 2, notes: 2, files: 0, todos: 3, organized: 0, exp: 120 },
};

const weekly = {
  weekKey: '202642',
  policyVersion: 'C7',
  todayActive: state !== 'monday',
  challenges:
    state === 'monday'
      ? [
          { key: 'wk_collect', metric: 'collect', target: 5, reward: 40, cur: 0 },
          { key: 'wk_note', metric: 'note', target: 3, reward: 60, cur: 0 },
          { key: 'wk_progress', metric: 'progress', target: 5, reward: 60, cur: 0 },
          { key: 'wk_active_days', metric: 'activeDays', target: 5, reward: 50, cur: 0 },
          { key: 'wk_variety', metric: 'variety', target: 3, reward: 40, cur: 0 },
        ].map((item) => ({ ...item, done: false, claimed: false, claimable: false }))
      : [
          {
            key: 'wk_collect',
            metric: 'collect',
            target: 5,
            reward: 40,
            cur: 5,
            done: true,
            claimed: true,
            claimable: false,
          },
          {
            key: 'wk_note',
            metric: 'note',
            target: 3,
            reward: 60,
            cur: 2,
            done: false,
            claimed: false,
            claimable: false,
          },
          {
            key: 'wk_progress',
            metric: 'progress',
            target: 5,
            reward: 60,
            cur: 4,
            done: false,
            claimed: false,
            claimable: false,
          },
          {
            key: 'wk_active_days',
            metric: 'activeDays',
            target: 5,
            reward: 50,
            cur: 4,
            done: false,
            claimed: false,
            claimable: false,
          },
          {
            key: 'wk_variety',
            metric: 'variety',
            target: 3,
            reward: 40,
            cur: 3,
            done: true,
            claimed: false,
            claimable: true,
          },
        ],
};

const pendingForever = () => new Promise<never>(() => {});
let reportFailures = 0;

if (integration) request.defaults.baseURL = 'http://127.0.0.1:19096';
else
  request.defaults.adapter = async (config) => {
    const url = String(config.url || '');
    let data: unknown = null;
    if (url.includes('/api/growth/weeklyReport')) {
      if (state === 'loading') return pendingForever();
      if (state === 'error' && reportFailures++ === 0) throw new Error('VISUAL_WEEKLY_REPORT_LOAD_FAILED');
      const period = config.params?.period === 'last' ? 'last' : 'current';
      await new Promise((resolve) => setTimeout(resolve, 120));
      data = period === 'last' ? lastWeek : state === 'monday' ? mondayCurrent : fridayCurrent;
    } else if (url.includes('/api/growth/weekly')) {
      data = weekly;
    }
    return {
      data: { status: 200, msg: 'ok', data: structuredClone(data) },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: null,
    };
  };

const router = createRouter({
  history: createMemoryHistory(),
  routes: integration
    ? [
        { path: '/growth', component: () => import('@/view/growth/GrowthPage.vue') },
        {
          path: '/notifications',
          component: () => import('@/components/notification/NotificationBell.vue'),
          props: { page: true },
        },
        {
          path: '/:pathMatch(.*)*',
          component: {
            render: () =>
              h('p', { 'data-testid': 'integration-destination' }, `已导航：${router.currentRoute.value.fullPath}`),
          },
        },
      ]
    : [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push(integration ? '/growth' : '/');

const pinia = createPinia();
setActivePinia(pinia);
const app = createApp(WeeklyReportHarness, {
  initialPeriod: params.get('period') === 'last' ? 'last' : 'current',
  snapshot: state === 'history' ? historySnapshot : null,
  integration,
});
app.use(pinia);
app.use(router);
app.use(
  createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
  }),
);

const user = useUserStore(pinia);
user.setUserInfo({
  id: integration ? 'weekly-acceptance-owner' : 'visual-weekly-report-user',
  role: RoleEnum.USER,
  userName: '周报验收账号',
  alias: '周报验收账号',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;

globalDirect(app);
app.mount('#app');

// ?scroll=bottom：数据就绪后把周报内容区滚到底部，便于截取移动端下半屏。
if (params.get('scroll') === 'bottom') {
  window.setTimeout(() => {
    const content = document.querySelector<HTMLElement>('.weekly-report-content');
    if (content) content.scrollTop = content.scrollHeight;
  }, 900);
}
