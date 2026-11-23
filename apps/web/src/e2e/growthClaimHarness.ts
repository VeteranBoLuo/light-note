import { createApp, defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import { refreshManorAttention, useManorAttention } from '@/composables/useManorAttention';
import WorkbenchGrowth from '@/components/workbenches/WorkbenchGrowth.vue';
import GrowthPage from '@/view/growth/GrowthPage.vue';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// 真实工作台卡、成长中心与共享状态；全部业务请求由合成数据响应，不访问实际账号或后端。
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const scenario = params.get('scenario') || 'water';
const locale = params.get('locale') || 'zh-CN';
const pinia = createPinia();
setActivePinia(pinia);
useUserStore(pinia).$patch({ id: 'growth-claim-fixture', role: 'user', adminContext: null });
bookmarkStore(pinia).screenWidth = innerWidth;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.body.style.cssText = 'display:block;margin:0;background:var(--background-color);color:var(--text-color)';
applyUiDensity(params.get('density') || 'standard', mobile);
let signed = scenario !== 'signin';
let stagesClaimed = signed;
let waterClaimed = scenario === 'empty' ? 25 : 0;
let mixedClaimed = scenario !== 'mixed';
let extraExp = 0;
let extraPoints = 0;
let water = scenario === 'full' ? 60 : scenario === 'partial' ? 58 : 35;
const calls: string[] = [];
const available = () => Math.min((signed ? 25 : 20) - waterClaimed, 60 - water);
const growth = () => ({
  exp: 85 + (signed ? 21 : 0) + extraExp,
  level: 1,
  name: '蒙童',
  points: 250 + (signed ? 30 : 0) + extraPoints,
  spaceMb: 1024,
  aiTokenDaily: 100000,
  streak: signed ? 4 : 3,
  checkedInToday: signed,
  levelStartExp: 0,
  nextLevelExp: 500,
  expToNext: 394,
  progress: 21,
  dailyExp: 21,
  dailyCap: 200,
  protectCards: 0,
  makeupDays: [],
  features: { growthCenterV2: true, manor: true },
});
const quests = () => [
  { key: 'checkin', done: signed },
  { key: 'daily_note', done: true },
  { key: 'daily_bookmark', done: true },
];
const bonus = () => ({
  exp: 15,
  points: 15,
  claimed: stagesClaimed,
  claimable: !stagesClaimed,
  completedCount: signed ? 3 : 2,
  total: 3,
  stages: [
    { key: 'basic', required: 2, exp: 5, points: 5, claimed: stagesClaimed, claimable: !stagesClaimed },
    { key: 'complete', required: 3, exp: 10, points: 10, claimed: stagesClaimed, claimable: !stagesClaimed && signed },
  ],
});
const attention = () => ({
  fresh: false,
  water: available(),
  ripe: 0,
  rewards: 0,
  waterTiers: [10, 20, 25],
  dailyWater: 25,
});
const claimable = () => {
  const daily = {
    count: bonus().stages.filter((s) => s.claimable).length,
    items: bonus().stages.filter((s) => s.claimable),
  };
  const manor = {
    count: available() > 0 ? 1 : 0,
    items: [],
    water: available(),
    pending: (signed ? 25 : 20) - waterClaimed,
    bucketFull: water === 60,
  };
  const count = daily.count + manor.count + (mixedClaimed ? 0 : 2);
  return {
    count,
    daily,
    manor,
    growthTasks: { count: mixedClaimed ? 0 : 1, items: [] },
    achievements: { count: mixedClaimed ? 0 : 1, items: [] },
    weekly: { count: 0, items: [] },
    community: { count: 0, items: [] },
    today: { completed: signed ? 3 : 2, total: 3, claimableCount: count },
  };
};
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  calls.push(url);
  let data: unknown = {};
  let status = 200;
  if (url.endsWith('/growth/me')) data = growth();
  else if (url.endsWith('/growth/claimable')) data = claimable();
  else if (url.endsWith('/growth/dashboard'))
    data = {
      stats: {
        checkinDays: [],
        totalCheckins: signed ? 4 : 3,
        maxStreak: 4,
        bookmarkCount: 2,
        noteCount: 3,
        fileCount: 0,
        totalActiveDays: 4,
        joinedDays: 7,
      },
      quests: quests(),
      questBonus: bonus(),
      achievements: [],
      streakMilestones: [],
    };
  else if (url.endsWith('/growth/manor/attention')) data = attention();
  else if (url.endsWith('/growth/checkin')) {
    const already = signed;
    signed = true;
    stagesClaimed = true;
    data = { ok: true, already, streak: 4, expGained: 21, pointsEarned: 30, growth: growth() };
  } else if (url.endsWith('/growth/claimAll')) {
    if (scenario === 'failure') {
      status = 500;
      data = null;
    } else {
      const drops = available();
      water += drops;
      waterClaimed += drops;
      const receipts: Record<string, unknown>[] =
        drops > 0 ? [{ type: 'manor', key: 'dailyWater', status: 'claimed', reward: { water: drops } }] : [];
      if (!mixedClaimed)
        receipts.push(
          { type: 'growthTask', key: 'first_note', status: 'claimed' },
          { type: 'achievement', key: 'fixture-b', status: 'claimed' },
        );
      extraExp += mixedClaimed ? 0 : 25;
      extraPoints += mixedClaimed ? 0 : 80;
      data = {
        ok: true,
        claimed: receipts.length,
        receipts,
        water: drops,
        exp: mixedClaimed ? 0 : 25,
        points: mixedClaimed ? 0 : 80,
        frames: mixedClaimed ? [] : ['frame-a'],
        growth: growth(),
      };
      mixedClaimed = true;
    }
  } else if (url.endsWith('/growth/ranks'))
    data = [{ level: 1, name: '蒙童', cumExp: 0, spaceMb: 1024, aiTokenDaily: 100000 }];
  else if (url.endsWith('/growth/preferences'))
    data = { timezone: 'Asia/Shanghai', weeklyActiveTarget: 3, celebrationEnabled: false };
  else if (url.endsWith('/growth/tasks')) data = { allTasks: [], tasks: [], completedTasks: [] };
  else if (url.endsWith('/growth/weekly')) data = { challenges: [], weekKey: '202648' };
  else if (url.endsWith('/growth/inventory'))
    data = { items: [], assets: { points: growth().points, storageBonusMb: 0, aiBonusTokens: 0 } };
  else if (url.endsWith('/growth/lottery'))
    data = { freeRemaining: 0, freeDailyLimit: 1, points: growth().points, prizes: [] };
  else if (url.includes('/growth/heatmap'))
    data = {
      year: 2026,
      days: [],
      summary: { activeDays: 4, longestStreak: 4, recent7Days: 2 },
      availableYears: [2026],
    };
  else if (url.includes('/annual-report/status')) data = { visible: false };
  return {
    data: { status, data, msg: status === 200 ? 'success' : '模拟领取失败' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
};
const Workbench = defineComponent({
  setup() {
    const { attention: state } = useManorAttention();
    return () =>
      h(
        'main',
        {
          style: {
            width: '100%',
            boxSizing: 'border-box',
            maxWidth: mobile ? '100%' : '600px',
            padding: 'var(--ui-space-16, 16px)',
            margin: 'auto',
          },
        },
        [
          h(
            'p',
            { 'data-attention': '', role: 'status' },
            state.value?.water ? `庄园 · ${state.value.water} 滴水可领` : '庄园 · 暂无可领水滴',
          ),
          h(WorkbenchGrowth, { compactToday: mobile, expanded: false }),
        ],
      );
  },
});
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/workbenches', component: Workbench },
    { path: '/growth', component: GrowthPage },
  ],
});
await router.push(params.get('panel') === 'growth' ? '/growth' : '/workbenches');
await router.isReady();
const app = createApp(RouterView)
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
app.mount('#app');
await refreshManorAttention(true);
Object.assign(window, {
  growthClaimFixture: {
    calls,
    snapshot: () => ({ signed, stagesClaimed, waterClaimed, water, claimable: claimable() }),
    visit: (path: string) => router.push(path),
  },
});
