<template>
  <div class="growth-page">
    <div class="growth-container">
      <header class="growth-hero">
        <button class="growth-back" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="16" />
          <span>{{ t('common.back') }}</span>
        </button>
        <h1 class="growth-title">{{ t('growth.pageTitle') }}</h1>
        <p class="growth-subtitle">{{ t('growth.pageSubtitle') }}</p>
        <button class="growth-report-btn" @click="openWeeklyReport">📊 {{ t('growth.weeklyReportEntry') }}</button>
      </header>

      <section class="growth-panel">
        <GrowthCard />
      </section>

      <section v-if="hasRecap" class="growth-panel">
        <RecapCard />
      </section>

      <div class="growth-row">
        <section v-if="questsEnabled" class="growth-panel growth-panel--flex">
          <DailyQuests :quests="quests" :bonus="questBonus" :claiming="claiming" @claim="onClaim" />
        </section>
        <section class="growth-panel growth-panel--flex">
          <GrowthStats :stats="stats" />
        </section>
      </div>

      <section v-if="questsEnabled" class="growth-panel">
        <WeeklyChallenge />
      </section>

      <section class="growth-panel">
        <PointsShop />
      </section>

      <section class="growth-panel">
        <LotteryDraw />
      </section>

      <section v-if="!growth?.isMax" class="growth-panel">
        <SigninCalendar
          :checkin-days="stats.checkinDays"
          :checked-in-today="growth?.checkedInToday"
          :streak="growth?.streak"
          :can-makeup="growth?.canUseProtectCard"
          @makeup="handleCalendarMakeup"
        />
      </section>

      <section v-if="streakMilestones.length" class="growth-panel">
        <MilestoneLadder :milestones="streakMilestones" :current-streak="currentStreak" />
      </section>

      <section class="growth-panel">
        <AchievementWall
          :achievements="achievements"
          :unlocked-count="dashboard?.unlockedCount || 0"
          :total-achievements="dashboard?.totalAchievements || achievements.length"
          :claimable-count="dashboard?.claimableCount || 0"
          :claiming-key="claimingAch"
          @claim="onClaimAchievement"
        />
      </section>

      <section class="growth-panel">
        <GrowthTimeline :items="timeline" />
      </section>
    </div>

    <WeeklyReportModal v-model:visible="wrVisible" :report="wrData" />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import GrowthCard from '@/components/growth/GrowthCard.vue';
  import DailyQuests from '@/components/growth/DailyQuests.vue';
  import GrowthStats from '@/components/growth/GrowthStats.vue';
  import AchievementWall from '@/components/growth/AchievementWall.vue';
  import GrowthTimeline from '@/components/growth/GrowthTimeline.vue';
  import SigninCalendar from '@/components/growth/SigninCalendar.vue';
  import MilestoneLadder from '@/components/growth/MilestoneLadder.vue';
  import PointsShop from '@/components/growth/PointsShop.vue';
  import LotteryDraw from '@/components/growth/LotteryDraw.vue';
  import WeeklyChallenge from '@/components/growth/WeeklyChallenge.vue';
  import RecapCard from '@/components/growth/RecapCard.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import WeeklyReportModal from '@/components/growth/WeeklyReportModal.vue';
  import growthApi from '@/api/growthApi.ts';

  const { t } = useI18n();
  const router = useRouter();
  const { growth, dashboard, recap, loadDashboard, loadRecap, claimDailyBonus, useProtectCard: apiUseProtectCard, claimAchievement } = useGrowth();
  const hasRecap = computed(() => !!recap.value && (recap.value.onThisDay.length > 0 || recap.value.buried.length > 0));

  // 空缺省:游客 / 加载前统一给零值,组件照常渲染(成就全未解锁、统计为 0,呈现"待收集"引导)
  const EMPTY_STATS = {
    joinDays: 0,
    currentStreak: 0,
    maxStreak: 0,
    totalCheckins: 0,
    bookmarkCount: 0,
    noteCount: 0,
    fileCount: 0,
    tagCount: 0,
    weekExp: 0,
    checkinDays: [] as string[],
  };
  const EMPTY_BONUS = { exp: 0, claimed: false, claimable: false };
  const stats = computed(() => dashboard.value?.stats || EMPTY_STATS);
  const achievements = computed(() => dashboard.value?.achievements || []);
  const quests = computed(() => dashboard.value?.quests || []);
  const timeline = computed(() => dashboard.value?.timeline || []);
  // 仅在后端明确 questsEnabled===false(满级/root)时隐藏任务卡;游客/加载中默认展示
  const questsEnabled = computed(() => dashboard.value?.questsEnabled !== false);
  const questBonus = computed(() => dashboard.value?.questBonus || EMPTY_BONUS);
  const streakMilestones = computed(() => dashboard.value?.streakMilestones || []);
  const currentStreak = computed(() => dashboard.value?.currentStreak ?? growth.value?.streak ?? 0);

  const claiming = ref(false);
  async function onClaim() {
    if (claiming.value) return;
    claiming.value = true;
    try {
      const res = await claimDailyBonus();
      if (res?.status === 200 && res.data?.ok) {
        if (res.data.already) {
          message.info(t('growth.questClaimedAlready'));
        } else if (res.data.capped) {
          message.info(t('growth.questCapped'));
        } else {
          const pts = res.data.pointsEarned || 0;
          if (pts > 0) {
            message.success(t('growth.questClaimOkPts', { n: res.data.expGained, p: pts }));
          } else {
            message.success(t('growth.questClaimOk', { n: res.data.expGained }));
          }
          recordOperation({ module: '成长', operation: `领取每日任务奖励（经验+${res.data.expGained}、积分+${pts}）` });
        }
      }
    } catch (err) {
      console.error('领取每日奖励失败:', err);
    } finally {
      claiming.value = false;
    }
  }

  const wrVisible = ref(false);
  const wrData = ref<any>(null);
  async function openWeeklyReport() {
    try {
      const res = await growthApi.getWeeklyReport();
      if (res?.status === 200) {
        wrData.value = res.data;
        wrVisible.value = true;
        recordOperation({ module: '成长', operation: '查看本周周报' });
      }
    } catch (err) {
      console.error('获取周报失败:', err);
    }
  }

  onMounted(() => {
    recordOperation({ module: '成长', operation: '查看我的成长' });
    loadDashboard(); // 每次进页刷新(签到/创建后数据实时变化)
    loadRecap(); // 那年今日/尘封回顾(有内容才在页首展示)
  });

  const claimingAch = ref<string | null>(null);
  async function onClaimAchievement(key: string) {
    if (claimingAch.value) return;
    claimingAch.value = key;
    try {
      const res = await claimAchievement(key);
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.achClaimOk', { n: res.data.reward }));
        recordOperation({ module: '成长', operation: `领取成就奖励 ${key}（+${res.data.reward} 积分）` });
      } else if (res?.data?.reason === 'claimed') {
        message.info(t('growth.achClaimedAlready'));
      } else if (res?.data?.reason === 'locked') {
        message.info(t('growth.achClaimLocked'));
      }
    } catch (err) {
      console.error('领取成就奖励失败:', err);
    } finally {
      claimingAch.value = null;
    }
  }

  const makingUp = ref(false);
  async function handleCalendarMakeup() {
    if (makingUp.value) return;
    makingUp.value = true;
    try {
      const res = await apiUseProtectCard();
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.protectCardOk', { n: res.data.streak }));
        recordOperation({ module: '成长', operation: `使用补签卡（连签续至 ${res.data.streak} 天）` });
        loadDashboard();
      } else {
        message.info(t('growth.protectCardFail'));
      }
    } catch (err) {
      console.error('补签失败:', err);
    } finally {
      makingUp.value = false;
    }
  }
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/home');
  }
