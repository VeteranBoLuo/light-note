<template>
  <!-- 年度报告：独立页面。桌面保留全局顶栏，手机全屏沉浸（路由隐藏顶栏与底栏）。 -->
  <div class="annual-report-page" :class="{ 'is-mobile': isMobile }">
    <AnnualReportMobile
      v-if="isMobile"
      v-model:show-name="showName"
      v-model:show-keywords="showKeywords"
      v-bind="layoutProps"
      @next="next"
      @prev="prev"
      @poster="toPoster"
      @retry="load"
      @back="goBack"
      @create="createNote"
      @login="openLogin"
      @open="openTarget"
    />
    <AnnualReportDesktop
      v-else
      v-model:show-name="showName"
      v-model:show-keywords="showKeywords"
      v-bind="layoutProps"
      @go="go"
      @next="next"
      @prev="prev"
      @poster="toPoster"
      @retry="load"
      @back="goBack"
      @create="createNote"
      @login="openLogin"
      @open="openTarget"
    />
    <AchievementUnlockOverlay
      v-if="unlockedAchievement"
      :achievement-key="unlockedAchievement"
      group="tenure"
      :kicker="t('annualReport.achievementCelebration.kicker')"
      :name="t(`growth.achName.${unlockedAchievement}`)"
      :description="t('annualReport.achievementCelebration.sub', { year })"
      @close="unlockedAchievement = null"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router';
  import icon from '@/config/icon';
  import { useAnnualReport } from '@/composables/useAnnualReport';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { bookmarkStore, useUserStore } from '@/store';
  import AnnualReportDesktop from '@/components/growth/annualReport/AnnualReportDesktop.vue';
  import AnnualReportMobile from '@/components/growth/annualReport/AnnualReportMobile.vue';
  import AchievementUnlockOverlay from '@/components/growth/AchievementUnlockOverlay.vue';

  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const { t } = useI18n();
  const isMobile = useMobileLayout();
  const year = computed(() => Number(route.params.year) || 0);

  const {
    report,
    state,
    load,
    chapters,
    index,
    current,
    isFirst,
    isLast,
    go,
    next,
    prev,
    toPoster,
    ownerKey,
    showName,
    showKeywords,
    unlockedAchievement,
  } = useAnnualReport(year);

  const displayName = computed(() => user.alias || user.userName || t('growth.wrUserFallback'));
  const avatarSrc = computed(() => user.headPicture || icon.navigation.user);
  const layoutProps = computed(() => ({
    year: year.value,
    report: report.value,
    state: state.value,
    chapters: chapters.value,
    index: index.value,
    current: current.value,
    isFirst: isFirst.value,
    isLast: isLast.value,
    ownerKey: ownerKey.value,
    displayName: displayName.value,
    avatarSrc: avatarSrc.value,
  }));

  function goBack() {
    if (window.history.state?.back) router.back();
    else void router.replace('/growth');
  }
  function createNote() {
    void router.push('/noteLibrary');
  }
  // 游客：在原地登录或注册，成功后回到本页继续看自己的报告。
  function openLogin() {
    bookmarkStore().openAuthModal('登录', 'annual_report', route.fullPath);
  }
  function openTarget(target: RouteLocationRaw) {
    void router.push(target).catch(() => {});
  }
</script>

<style scoped lang="less">
  /* 桌面主布局把子路由根节点固定在顶栏下方，页面自己承担纵向滚动；手机端由沉浸层接管整屏。 */
  .annual-report-page {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    background: var(--workspace-canvas);
  }
</style>
