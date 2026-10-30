<template>
  <BModal
    v-model:visible="modalVisible"
    :title="t('growth.weeklyReportTitle')"
    width="var(--ui-layout-1040, 1040px)"
    height="min(90vh, var(--ui-layout-860, 860px))"
    modal-class="weekly-report-modal"
    content-class="weekly-report-content"
    :fullscreen-mobile="true"
    initial-focus=".modal-close"
  >
    <template v-if="!isMobile" #title>
      <div class="wr-title">
        <span>{{ t('growth.weeklyReportTitle') }}</span>
        <BTabs v-model:active-tab="activeTab" class="wr-tabs" variant="segment" :options="periodOptions" />
        <span v-if="shown" class="wr-period">
          <b>{{ periodRange }}</b>
          · {{ periodNote }}
        </span>
      </div>
    </template>

    <div ref="bodyRef" class="wr-body" :class="{ 'is-mobile': isMobile }">
      <div v-if="isMobile" class="wr-mobile-toolbar">
        <BTabs
          v-model:active-tab="activeTab"
          class="wr-tabs wr-mobile-tabs"
          variant="segment"
          :options="periodOptions"
        />
        <span v-if="shown" class="wr-period">
          <b>{{ periodRange }}</b>
          · {{ periodNote }}
        </span>
      </div>

      <div v-if="!shown" class="wr-state">
        <BLoading v-if="loading" :loading="true" />
        <template v-else-if="loadFailed">
          <p>{{ t('growth.weeklyReportFailed') }}</p>
          <BButton @click="retry">{{ t('growth.wrRetry') }}</BButton>
        </template>
      </div>
      <BLoading v-else :loading="loading">
        <div class="wr-workspace">
          <div class="wr-poster-column">
            <div class="wr-poster-stage" :style="stageStyle">
              <WeeklyReportPoster
                ref="posterRef"
                :report="shown"
                :display-name="displayName"
                :avatar-src="avatarSrc"
                :style="posterStyle"
              />
            </div>
            <p v-if="isMobile" class="wr-hint wr-poster-caption" :class="{ 'is-warn': shown.blank }">
              <SvgIcon :src="icon.message.info" size="14" />{{ exportHint }}
            </p>
          </div>
          <WeeklyReportInsights :report="shown" :read-only="isAdminContext" @navigate="navigate" />
        </div>
      </BLoading>
    </div>

    <template #footer>
      <div class="wr-footer" :class="{ 'is-mobile': isMobile }">
        <p v-if="!isMobile" class="wr-hint" :class="{ 'is-warn': shown?.blank }">
          <SvgIcon :src="icon.message.info" size="16" />{{ exportHint }}
        </p>
        <div class="wr-footer-actions">
          <BButton
            type="primary"
            :loading="cloudSaving"
            :disabled="exportDisabled || isAdminContext || (posterActionBusy && !cloudSaving)"
            :title="isAdminContext ? t('growth.adminContextActionUnavailable') : ''"
            @click="savePosterToCloud"
          >
            <SvgIcon v-if="!cloudSaving" class="wr-action-icon" :src="icon.common.folder" size="16" />
            <span class="wr-action-label">{{ t('growth.wrSaveToCloud') }}</span>
          </BButton>
          <BButton :loading="sharing" :disabled="exportDisabled || (posterActionBusy && !sharing)" @click="sharePoster">
            <SvgIcon v-if="!sharing" class="wr-action-icon" :src="icon.cloudSpace.share" size="15" />
            <span class="wr-action-label">{{ t('growth.wrShare') }}</span>
          </BButton>
          <BButton
            :loading="exporting"
            :disabled="exportDisabled || (posterActionBusy && !exporting)"
            @click="downloadPoster"
          >
            <SvgIcon v-if="!exporting" class="wr-action-icon" :src="icon.cloudSpace.download" size="16" />
            <span class="wr-action-label">{{ isMobile ? t('growth.wrExportShort') : t('growth.wrExport') }}</span>
          </BButton>
        </div>
      </div>
    </template>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter, type RouteLocationRaw } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { usePosterExport } from '@/composables/usePosterExport';
  import { useUiDensity } from '@/composables/useUiDensity';
  import { useUserStore } from '@/store';
  import { getWeeklyReport } from '@/api/growthApi';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import {
    normalizeWeeklyReport,
    type NormalizedWeeklyReport,
    type WeeklyReportData,
    type WeeklyReportPeriodKind,
  } from '@/utils/weeklyReport';
  import WeeklyReportInsights from './WeeklyReportInsights.vue';
  import WeeklyReportPoster from './WeeklyReportPoster.vue';

  const POSTER_WIDTH = 400;
  const POSTER_HEIGHT = 640;
  const EXPORT_SCALE = 3;

  const props = withDefaults(
    defineProps<{
      visible: boolean;
      /** 从成长中心打开时默认本周。 */
      initialPeriod?: WeeklyReportPeriodKind;
      /** 周报通知里的快照：仍是上周时换成实时数据，更早的周以快照原样展示。 */
      snapshot?: WeeklyReportData | null;
    }>(),
    { initialPeriod: 'current', snapshot: null },
  );
  const emit = defineEmits<{ 'update:visible': [value: boolean] }>();
  const { t, locale } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const isMobile = useMobileLayout();
  const { density, dimension } = useUiDensity();

  const modalVisible = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value),
  });
  const isAdminContext = computed(() => Boolean(user.adminContext));
  const reportOwnerKey = computed(() =>
    JSON.stringify([user.id, user.adminContext?.id, user.adminContext?.subjectUserId, user.adminContext?.mode]),
  );
  const displayName = computed(
    () => user.adminContext?.subjectAlias || user.alias || user.userName || t('growth.wrUserFallback'),
  );
  const avatarSrc = computed(() =>
    user.adminContext ? icon.navigation.user : user.headPicture || icon.navigation.user,
  );

  /* ---------- 周期与数据 ---------- */
  type ViewKey = WeeklyReportPeriodKind | 'history';
  const activeKey = ref<ViewKey>('current');
  const shownKey = ref<ViewKey>('current');
  const shown = shallowRef<NormalizedWeeklyReport | null>(null);
  const loading = ref(false);
  const loadFailed = ref(false);
  const cache = new Map<WeeklyReportPeriodKind, NormalizedWeeklyReport>();
  let generation = 0;

  const periodOptions = computed(() => [
    { key: 'current', label: t('growth.wrPeriodCurrent') },
    { key: 'last', label: t('growth.wrPeriodLast') },
  ]);
  const activeTab = computed({
    get: () => (activeKey.value === 'history' ? '' : activeKey.value),
    set: (value: string) => {
      if (posterActionBusy.value) return;
      if (value === 'current' || value === 'last') void showPeriod(value);
    },
  });

  async function fetchReport(period: WeeklyReportPeriodKind) {
    const res = await getWeeklyReport(period);
    const report = res?.status === 200 ? normalizeWeeklyReport(res.data as WeeklyReportData) : null;
    if (!report) throw new Error('weekly_report_unavailable');
    return report;
  }

  async function showPeriod(period: WeeklyReportPeriodKind, { force = false } = {}) {
    activeKey.value = period;
    const cached = cache.get(period);
    if (cached && !force) {
      generation++;
      loading.value = false;
      loadFailed.value = false;
      shown.value = cached;
      shownKey.value = period;
      return;
    }
    const token = ++generation;
    loading.value = true;
    loadFailed.value = false;
    try {
      const report = await fetchReport(period);
      if (token !== generation) return;
      cache.set(period, report);
      shown.value = report;
      shownKey.value = period;
    } catch (error) {
      if (token !== generation) return;
      console.error('获取周报失败:', error);
      loadFailed.value = true;
      if (shown.value) {
        // 切换失败保留原内容，页签回到正在展示的周期。
        activeKey.value = shownKey.value;
        message.error(t('growth.weeklyReportFailed'));
      }
    } finally {
      if (token === generation) loading.value = false;
    }
  }

  /** 通知快照先原样展示；若仍是上周，静默换成带条目的实时数据。 */
  async function adoptSnapshot(snapshot: NormalizedWeeklyReport) {
    const token = ++generation;
    try {
      const live = await fetchReport('last');
      if (token !== generation) return;
      cache.set('last', live);
      if (live.start && live.start === snapshot.start) {
        shown.value = live;
        shownKey.value = 'last';
        activeKey.value = 'last';
      }
    } catch (error) {
      console.warn('刷新周报快照失败:', error);
    }
  }

  function retry() {
    void showPeriod(activeKey.value === 'history' ? 'last' : activeKey.value, { force: true });
  }

  let snapshotOwnerKey = reportOwnerKey.value;
  watch(
    [() => props.visible, reportOwnerKey, () => props.snapshot],
    ([visible, owner, sourceSnapshot], previous) => {
      if (sourceSnapshot !== previous?.[2]) snapshotOwnerKey = owner;
      generation++;
      cache.clear();
      loading.value = false;
      loadFailed.value = false;
      shown.value = null;
      if (!visible) return;
      // 快照归属只随新快照更新；浮层关闭期间切换账号也不能在重开时复用旧内容。
      const snapshot = owner === snapshotOwnerKey ? normalizeWeeklyReport(sourceSnapshot) : null;
      if (snapshot) {
        // 快照可能来自几周前；实时接口确认属于上周后再使用“上周”的文案。
        shown.value = { ...snapshot, kind: null, inProgress: false };
        shownKey.value = 'history';
        activeKey.value = 'history';
        void adoptSnapshot(snapshot);
      } else {
        shown.value = null;
        void showPeriod(props.initialPeriod);
      }
    },
    { immediate: true },
  );

  function formatDay(value: string | null) {
    if (!value) return '--';
    return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      Date.parse(`${value}T00:00:00Z`),
    );
  }
  const periodRange = computed(() => {
    const report = shown.value;
    if (!report) return '';
    if (report.inProgress) {
      return report.elapsedDays > 1
        ? `${formatDay(report.start)} – ${formatDay(report.dataEnd)}`
        : formatDay(report.start);
    }
    return `${formatDay(report.start)} – ${formatDay(report.end)}`;
  });
  const periodNote = computed(() => {
    const report = shown.value;
    if (!report) return '';
    if (report.inProgress) return t('growth.wrPeriodProgress', { n: report.elapsedDays });
    return shownKey.value === 'history' ? t('growth.wrPeriodHistory') : t('growth.wrPeriodComplete');
  });
  const exportHint = computed(() => {
    if (!shown.value?.blank) return t('growth.wrSaveTip');
    return shown.value.inProgress ? t('growth.wrBlankTip') : t('growth.wrBlankTipPast');
  });

  /* ---------- 周报卡预览缩放 ---------- */
  const bodyRef = ref<HTMLElement | null>(null);
  const posterRef = ref<InstanceType<typeof WeeklyReportPoster> | null>(null);
  const posterScale = ref(1);
  const stageStyle = computed(() => ({
    width: `${POSTER_WIDTH * posterScale.value}px`,
    height: `${POSTER_HEIGHT * posterScale.value}px`,
  }));
  const posterStyle = computed(() => ({ transform: `scale(${posterScale.value})`, transformOrigin: 'top left' }));

  function updatePosterScale() {
    const body = bodyRef.value;
    const content = body?.closest<HTMLElement>('.weekly-report-content');
    if (!body || !content) return;
    let scale: number;
    if (isMobile.value) {
      scale = body.clientWidth / POSTER_WIDTH;
    } else {
      const style = window.getComputedStyle(content);
      const availableHeight =
        content.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
      // 以工作区实际宽度给右栏预留阅读空间；外壳与间距随密度，导出画布保持原尺寸。
      const workspaceWidth = Math.min(body.clientWidth, dimension(930, 'layout'));
      const availableWidth = workspaceWidth - dimension(320, 'layout') - dimension(28, 'space');
      scale = Math.min(1.1, availableHeight / POSTER_HEIGHT, availableWidth / POSTER_WIDTH);
    }
    posterScale.value = Math.max(0.5, Math.min(1.2, Number.isFinite(scale) ? scale : 1));
  }

  let resizeObserver: ResizeObserver | null = null;
  watch(bodyRef, (body) => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    const content = body?.closest<HTMLElement>('.weekly-report-content');
    if (!body || !content) return;
    updatePosterScale();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updatePosterScale());
      resizeObserver.observe(content);
      resizeObserver.observe(body);
    }
  });
  // ResizeObserver 在部分 WebView 中不保证触发；数据替换（可能出现滚动条）和窗口变化时再算一次。
  watch([shown, isMobile, density], () => void nextTick(updatePosterScale));
  onMounted(() => window.addEventListener('resize', updatePosterScale, { passive: true }));
  onBeforeUnmount(() => {
    generation++;
    resizeObserver?.disconnect();
    window.removeEventListener('resize', updatePosterScale);
  });

  /* ---------- 导航：先关闭弹框并等待移动端 history 出栈 ---------- */
  function navigate(target: RouteLocationRaw) {
    void closeCurrentMobileOverlayThen(
      () => {
        modalVisible.value = false;
      },
      () => router.push(target).catch(() => {}),
    );
  }

  /* ---------- 导出、分享与保存 ---------- */
  const exportDisabled = computed(() => !shown.value || shown.value.blank || loading.value);
  const {
    exporting,
    sharing,
    cloudSaving,
    busy: posterActionBusy,
    downloadPoster,
    sharePoster,
    savePosterToCloud,
  } = usePosterExport({
    posterRoot: () => posterRef.value?.root,
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    background: '#0d1022',
    scale: EXPORT_SCALE,
    filename: () => `${t('growth.wrFileName')}-${shown.value?.start || 'weekly'}.png`,
    shareTitle: () => t('growth.weeklyReportTitle'),
    cloudFolder: '周报',
    ownerKey: () => reportOwnerKey.value,
    canExport: () => !exportDisabled.value,
    canSaveToCloud: () => !isAdminContext.value,
    text: {
      exportSuccess: () => t('growth.wrExportSuccess'),
      exportFailed: () => t('growth.wrExportFailed'),
      shareFallback: () => t('growth.wrShareFallback'),
      shareFailed: () => t('growth.wrShareFailed'),
      cloudSuccess: () => t('growth.wrCloudSaveSuccess'),
      cloudFailed: () => t('growth.wrCloudSaveFailed'),
    },
    log: {
      module: '成长',
      download: '导出成长周报图片成功',
      share: '分享成长周报图片成功',
      cloud: '保存成长周报到云空间成功',
    },
  });
