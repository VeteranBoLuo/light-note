import { createApp, h, provide, computed } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import '@/assets/css/index.less';
import { RoleEnum } from '@/config/bookmarkCfg';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { applyUiDensity } from '@/composables/useUiDensity';
import { MOBILE_LAYOUT_CONTEXT } from '@/composables/useMobileLayout';
import { MOBILE_OVERLAY_HISTORY_STATE_KEY } from '@/utils/mobileOverlayHistory';
import { bookmarkStore, useUserStore } from '@/store';
import type { AnnualReport } from '@/utils/annualReport';
import AnnualReportEntry from '@/components/growth/annualReport/AnnualReportEntry.vue';

/*
 * 年度报告视觉验收：
 * ?state=full|light|empty|upcoming|loading|error&ch=0..8&theme=night&locale=en-US&density=small|large
 * ?view=entry 只看入口行（「今日」可关闭 + 成长中心常驻）。
 * 数字为示例，口径与服务端返回结构一致；入口红点按 2026-12-16 计算。
 */
const params = new URLSearchParams(window.location.search);
const initialHistoryState = { ...window.history.state };
delete initialHistoryState[MOBILE_OVERLAY_HISTORY_STATE_KEY];
window.history.replaceState(initialHistoryState, '', window.location.href);
if (params.get('reduce') === '1') {
  // 截图时模拟“减少动态效果”，数字直接显示终值（后台页不跑 requestAnimationFrame）。
  const original = window.matchMedia.bind(window);
  window.matchMedia = (query: string) =>
    query.includes('prefers-reduced-motion')
      ? ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
      : original(query);
}
const fakeNow = Date.parse('2026-12-16T10:00:00+08:00');
Date.now = () => fakeNow;

const state = params.get('state') || 'full';
const view = params.get('view') || 'report';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const mobile = params.get('renderProfile') === 'mobile' || window.innerWidth <= 767;
document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
applyUiDensity(params.get('density'), mobile);

const days = Array.from({ length: 348 }, (_, index) => {
  const seed = (index * 9301 + 49297) % 233280;
  return seed % 7 < 3 ? 0 : (seed % 11) + (index > 90 && index < 110 ? 6 : 0);
});
const FULL: AnnualReport = {
  year: 2026,
  available: true,
  phase: 'preview',
  start: '2026-01-01',
  dataEnd: '2026-12-14',
  timezone: 'Asia/Shanghai',
  tier: 'full',
  chapters: ['cover', 'overview', 'rhythm', 'notes', 'bookmarks', 'keywords', 'time', 'action', 'poster'],
  profile: { joinedDay: '2025-03-01', joinDays: 641, level: 11, levelName: '翰林' },
  title: { key: 'combined', noun: 'bookmark', modifier: 'night', basis: 38 },
  overview: {
    total: 512,
    byType: { bookmark: 186, note: 142, file: 97, todo: 64, organize: 23 },
    resources: 425,
    batchExcluded: 35,
    first: { type: 'bookmark', id: 'b1', title: 'MDN · CSS 容器查询', date: '2026-01-03' },
    last: { type: 'note', id: 'n9', title: '周末计划', date: '2026-12-14' },
  },
  rhythm: {
    activeDays: 168,
    days,
    months: [22, 18, 35, 78, 52, 41, 47, 55, 49, 58, 39, 18],
    monthActive: [9, 7, 13, 24, 17, 14, 16, 18, 15, 17, 12, 6],
    longestStreak: { days: 19, start: '2026-04-02', end: '2026-04-20' },
    busiestDay: { date: '2026-04-12', count: 23 },
    busiestMonth: { month: 4, count: 78 },
  },
  notes: {
    count: 142,
    chars: 186_000,
    avgChars: 1310,
    perMonth: [6, 5, 9, 22, 15, 11, 13, 14, 12, 17, 12, 6],
    mostRevised: { id: 'n1', title: '2026 读书清单', versions: 37 },
    longest: { id: 'n2', title: '置身事内 · 读书笔记', chars: 12_000 },
    highlights: [
      { id: 'n1', title: '2026 读书清单', versions: 37, chars: 3200 },
      { id: 'n2', title: '置身事内 · 读书笔记', versions: null, chars: 12_000 },
      { id: 'n3', title: 'Vue 3 响应式原理整理', versions: 21, chars: 5400 },
      { id: 'n4', title: '冰岛环岛路线', versions: 9, chars: 2100 },
    ],
  },
  bookmarks: {
    count: 186,
    domains: [
      { domain: 'github.com', count: 31 },
      { domain: 'juejin.cn', count: 18 },
      { domain: 'sspai.com', count: 12 },
      { domain: 'bilibili.com', count: 11 },
      { domain: 'developer.mozilla.org', count: 9 },
    ],
    busiestDay: { date: '2026-03-18', count: 14 },
  },
  keywords: {
    top: [
      { id: 't1', name: '前端', count: 64 },
      { id: 't2', name: '读书', count: 41 },
      { id: 't3', name: 'Android', count: 27 },
      { id: 't4', name: '旅行', count: 18 },
      { id: 't5', name: '健身', count: 12 },
    ],
    newTags: [
      { id: 't3', name: 'Android', count: 27, month: 3 },
      { id: 't5', name: '健身', count: 12, month: 9 },
    ],
  },
  time: {
    hours: [3, 1, 0, 0, 0, 0, 2, 6, 12, 18, 21, 16, 11, 14, 17, 19, 17, 13, 9, 11, 18, 52, 68, 75],
    peakHour: 23,
    peakSegment: { key: 'night', from: 21, to: 24, share: 38 },
    weekdayShare: 71,
  },
  action: {
    todos: 64,
    organized: 23,
    checkinDays: 121,
    longestCheckinStreak: 46,
    achievements: 9,
    points: 3420,
    exp: 9000,
    startLevel: 1,
    level: 11,
    since: '2026-07-08',
  },
  light: null,
};
const LIGHT: AnnualReport = {
  ...FULL,
  tier: 'light',
  chapters: ['cover', 'overview', 'poster'],
  profile: { joinedDay: '2026-11-02', joinDays: 43, level: 3, levelName: '秀才' },
  title: { key: 'starter', noun: null, modifier: null, basis: null },
  overview: {
    total: 9,
    byType: { bookmark: 6, note: 3, file: 0, todo: 0, organize: 0 },
    resources: 9,
    batchExcluded: 0,
    first: { type: 'bookmark', id: 'l1', title: '少数派 · 首页', date: '2026-11-02' },
    last: { type: 'note', id: 'l9', title: '年底要读的书', date: '2026-12-09' },
  },
  rhythm: { ...FULL.rhythm!, activeDays: 4, longestStreak: { days: 1, start: '2026-11-02', end: '2026-11-02' } },
  notes: null,
  bookmarks: null,
  keywords: null,
  time: null,
  action: { ...FULL.action!, todos: 0, checkinDays: 2, level: 3, startLevel: 1 },
  light: {
    items: [
      ['bookmark', '少数派 · 首页', '2026-11-02'],
      ['bookmark', 'GitHub', '2026-11-02'],
      ['note', '读书计划', '2026-11-02'],
      ['bookmark', '豆瓣读书', '2026-11-09'],
      ['bookmark', 'MDN Web Docs', '2026-11-09'],
      ['note', '待买清单', '2026-11-23'],
      ['bookmark', '即刻', '2026-11-23'],
      ['bookmark', '小宇宙播客', '2026-12-09'],
      ['note', '年底要读的书', '2026-12-09'],
    ].map(([type, title, date], index) => ({ type, id: `l${index}`, title, date }) as any),
    from: 'join',
    weeks: [3, 2, 0, 2, 0, 2, 0],
  },
};

