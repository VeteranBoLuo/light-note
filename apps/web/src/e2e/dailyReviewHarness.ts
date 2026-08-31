import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import dailyReviewApi, {
  type DailyReviewMutationResponse,
  type DailyReviewSnapshot,
  type DailyReviewSnapshotResponse,
} from '@/api/dailyReviewApi';
import '@/assets/css/index.less';
import { RoleEnum } from '@/config/bookmarkCfg';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { resetDailyReview, useDailyReview } from '@/composables/useDailyReview';
import { bookmarkStore, useUserStore } from '@/store';
import DailyReviewHarness from './DailyReviewHarness.vue';

const params = new URLSearchParams(window.location.search);
const visualState = params.get('state') || 'active';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const mobileRendering = params.get('renderProfile') === 'mobile' || window.innerWidth <= 640;

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobileRendering);
document.body.dataset.visualState = visualState;

const activeSnapshot: DailyReviewSnapshot = {
  generated: true,
  date: '2026-09-01',
  timezone: 'Asia/Singapore',
  session: {
    id: '7689e6f4-5e29-4c7d-8c57-dc054d9dc5d3',
    status: 'active',
    itemCount: 3,
    completedAt: null,
    skippedAt: null,
  },
  progress: { done: 0, total: 3, pending: 3 },
  items: [
    {
      id: 'b1e37b80-a17c-4aa2-903d-61be9a28c2a4',
      slot: 1,
      resourceType: 'bookmark',
      resourceId: 'visual-bookmark',
      title: '重新理解长期知识沉淀与检索',
      url: 'https://example.com/daily-review',
      time: '2024-09-01 09:30:00',
      resourceDate: '2024-09-01',
      reasonCode: 'active_tag',
      reasonTag: { id: 'visual-tag', name: '知识管理' },
      action: 'pending',
    },
    {
      id: 'c1e37b80-a17c-4aa2-903d-61be9a28c2a4',
      slot: 2,
      resourceType: 'note',
      resourceId: 'visual-note',
      title: '两年前记录的产品复盘方法',
      url: null,
      time: '2025-12-31 23:59:59',
      resourceDate: '2024-09-01',
      reasonCode: 'on_this_day',
      reasonTag: null,
      action: 'pending',
    },
    {
      id: 'd1e37b80-a17c-4aa2-903d-61be9a28c2a4',
      slot: 3,
      resourceType: 'file',
      resourceId: '3102',
      title: '旧项目研究资料与结论.pdf',
      url: null,
      time: '2026-08-31 23:59:59',
      resourceDate: '2024-01-15',
      reasonCode: 'buried',
      reasonTag: null,
      action: 'pending',
    },
  ],
};

function snapshotForState(state: string): DailyReviewSnapshot {
  if (state === 'empty') {
    return {
      ...activeSnapshot,
      session: { ...activeSnapshot.session!, status: 'empty', itemCount: 0 },
      progress: { done: 0, total: 0, pending: 0 },
      items: [],
    };
  }
  if (state === 'completed') {
    return {
      ...activeSnapshot,
      session: { ...activeSnapshot.session!, status: 'completed', completedAt: '2026-09-01 09:45:00' },
      progress: { done: 3, total: 3, pending: 0 },
      items: activeSnapshot.items.map((item) => ({ ...item, action: 'opened' as const })),
    };
  }
  if (state === 'skipped') {
    return {
      ...activeSnapshot,
      session: { ...activeSnapshot.session!, status: 'skipped', skippedAt: '2026-09-01 09:45:00' },
    };
  }
  return activeSnapshot;
}

function readResponse(snapshot: DailyReviewSnapshot): DailyReviewSnapshotResponse {
  return { status: 200, msg: 'ok', data: structuredClone(snapshot) } as DailyReviewSnapshotResponse;
}

function mutationResponse(snapshot: DailyReviewSnapshot): DailyReviewMutationResponse {
  return {
    status: 200,
    msg: 'ok',
    data: { ok: true, review: structuredClone(snapshot) },
  } as DailyReviewMutationResponse;
}

request.defaults.adapter = async (config) => ({
  data: { status: 200, msg: 'ok', data: null },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
  request: null,
});

const staleBaseState = visualState.endsWith('-stale') ? visualState.slice(0, -'-stale'.length) : null;
const snapshot = snapshotForState(staleBaseState || visualState);
const pendingForever = () => new Promise<never>(() => {});
const failLoad = async () => {
  throw new Error('VISUAL_DAILY_REVIEW_LOAD_FAILED');
};

dailyReviewApi.getTodayDailyReview = async () => readResponse(snapshot);
dailyReviewApi.ensureTodayDailyReview = async () => readResponse(snapshot);
dailyReviewApi.updateDailyReviewItem = async () => mutationResponse(snapshot);
dailyReviewApi.updateDailyReviewToday = async () => mutationResponse(snapshot);

if (visualState === 'loading') {
  dailyReviewApi.getTodayDailyReview = pendingForever;
  dailyReviewApi.ensureTodayDailyReview = pendingForever;
}
if (visualState === 'error') {
  dailyReviewApi.getTodayDailyReview = failLoad;
  dailyReviewApi.ensureTodayDailyReview = failLoad;
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push('/');

const pinia = createPinia();
setActivePinia(pinia);
const app = createApp(DailyReviewHarness, { visualState });
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
const visitor = visualState === 'visitor';
user.setUserInfo({
  id: visitor ? '' : 'visual-daily-review-user',
  role: visitor ? RoleEnum.VISITOR : RoleEnum.USER,
  userName: visitor ? '游客' : '视觉验收用户',
  alias: visitor ? '游客' : '视觉验收用户',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;

resetDailyReview();
if (visualState === 'stale' || staleBaseState || visualState === 'action-error') {
  const dailyReview = useDailyReview();
  await dailyReview.loadDailyReview({ ensure: true });
  if (visualState === 'stale' || staleBaseState) {
    dailyReviewApi.getTodayDailyReview = failLoad;
    dailyReviewApi.ensureTodayDailyReview = failLoad;
  } else {
    dailyReviewApi.updateDailyReviewItem = async () => {
      throw new Error('VISUAL_DAILY_REVIEW_WRITE_FAILED');
    };
    await dailyReview.actOnItem(activeSnapshot.items[0].id, 'open').catch(() => null);
  }
}

globalDirect(app);
app.mount('#app');