</script>

<style lang="less">
  /* BModal 外壳上的类名不在本组件作用域内，只在这里接管周报的内容区与滚动。 */
  .weekly-report-modal {
    overflow: hidden;
  }
  .weekly-report-content {
    min-height: 0;
    padding: var(--ui-space-12, 12px) var(--ui-space-22, 22px) !important;
    overflow: auto;
    background: var(--background-color);
  }
  .weekly-report-modal.is-mobile-fullscreen .weekly-report-content {
    padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px) var(--ui-space-20, 20px) !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior-y: contain;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
  }
</style>

<style scoped lang="less">
  .wr-title {
    display: flex;
    align-items: center;
    gap: var(--ui-space-14, 14px);
    min-width: 0;
  }
  .wr-tabs {
    font-weight: 400;
  }
  .wr-period {
    min-width: 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wr-period b {
    color: var(--text-color);
    font-weight: 600;
  }

  .wr-mobile-toolbar {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-6, 6px);
    margin-bottom: var(--ui-space-12, 12px);
  }
  .wr-mobile-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }
  .wr-mobile-tabs :deep(.tab) {
    justify-content: center;
  }

  .wr-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-12, 12px);
    min-height: var(--ui-layout-420, 420px);
    color: var(--desc-color);
    font-size: var(--ui-font-14, 14px);
  }
  .wr-state p {
    margin: 0;
  }

  .wr-workspace {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--ui-space-28, 28px);
    max-width: var(--ui-layout-930, 930px);
    margin: 0 auto;
  }
  .wr-body.is-mobile .wr-workspace {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--ui-space-16, 16px);
  }
  .wr-poster-column {
    min-width: 0;
  }
  .wr-poster-stage {
    position: relative;
    overflow: hidden;
    border-radius: 24px;
    box-shadow: 0 24px 60px -30px rgba(14, 16, 38, 0.9);
  }

  .wr-hint {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    min-width: 0;
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.5;
  }
  .wr-hint .svg-icon {
    flex: 0 0 auto;
    color: var(--primary-color);
  }
  .wr-hint.is-warn .svg-icon {
    color: var(--warning-color);
  }
  .wr-poster-caption {
    margin-top: var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
  }

  .wr-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
    box-sizing: border-box;
    width: 100%;
    padding: var(--ui-space-12, 12px) var(--ui-space-22, 22px);
    border-top: 1px solid var(--surface-border-color);
    background: var(--background-color);
  }
  .wr-footer-actions {
    display: flex;
    flex: 0 0 auto;
    gap: var(--ui-space-10, 10px);
  }
  .wr-footer-actions .b_btn {
    gap: var(--ui-space-6, 6px);
  }
  .wr-footer-actions .wr-action-icon {
    flex-shrink: 0;
  }
  .wr-action-label {
    line-height: 1.2;
  }
  .wr-footer.is-mobile .wr-action-label {
    white-space: normal;
  }
  .wr-footer.is-mobile .wr-footer-actions .b_btn:first-child {
    flex-grow: 1.4;
  }
  .wr-footer.is-mobile {
    /* ui-density-fixed: 移动端固定标准密度，底部操作栏预留安全区 */
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  }
  /* 按文字宽度分配后再按比例补足，中英文按钮都不挤压图标。 */
  .wr-footer.is-mobile .wr-footer-actions {
    display: flex;
    /* ui-density-fixed: 移动端固定标准密度 */
    gap: 8px;
    width: 100%;
  }
  .wr-footer.is-mobile .wr-footer-actions .b_btn {
    flex: 1 1 auto;
    min-width: min-content;
    /* ui-density-fixed: 底部固定操作栏使用约 44px 的触控高度 */
    height: 44px;
    /* ui-density-fixed: 底部固定操作栏按钮内边距 */
    padding: 0 8px;
    /* ui-density-fixed: 移动端固定标准密度 */
    font-size: 15px;
  }

  html.light-note-mobile-rendering .wr-poster-stage {
    box-shadow: none;
  }
</style>