function reportFor(): AnnualReport {
  if (state === 'light') return LIGHT;
  if (state === 'empty') return { year: 2026, available: true, tier: 'empty', chapters: [], phase: 'preview' };
  if (state === 'upcoming') return { year: 2026, available: false, openFrom: '2026-12-15T00:00:00.000+08:00' };
  return FULL;
}

let failures = 0;
request.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  let data: unknown = null;
  if (url.includes('/api/growth/annual-report/status')) {
    data = { year: 2026, available: true, eligible: true, entryActive: true };
  } else if (url.includes('/api/growth/annual-report/complete')) {
    data = { key: 'annual_review_2026', newlyUnlocked: true };
  } else if (url.includes('/api/growth/annual-report')) {
    if (state === 'loading') return new Promise<never>(() => {});
    if (state === 'error' && failures++ === 0) throw new Error('VISUAL_ANNUAL_REPORT_LOAD_FAILED');
    await new Promise((resolve) => setTimeout(resolve, 120));
    data = reportFor();
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
  routes: [
    { path: '/growth/annual/:year', component: () => import('@/view/growth/AnnualReportPage.vue') },
    { path: '/growth', component: () => import('@/view/growth/GrowthPage.vue') },
    { path: '/:pathMatch(.*)*', component: { render: () => h('p', `已导航：${router.currentRoute.value.fullPath}`) } },
  ],
});
// ?view=growth：挂载成长中心，只看页头入口（其余成长接口返回空数据）。
await router.push(view === 'growth' ? '/growth' : '/growth/annual/2026');

const pinia = createPinia();
setActivePinia(pinia);
const app = createApp({
  setup() {
    provide(
      MOBILE_LAYOUT_CONTEXT,
      computed(() => mobile),
    );
    return () =>
      view === 'entry'
        ? h('main', { class: 'annual-entry-harness', style: 'padding:16px;display:grid;gap:14px;max-width:420px' }, [
            h('p', '「今日」入口（可关闭）'),
            h(AnnualReportEntry, { source: '今日' }),
            h('p', '移动成长中心入口（常驻）'),
            h(AnnualReportEntry, { source: '成长中心', dismissible: false }),
          ])
        : h('div', { style: mobile ? 'height:100vh;width:100%' : 'height:100vh;width:100%' }, [h(RouterView)]);
  },
});
app.use(pinia);
app.use(router);
app.use(createI18n({ legacy: false, locale, fallbackLocale: 'zh-CN', messages: { 'zh-CN': zhCN, 'en-US': enUS } }));
const user = useUserStore(pinia);
user.setUserInfo({
  id: 'visual-annual-report-user',
  role: RoleEnum.USER,
  userName: '小满',
  alias: '小满',
  preferences: { theme, lang: locale } as any,
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
globalDirect(app);
app.mount('#app');

document.getElementById('app')!.style.width = '100%';
// ?reduce=1：截图时关闭入场动画（后台页的动画会被节流），动效本身另行在前台验收。
if (params.get('reduce') === '1') {
  const style = document.createElement('style');
  style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
  document.head.append(style);
}

// ?ch=N：报告就绪后翻到第 N 页（桌面用方向键，手机用读屏翻页按钮）。
const chapter = Number(params.get('ch') || 0);
if (chapter > 0) {
  const timer = window.setInterval(() => {
    if (!document.querySelector('.ard-body, .arm-story')) return;
    window.clearInterval(timer);
    for (let index = 0; index < chapter; index++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      document.querySelector<HTMLElement>('.arm-sr .b_btn:last-child')?.click();
    }
  }, 50);
}
