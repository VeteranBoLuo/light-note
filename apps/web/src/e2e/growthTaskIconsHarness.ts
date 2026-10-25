import { createApp, h, reactive, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import DailyQuests from '@/components/growth/DailyQuests.vue';
import WeeklyChallenge from '@/components/growth/WeeklyChallenge.vue';
import GrowthTasks from '@/components/growth/GrowthTasks.vue';
import BTabs from '@/components/base/BasicComponents/BTabs.vue';
import type { GrowthTask, GrowthTasksData, Quest, QuestBonus, WeeklyData } from '@/composables/useGrowth';
import { applyUiDensity } from '@/composables/useUiDensity';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// 真实组件 + 隔离数据。所有请求都在夹具内响应，不访问业务后端。
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const state = params.get('state') || 'mixed';
const compact = params.get('compact') === 'true';
const readOnly = params.get('readonly') === 'true';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
document.body.style.cssText = 'display:block;margin:0;background:var(--background-color);color:var(--text-color)';
document.getElementById('app')!.style.cssText = 'width:100%;height:100vh;overflow:auto';

async function mountFixture() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useUserStore().$patch({ id: 'task-icons-fixture', role: 'user' });
  bookmarkStore().screenWidth = innerWidth;
  applyUiDensity(params.get('density'), mobile);
  const i18n = createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } });
  const { t } = i18n.global;
  const completed = (index: number) => state === 'done' || (state === 'mixed' && index % 3 !== 1);
  const claimed = (index: number) => state === 'done' || (state === 'mixed' && index % 3 === 2);
  const quests = reactive<Quest[]>(
    (params.get('catalog') === 'all'
      ? [
          'checkin',
          'daily_bookmark',
          'daily_note',
          'daily_file',
          'daily_todo_create',
          'daily_todo',
          'daily_organize',
          'knowledge_action_1',
          'knowledge_action_2',
          'create',
          'exp30',
          'unknown',
        ]
      : ['checkin', 'daily_bookmark', 'daily_note']
    ).map((key, index) => ({ key, done: completed(index), cur: completed(index) ? 1 : 0, target: 1 })),
  );
  const doneCount = quests.filter((quest) => quest.done).length;
  const stages = [2, 3].map((required, index) => ({
    key: index ? 'complete' : 'basic',
    required,
    exp: index ? 10 : 5,
    points: index ? 10 : 5,
    claimable: doneCount >= required && state !== 'done',
    claimed: state === 'done',
  }));
  const bonus = reactive<QuestBonus>({
    exp: 15,
    points: 15,
    claimable: stages.some((stage) => stage.claimable),
    claimed: state === 'done',
    stages,
  });
  const entries = [
    ['profile_avatar', 'profileAvatar'],
    ['first_note', 'firstNote'],
    ['first_bookmark', 'firstBookmark'],
    ['first_todo', 'firstTodo'],
    ['first_file', 'firstFile'],
    ['first_organize', 'firstOrganize'],
  ];
  const allTasks: GrowthTask[] = entries.map(([taskKey, label], index) => ({
    taskKey,
    titleKey: `growth.tasks.${label}.title`,
    descriptionKey: `growth.tasks.${label}.description`,
    rewardExp: 30,
    status: completed(index) ? 'completed' : 'pending',
    completed: completed(index),
    claimed: claimed(index),
    claimable: completed(index) && !claimed(index),
    completedAt: null,
    claimedAt: null,
  }));
  const data: GrowthTasksData = {
    allTasks,
    tasks: allTasks.filter((task) => !task.claimed),
    completedTasks: allTasks.filter((task) => task.claimed),
    totalCount: allTasks.length,
    completedCount: allTasks.filter((task) => task.completed).length,
    claimedCount: allTasks.filter((task) => task.claimed).length,
    claimableCount: allTasks.filter((task) => task.claimable).length,
    remainingCount: allTasks.filter((task) => !task.completed).length,
    activeCount: allTasks.filter((task) => !task.claimed).length,
  };
  const weekly: WeeklyData = {
    weekKey: '2026-10-19',
    todayActive: true,
    challenges: [
      ['wk_collect', 'collect', 5, 40],
      ['wk_note', 'note', 3, 60],
      ['wk_progress', 'progress', 5, 60],
      ['wk_active_days', 'activeDays', 5, 50],
      ['wk_variety', 'variety', 3, 40],
      ['wk_organize', 'organize', 3, 20],
    ].map(([key, metric, target, reward], index) => ({
      key: String(key),
      metric: String(metric),
      target: Number(target),
      reward: Number(reward),
      cur: completed(index) ? Number(target) : 1,
      done: completed(index),
      claimed: claimed(index),
      claimable: completed(index) && !claimed(index),
    })),
  };
  weekly.earnedPoints = weekly.challenges
    .filter((challenge) => challenge.claimed)
    .reduce((sum, challenge) => sum + challenge.reward, 0);
  weekly.totalPoints = weekly.challenges.reduce((sum, challenge) => sum + challenge.reward, 0);
  request.defaults.adapter = async (config) => {
    if (state === 'loading') await new Promise(() => {});
    const failed = state === 'error';
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        status: failed ? 500 : 200,
        data: failed
          ? null
          : state === 'empty'
            ? { ...weekly, challenges: [], earnedPoints: 0, totalPoints: 0 }
            : weekly,
      },
    };
  };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  const panel = ref(params.get('panel') || 'daily');
  const components = {
    daily: () => h(DailyQuests, { quests, bonus, compact, readOnly, showClaimAction: false }),
    weekly: () => h(WeeklyChallenge, { readOnly }),
    onboarding: () => h(GrowthTasks, { data, compact, readOnly }),
  };
  const app = createApp({
    render: () =>
      h(
        'main',
        {
          class: 'growth-page',
          style: {
            padding: 'var(--ui-space-20, 20px)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: 'var(--ui-space-20, 20px)',
          },
        },
        [
          h('small', { style: { color: 'var(--desc-color)' } }, '模拟数据 · 任务路线图标验收'),
          h(BTabs, {
            style: { minWidth: 0, overflowX: 'auto' },
            activeTab: panel.value,
            'onUpdate:activeTab': (value: string) => {
              panel.value = value;
            },
            options: [
              { key: 'daily', label: t('growth.dashTasks') },
              { key: 'weekly', label: t('growth.weeklyTitle') },
              { key: 'onboarding', label: t('growth.tasksTitle') },
            ],
          }),
          h(
            'div',
            {
              style: {
                display: 'grid',
                gridTemplateColumns:
                  panel.value === 'all' ? 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' : 'minmax(0, 1fr)',
                gap: 'var(--ui-space-20, 20px)',
                alignItems: 'start',
              },
            },
            Object.entries(components)
              .filter(([key]) => panel.value === 'all' || panel.value === key)
              .map(([key, render]) => h('section', { key, class: 'growth-panel', style: { minWidth: 0 } }, render())),
          ),
        ],
      ),
  });
  app.use(pinia).use(router).use(i18n);
  app.directive('click-log', {});
  await router.push('/growth?section=tasks');
  await router.isReady();
  app.mount('#app');
}

// 同源 iframe 提供真实的窄 CSS 视口，便于无设备模拟接口的浏览器验收媒体查询。
const viewport = Number(params.get('viewport'));
if ([320, 390].includes(viewport)) {
  const child = new URL(location.href);
  child.searchParams.delete('viewport');
  child.searchParams.set('renderProfile', 'mobile');
  const frame = document.createElement('iframe');
  frame.title = `${viewport}px mobile fixture`;
  frame.src = child.href;
  frame.style.cssText = `display:block;width:${viewport}px;height:100vh;margin:0 auto;border:0`;
  document.getElementById('app')!.append(frame);
} else {
  await mountFixture();
}
