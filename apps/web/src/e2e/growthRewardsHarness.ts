import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import request from '@/http/request';
import { bookmarkStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import type { Achievement, GrowthTask, GrowthTasksData } from '@/composables/useGrowth';
import GrowthTasks from '@/components/growth/GrowthTasks.vue';
import AchievementWall from '@/components/growth/AchievementWall.vue';
import MilestoneLadder from '@/components/growth/MilestoneLadder.vue';
import PointsSummary from '@/components/growth/PointsSummary.vue';
import PointsSimulatorPanel from '@/view/admin/components/pointsOps/PointsSimulatorPanel.vue';
import globalDirect from '@/config/globalDirect';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// 真实组件与模拟奖励状态；拦截全部业务请求，不连接真实后端。
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
// 验收页复用完整词库，无需为这份夹具再次推断全部翻译键。
const messages: Record<string, any> = { 'zh-CN': zhCN, 'en-US': enUS };
const scenario = params.get('scenario') || 'done';
const panel = params.get('panel') || 'all';
applyUiDensity(params.get('density'), mobile);
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
document.body.style.display = 'block';
Object.assign(document.getElementById('app')!.style, { width: '100%', height: '100%', overflow: 'auto' });
const simulatorDefaults = {
  checkinDaily: 20,
  dailyQuestDaily: 15,
  weeklyChallenges: 120,
  freeDrawExpected: 15,
  achievementPool: 4710,
  milestonePool: 2950,
  activeRatio: 0.35,
  consumptionRatio: 0.65,
  activeUsers: 1000,
};
const simulatorCalls: Record<string, number>[] = [];
const pointsSummary = {
  balance: 3817,
  last28Days: { earned: 900, spent: 140 },
  sources: [],
  earningRules: {
    checkin: { base: 15, maximum: 20 },
    daily: (params.get('rules') === 'previous' ? [15, 25] : [5, 10]).map((points, index) => ({
      required: index + 2,
      points,
    })),
    weekly: [{ reward: params.get('rules') === 'previous' ? 270 : 120 }],
  },
};
request.defaults.adapter = async (config) => {
  const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  const simulator = String(config.url).endsWith('/pointsSimulator');
  const input = { ...simulatorDefaults, ...payload };
  if (simulator) simulatorCalls.push(payload);
  return {
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: {
      status: 200,
      data: simulator
        ? {
            input,
            stableWeek: input.checkinDaily * 7 + input.dailyQuestDaily * 7 + input.weeklyChallenges,
            tiers: [],
            goalCycles: [],
            policyVersion: 'points-earning-c8',
          }
        : String(config.url).endsWith('/points/summary')
          ? pointsSummary
          : {},
    },
  };
};
Object.assign(window, { growthRewardsFixture: { simulatorCalls } });

const taskEntries = [
  ['profile_avatar', 'profileAvatar'],
  ['first_note', 'firstNote'],
  ['first_bookmark', 'firstBookmark'],
  ['first_todo', 'firstTodo'],
  ['first_file', 'firstFile'],
  ['first_organize', 'firstOrganize'],
];
const allTasks: GrowthTask[] = taskEntries.map(([taskKey, label], index) => {
  const completed = scenario === 'done' || (scenario === 'claimable' && index === 0);
  const claimed = scenario === 'done';
  return {
    taskKey,
    titleKey: `growth.tasks.${label}.title`,
    descriptionKey: `growth.tasks.${label}.description`,
    rewardExp: 50,
    status: completed ? 'completed' : 'pending',
    completed,
    claimed,
    claimable: completed && !claimed,
    completedAt: null,
    claimedAt: null,
  };
});
const data: GrowthTasksData = {
  tasks: allTasks.filter((task) => !task.claimed),
  allTasks,
  completedTasks: allTasks.filter((task) => task.claimed),
  totalCount: allTasks.length,
  completedCount: allTasks.filter((task) => task.completed).length,
  claimedCount: allTasks.filter((task) => task.claimed).length,
  claimableCount: allTasks.filter((task) => task.claimable).length,
  remainingCount: allTasks.filter((task) => !task.completed).length,
  activeCount: allTasks.filter((task) => !task.claimed).length,
};
const achievements: Achievement[] = [
  {
    key: 'bookmark_500',
    group: 'create',
    target: 500,
    cur: 262,
    minLevel: 8,
    currentLevel: 15,
    reward: 200,
    frameId: 'frame_bookmark_archive',
    unlocked: false,
  },
  {
    key: 'note_500',
    group: 'create',
    target: 500,
    cur: 123,
    minLevel: 8,
    currentLevel: 3,
    reward: 300,
    frameId: 'frame_note_constellation',
    unlocked: false,
  },
  {
    key: 'file_500',
    group: 'create',
    target: 500,
    cur: 400,
    minLevel: 8,
    currentLevel: 7,
    reward: 250,
    frameId: 'frame_file_constellation',
    unlocked: false,
  },
  { key: 'note_10', group: 'create', target: 10, cur: 10, reward: 40, unlocked: true, claimable: true },
];
const milestones = [7, 30, 100, 365].map((days, index) => ({
  days,
  points: [50, 300, 600, 2000][index],
  storageMb: [0, 512, 1024, 2048][index],
  cards: [1, 2, 3, 5][index],
  reached: days <= 30,
}));
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { render: () => null } }],
});
const pinia = createPinia();
bookmarkStore(pinia).screenWidth = window.innerWidth;
const app = createApp({
  render: () =>
    h(
      'main',
      {
        style: {
          padding: 'var(--ui-space-20, 20px)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 'var(--ui-space-24, 24px)',
          color: 'var(--text-color)',
          background: 'var(--background-color)',
        },
      },
      [
        h('p', { style: { color: 'var(--desc-color)', margin: 0 } }, '模拟数据 · 成长奖励布局验收'),
        ...(panel === 'simulator' ? [h(PointsSimulatorPanel)] : []),
        ...(panel === 'points' ? [h(PointsSummary)] : []),
        ...(['all', 'tasks'].includes(panel) ? [h(GrowthTasks, { data, readOnly: scenario === 'readonly' })] : []),
        ...(['all', 'achievements'].includes(panel)
          ? [
              h(AchievementWall, {
                achievements,
                unlockedCount: 1,
                totalAchievements: 4,
                claimableCount: 1,
                readOnly: scenario === 'readonly',
              }),
            ]
          : []),
        ...(['all', 'milestones'].includes(panel) ? [h(MilestoneLadder, { milestones, currentStreak: 30 })] : []),
      ],
    ),
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale, messages }));
globalDirect(app);
await router.push('/');
await router.isReady();
app.mount('#app');
