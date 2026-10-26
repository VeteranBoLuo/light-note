import { createApp, h, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { bookmarkStore, useUserStore } from '@/store';
import request from '@/http/request';
import { applyUiDensity } from '@/composables/useUiDensity';
import { ACHIEVEMENT_KEYS, achievementVisualFor } from '@/config/achievements';
import AchievementCollection from '@/components/growth/AchievementCollection.vue';
import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
import {
  PUBLIC_RESOURCE_ACHIEVEMENTS,
  PUBLIC_RESOURCE_FRAMES,
} from '../../../server/util/publicResources/achievements.js';
import AchievementEmblem from '@/components/growth/AchievementEmblem.vue';
import AchievementMotionReview from './AchievementMotionReview.vue';
import { renderBuiltinAvatar } from '@/config/builtinAvatars';
import icon from '@/config/icon';
import type { Achievement } from '@/composables/useGrowth';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// Real production components, disposable data. Every API request stays inside this fixture.
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const review = params.get('review') === 'motion';
const portraits = review
  ? [
      await renderBuiltinAvatar('pineapple-scribe'),
      icon.communityChat.defaultAvatar,
      await renderBuiltinAvatar('ink-cat'),
      await renderBuiltinAvatar('white-deer'),
    ]
  : [];
const pinia = createPinia();
setActivePinia(pinia);
useUserStore().$patch({ id: 'achievement-fixture', role: 'user' });
bookmarkStore().screenWidth = innerWidth;
applyUiDensity(params.get('density'), mobile);
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
document.body.style.cssText = 'display:block;margin:0;background:var(--background-color);color:var(--text-color)';
document.getElementById('app')!.style.cssText = 'display:block;width:100%;max-width:none;height:100vh;overflow:auto';
const streak = Number(params.get('streak') ?? 83);
const scenario = params.get('state') || 'mixed';
const achievements = ref<Achievement[]>(
  scenario === 'empty'
    ? []
    : ACHIEVEMENT_KEYS.filter((key) => params.get('group') !== 'sharing' || key.startsWith('public_resource_')).map(
        (key, index) => {
          const target = Number(key.split('_').at(-1));
          const unlocked =
            scenario === 'all' ||
            (scenario !== 'new' &&
              (key.startsWith('streak_')
                ? target <= streak
                : achievementVisualFor(key).tier <= 3 || key.startsWith('level_')));
          const publicAchievement = PUBLIC_RESOURCE_ACHIEVEMENTS.find((a) => a.key === key);
          const publicFrame = PUBLIC_RESOURCE_FRAMES.find((f) => f.achievementKey === key);
          return {
            key,
            group: achievementVisualFor(key).group,
            target,
            cur:
              scenario === 'new'
                ? 0
                : unlocked
                  ? target
                  : key.startsWith('streak_')
                    ? streak
                    : Math.floor(target * 0.76),
            unlocked,
            reward: publicAchievement?.reward || 50,
            claimed: unlocked && key !== 'streak_30' && scenario !== 'claimable',
            claimable: unlocked && (key === 'streak_30' || scenario === 'claimable'),
            frameId:
              publicFrame?.id ||
              (key === 'streak_1'
                ? 'frame_first_light'
                : key === 'bookmark_500'
                  ? 'frame_bookmark_archive'
                  : key === 'note_500'
                    ? 'frame_note_constellation'
                    : null),
            minLevel: publicAchievement?.minLevel || (key === 'bookmark_500' ? 8 : undefined),
            currentLevel: 7,
            unlockedAt: unlocked
              ? new Date(Date.UTC(2026, 9, key === 'level_15' ? 25 : Math.max(1, 24 - index))).toISOString()
              : null,
          };
        },
      ),
);
const claiming = ref<string | null>(null),
  result = ref('');
let featured: string[] = [];
request.defaults.adapter = async (config) => {
  const input = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  if (input.featuredAchievementKeys) featured = input.featuredAchievementKeys;
  return {
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { status: 200, data: { bio: '', showCommunityTenure: true, featuredAchievementKeys: featured, revision: 1 } },
  };
};
async function claim(key: string) {
  if (claiming.value || params.get('readonly') === 'true') return;
  claiming.value = key;
  await new Promise((resolve) => setTimeout(resolve, 450));
  if (params.get('claim') === 'fail') {
    result.value = '模拟领取失败，状态保持，可重试';
    claiming.value = null;
    return;
  }
  achievements.value = achievements.value.map((item) =>
    item.key === key ? { ...item, claimed: true, claimable: false } : item,
  );
  result.value = '模拟领取成功';
  claiming.value = null;
}
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: AchievementCollection }],
});
const app = createApp({
  render: () =>
    h('main', { style: 'max-width:var(--ui-layout-1200,1200px);margin:auto;padding:var(--ui-space-20,20px)' }, [
      h('p', { style: 'color:var(--desc-color);font-size:var(--ui-font-12,12px)' }, '轻笺 · 成就改造验收 · 模拟数据'),
      review ? h(AchievementMotionReview, { portraits, animated: params.get('motion') !== 'off' }) : null,
      h(AchievementCollection, {
        achievements: achievements.value,
        milestones: [7, 30, 100, 365].map((days, index) => ({
          days,
          points: [50, 300, 600, 2000][index],
          storageMb: [0, 512, 1024, 2048][index],
          cards: [1, 2, 3, 5][index],
          reached: streak >= days,
        })),
        currentStreak: streak,
        unlockedCount: achievements.value.filter((a) => a.unlocked).length,
        totalAchievements: achievements.value.length,
        claimableCount: achievements.value.filter((a) => a.claimable).length,
        claimingKey: claiming.value,
        readOnly: params.get('readonly') === 'true',
        animated: params.get('motion') !== 'off',
        onClaim: claim,
      }),
      h('p', { role: 'status' }, result.value),
      params.get('group') === 'sharing' &&
        h(
          'div',
          {
            class: 'contribution-frame-review',
            style: 'display:flex;flex-wrap:wrap;gap:var(--ui-space-24,24px);padding:var(--ui-space-24,24px)',
          },
          PUBLIC_RESOURCE_FRAMES.flatMap((frame) =>
            [36, 64, 128].map((size) =>
              h('div', { 'data-frame': frame.id }, [
                h(AvatarFramePreview, {
                  frameId: frame.id,
                  src: icon.communityChat.defaultAvatar,
                  size,
                  animated: params.get('motion') !== 'off',
                  pauseWhenOffscreen: true,
                }),
                h('p', frame.name),
              ]),
            ),
          ),
        ),
      h(
        'div',
        { style: 'display:flex;gap:var(--ui-space-8,8px);padding:var(--ui-space-20,20px)' },
        [28, 34, 46].map((size) => h(AchievementEmblem, { achievementKey: 'level_15', size })),
      ),
    ]),
});
app.use(pinia);
app.use(router);
app.use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
await router.isReady();
app.mount('#app');