</script>

<style scoped lang="less">
  /* 与设置页同理:index.vue 子路由根元素被内联 position:fixed + height:calc(100%-60px),
     必须自身 overflow-y:auto 在固定框内滚动,勿用 min-height:100vh(见记忆 subroute-fixed-scroll)。 */
  .growth-page {
    height: 100%;
    overflow-y: auto;
    padding: 28px 24px 64px;
    box-sizing: border-box;
    background: var(--background-color);
    color: var(--text-color);
  }
  .growth-container {
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  /* 大屏放宽容器,容纳 GrowthCard 的左右两栏,消除 PC 两侧大片留白 */
  @media (min-width: 900px) {
    .growth-container {
      max-width: 960px;
    }
  }
  .growth-hero {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .growth-back {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px 5px 8px;
    margin-bottom: 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 70%, transparent);
    background: transparent;
    color: var(--desc-color);
    font-size: 13px;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
  }
  .growth-back:hover {
    color: var(--primary-color);
    border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
    background: color-mix(in srgb, var(--primary-color) 6%, transparent);
  }
  .growth-title {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .growth-subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--desc-color);
  }
  .growth-report-btn {
    align-self: flex-start;
    margin-top: 10px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
    color: var(--primary-color);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .growth-report-btn:hover {
    background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  }
  .growth-panel {
    border: 1px solid color-mix(in srgb, var(--card-border-color) 62%, transparent);
    border-radius: 16px;
    background: var(--workbench-subcard-bg);
    padding: 20px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.03),
      0 12px 28px -22px rgba(30, 35, 70, 0.35);
    .cal {
      margin: 0 auto;
      width: 50%;
    }
  }
  /* 今日任务 + 数据统计:大屏并排,窄屏堆叠 */
  .growth-row {
    display: flex;
    gap: 18px;
    align-items: stretch;
  }
  .growth-panel--flex {
    flex: 1 1 0;
    min-width: 0;
  }
  @media (max-width: 720px) {
    .growth-row {
      flex-direction: column;
    }
  }
</style>
