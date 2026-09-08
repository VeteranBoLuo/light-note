import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { bookmarkStore, useUserStore } from '@/store';
import AdminOverview from '@/view/admin/components/overview/AdminOverview.vue';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { createUserActivityRuntime } from '@/utils/userActivityRuntime';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search);
const state = params.get('state') || 'default';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const day = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const metrics = { reports: 0, callbacks: [] as number[], state, listRequests: 0 };
(window as any).__activityAcceptance = metrics;
const snapshot = () => ({
  users: { total: 252, today: 0 },
  resources: {
    bookmarkTotal: 1712,
    noteTotal: 608,
    fileTotal: 548,
    bookmarkToday: 6,
    noteToday: 1,
    fileToday: 5,
    storageMb: 4000,
    trashMb: 800,
    trashCount: 53,
  },
  active: {
    available: state !== 'unavailable',
    today: state === 'unavailable' ? null : state === 'empty' ? 0 : 23,
    week: 40,
    partialToday: state === 'partial',
  },
  ai: { todayCount: 14, todayTokens: 27204 },
  system: { apiToday: 647, apiBusinessErrorsToday: 2, apiInvalidRequestsToday: 1, apiServerErrorsToday: 0 },
  pending: { opinion: 0, security: 0 },
  todos: { total: 275, createdToday: 1, pending: 77, dueToday: 1, overdue: 21, completedToday: 0 },
  generatedAt: `${day()} 09:25`,
});
function response(config: any, data: unknown, status = 200) {
  return { data: { status, data, msg: '' }, status: 200, statusText: 'OK', headers: {}, config };
}
request.defaults.adapter = async (config) => {
  const body = JSON.parse(config.data || '{}');
  if (config.url?.endsWith('getAdminOverviewSnapshot')) return response(config, snapshot());
  if (config.url?.endsWith('getAdminOverviewTrend'))
    return response(config, {
      days: 7,
      granularity: 'day',
      trend: [],
      todayBaseline: { available: true, metrics: {}, sampleDays: 7 },
    });
  if (config.url?.endsWith('getAdminOverviewRecent'))
    return response(config, { items: [], hasMore: false, nextCursor: null });
  if (config.url?.endsWith('getAdminOverviewActiveUsers')) {
    metrics.listRequests++;
    await new Promise((resolve) => setTimeout(resolve, state === 'loading' ? 10_000 : 100));
    if (
      metrics.state === 'error' ||
      metrics.state === 'unavailable' ||
      (metrics.state === 'append-error' && body.cursor)
    )
      return response(config, null, 503);
    const total = metrics.state === 'empty' ? 0 : 23;
    const offset = body.cursor ? 20 : 0;
    return response(config, {
      total,
      date: day(),
      snapshotAt: `${day()} 09:25:00.000`,
      hideInternal: body.hideInternal,
      items: Array.from({ length: Math.min(20, Math.max(0, total - offset)) }, (_, i) => ({
        id: `fixture-user-${offset + i + 1}`,
        name: i === 0 ? '正在阅读的用户 · 一个较长昵称' : `用户 ${offset + i + 1}`,
        userRemark: '仅当前管理员可见的备注',
        firstActiveAt: `${day()} 09:00:00.000`,
        lastActiveAt: `${day()} 09:24:00.000`,
      })),
      hasMore: total > 20 && !body.cursor,
      nextCursor: total > 20 && !body.cursor ? 'next' : null,
      partialToday: state === 'partial',
      startedAt: `${day()} 08:00:00.000`,
    });
  }
  // Fixtures are isolated: unexpected requests never reach a real backend.
  throw new Error('UNEXPECTED_ACTIVITY_FIXTURE_REQUEST');
};
const pinia = createPinia();
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: AdminOverview }] });
const app = createApp({ render: () => h(AdminOverview) });
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale, fallbackLocale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
useUserStore(pinia).setUserInfo({
  id: 'fixture-root',
  role: 'root',
  alias: 'Fixture',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
globalDirect(app);
app.mount('#app');
if (params.get('capture') !== 'off') {
  // Instrument only the collector's callbacks; production does not collect timing samples.
  const wrappers = new Map<string, EventListener>();
  const measuredDoc = {
    get visibilityState() {
      return document.visibilityState;
    },
    hasFocus: () => document.hasFocus(),
    addEventListener: (name: string, listener: EventListener, options?: AddEventListenerOptions) => {
      const measured: EventListener = (event) => {
        const start = performance.now();
        listener(event);
        metrics.callbacks.push(performance.now() - start);
      };
      wrappers.set(name, measured);
      document.addEventListener(name, measured, options);
    },
    removeEventListener: (name: string, listener: EventListener, options?: EventListenerOptions) =>
      document.removeEventListener(name, wrappers.get(name) || listener, options),
  } as unknown as Document;
  const runtime = createUserActivityRuntime({
    doc: measuredDoc,
    report: async () => {
      metrics.reports++;
      return true;
    },
  });
  runtime.setOwner('activity-browser-fixture');
  (window as any).__disposeActivity = () => runtime.dispose();
}
