<template>
  <div class="ar-mobile" :class="{ 'is-report': ready }">
    <template v-if="ready">
      <div class="arm-top">
        <div class="arm-progress" aria-hidden="true">
          <i
            v-for="(chapter, chapterIndex) in chapters"
            :key="chapter"
            :class="{ done: chapterIndex < index, current: chapterIndex === index }"
          />
        </div>
        <div class="arm-bar">
          <span
            >{{ t('annualReport.pageTitle', { year }) }} ·
            {{ t('annualReport.pager', { n: index + 1, total: chapters.length }) }}</span
          >
          <BButton type="text" icon-only class="arm-close" :aria-label="t('annualReport.close')" @click="emit('back')">
            <SvgIcon :src="icon.common.close" size="18" />
          </BButton>
        </div>
      </div>

      <div
        v-if="current && current !== 'poster'"
        class="arm-story"
        @click="onTap"
        @touchstart.passive="onTouchStart"
        @touchend="onTouchEnd"
      >
        <AnnualStory
          :key="current"
          :report="report!"
          :chapter="current"
          :number="index"
          variant="immersive"
          :display-name="displayName"
          :avatar-src="avatarSrc"
          @next="emit('next')"
          @poster="emit('poster')"
          @details="sheetOpen = true"
        />
        <span class="arm-sr">
          <BButton :disabled="isFirst" @click.stop="emit('prev')">{{ t('annualReport.prev') }}</BButton>
          <BButton @click.stop="emit('next')">{{ t('annualReport.next') }}</BButton>
        </span>
      </div>

      <div v-else class="arm-final" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
        <div class="arm-final-scroll">
          <div ref="fitRef" class="arm-poster-fit" :style="fitStyle">
            <AnnualReportPoster
              ref="posterRef"
              class="arm-poster"
              :style="posterStyle"
              :report="report!"
              :display-name="displayName"
              :avatar-src="avatarSrc"
              :show-name="showName"
              :show-keywords="showKeywords"
            />
          </div>
          <AnnualPosterOptions
            v-model:show-name="showName"
            v-model:show-keywords="showKeywords"
            class="arm-options"
            dark
            :year="year"
            :light="report!.tier !== 'full'"
          />
          <p class="arm-note">
            <SvgIcon :src="icon.growth.lock" size="13" />
            <span>{{ t('annualReport.share.hint') }}</span>
          </p>
        </div>
        <MobileStickyActionBar class="arm-actions" :above-navigation="false">
          <BButton type="primary" :loading="cloudSaving" :disabled="busy && !cloudSaving" @click="savePosterToCloud">
            <SvgIcon v-if="!cloudSaving" :src="icon.common.folder" size="16" />
            {{ t('annualReport.share.saveToCloud') }}
          </BButton>
          <BButton
            icon-only
            class="arm-icon-action"
            :loading="sharing"
            :disabled="busy && !sharing"
            :aria-label="t('annualReport.share.share')"
            @click="sharePoster"
          >
            <SvgIcon v-if="!sharing" :src="icon.cloudSpace.share" size="18" />
          </BButton>
          <BButton
            icon-only
            class="arm-icon-action"
            :loading="exporting"
            :disabled="busy && !exporting"
            :aria-label="t('annualReport.share.download')"
            @click="downloadPoster"
          >
            <SvgIcon v-if="!exporting" :src="icon.cloudSpace.download" size="18" />
          </BButton>
        </MobileStickyActionBar>
      </div>

      <BDrawer
        :open="sheetOpen && Boolean(current) && current !== 'poster'"
        placement="bottom"
        height="min(62vh, var(--ui-layout-520, 520px))"
        :aria-label="t('annualReport.viewDetails')"
        show-handle
        @close="sheetOpen = false"
      >
        <AnnualReportDetails
          v-if="current && current !== 'poster'"
          sheet
          :report="report!"
          :chapter="current"
          @open="openFromSheet"
        />
      </BDrawer>
    </template>

    <AnnualReportState
      v-else
      immersive
      :kind="stateKind"
      :year="year"
      :open-from="report?.openFrom"
      @retry="emit('retry')"
      @back="emit('back')"
      @create="emit('create')"
      @login="emit('login')"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { RouteLocationRaw } from 'vue-router';
  import type { AnnualReportChapter } from '@lightnote/shared/annual-report';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  import icon from '@/config/icon';
  import { useAnnualPosterExport } from '@/composables/useAnnualReport';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { annualReportStateKind, type AnnualReport } from '@/utils/annualReport';
  import AnnualPosterOptions from './AnnualPosterOptions.vue';
  import AnnualReportDetails from './AnnualReportDetails.vue';
  import AnnualReportPoster from './AnnualReportPoster.vue';
  import AnnualReportState from './AnnualReportState.vue';
  import AnnualStory from './AnnualStory.vue';

  const POSTER_WIDTH = 400;
  const POSTER_HEIGHT = 640;
  const SWIPE_DISTANCE = 50;

  const props = defineProps<{
    year: number;
    report: AnnualReport | null;
    state: 'loading' | 'ready' | 'failed';
    chapters: AnnualReportChapter[];
    index: number;
    current: AnnualReportChapter | null;
    isFirst: boolean;
    isLast: boolean;
    ownerKey: string;
    displayName: string;
    avatarSrc: string;
  }>();
  const showName = defineModel<boolean>('showName', { required: true });
  const showKeywords = defineModel<boolean>('showKeywords', { required: true });
  const emit = defineEmits<{
    next: [];
    prev: [];
    poster: [];
    retry: [];
    back: [];
    create: [];
    login: [];
    open: [target: RouteLocationRaw];
  }>();
  const { t } = useI18n();

  const ready = computed(
    () => props.state === 'ready' && Boolean(props.report?.available) && props.report?.tier !== 'empty',
  );
  const stateKind = computed(() => annualReportStateKind(props.state, props.report));

  /* ---------- 明细抽屉：接入移动浮层返回栈，打开资料前先让抽屉出栈 ---------- */
  const sheetOpen = ref(false);
  watch(
    () => props.current,
    () => {
      sheetOpen.value = false;
    },
  );
  function openFromSheet(target: RouteLocationRaw) {
    closeCurrentMobileOverlayThen(
      () => {
        sheetOpen.value = false;
      },
      () => emit('open', target),
    );
  }

  /* ---------- 点左侧 30% 返回、其余继续；左右滑动翻页，滑动后不再触发点按 ---------- */
  let touchStart: { x: number; y: number } | null = null;
  let swiped = false;
  function onTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
    swiped = false;
  }
  function onTouchEnd(event: TouchEvent) {
    const touch = event.changedTouches[0];
    if (!touchStart || !touch) return;
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped = true;
    if (dx < 0) emit('next');
    else emit('prev');
  }
  function onTap(event: MouseEvent) {
    if (swiped) {
      swiped = false;
      return;
    }
    if ((event.target as HTMLElement | null)?.closest('button, a, input, [role="button"], [role="switch"]')) return;
    const area = event.currentTarget as HTMLElement;
    const rect = area.getBoundingClientRect();
    if (event.clientX - rect.left < rect.width * 0.3) emit('prev');
    else emit('next');
  }

  /* ---------- 最后一页：海报按屏宽等比缩放 ---------- */
  const fitRef = ref<HTMLElement | null>(null);
  const posterScale = ref(1);
  function updatePosterScale() {
    const width = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth) - 48;
    posterScale.value = Math.max(0.5, Math.min(1, width / POSTER_WIDTH));
  }
  const fitStyle = computed(() => ({
    width: `${POSTER_WIDTH * posterScale.value}px`,
    height: `${POSTER_HEIGHT * posterScale.value}px`,
  }));
  const posterStyle = computed(() => ({ transform: `scale(${posterScale.value})`, transformOrigin: 'top left' }));
  onMounted(() => {
    updatePosterScale();
    window.addEventListener('resize', updatePosterScale, { passive: true });
  });
  onBeforeUnmount(() => window.removeEventListener('resize', updatePosterScale));

  const posterRef = ref<InstanceType<typeof AnnualReportPoster> | null>(null);
  const { exporting, sharing, cloudSaving, busy, downloadPoster, sharePoster, savePosterToCloud } =
    useAnnualPosterExport({
      posterRoot: () => posterRef.value?.root,
      report: toRef(props, 'report'),
      ownerKey: toRef(props, 'ownerKey'),
    });
</script>

<style scoped lang="less">
  /* 移动端沉浸页：独占整屏、唯一滚动容器在各自区域内；故事与海报固定深色。 */
  .ar-mobile {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--background-color);
  }
  .ar-mobile.is-report {
    background: #0b0d1d;
    color: #fff;
  }
  .arm-top {
    position: absolute;
    z-index: 3;
    /* ui-density-fixed: 移动沉浸页专用尺寸，避开状态栏安全区 */
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    right: 16px;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    left: 16px;
  }
  .arm-progress {
    display: flex;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    gap: 4px;
  }
  .arm-progress i {
    flex: 1;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    height: 3px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.22);
  }
  .arm-progress i.done {
    background: rgba(255, 255, 255, 0.55);
  }
  .arm-progress i.current {
    background: #fff;
  }
  .arm-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    margin-top: 6px;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
  }
  .arm-close {
    /* ui-density-fixed: 移动沉浸页专用尺寸，保证 44px 触控区 */
    width: 44px;
    /* ui-density-fixed: 移动沉浸页专用尺寸，保证 44px 触控区 */
    height: 44px;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    margin-right: -10px;
    color: #fff;
  }
  .arm-story {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-tap-highlight-color: transparent;
  }
  .arm-story > .ar-story {
    min-height: 100%;
  }
  .arm-sr {
    position: absolute;
    /* ui-density-fixed: 读屏专用的隐藏翻页按钮 */
    width: 1px;
    /* ui-density-fixed: 读屏专用的隐藏翻页按钮 */
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .arm-final {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
  .arm-final-scroll {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    /* ui-density-fixed: 移动沉浸页专用尺寸，顶部留给进度条，底部留给操作栏 */
    padding: calc(env(safe-area-inset-top, 0px) + 72px) 24px calc(env(safe-area-inset-bottom, 0px) + 96px);
  }
  .arm-poster-fit {
    position: relative;
    flex: 0 0 auto;
  }
  .arm-poster {
    position: absolute;
    top: 0;
    left: 0;
  }
  .arm-options {
    align-self: stretch;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    margin-top: 14px;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    padding: 4px 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.06);
  }
  .arm-note {
    display: flex;
    align-self: stretch;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    gap: 6px;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    margin: 10px 0 0;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    font-size: 12px;
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    line-height: 1.55;
    color: rgba(255, 255, 255, 0.6);
  }
  /* 底部操作栏压在固定深色页上，改用深色外观，避免浅色主题下出现一条白底。 */
  .arm-actions {
    border-color: rgba(255, 255, 255, 0.1);
    background: #14172f;
    box-shadow: none;
  }
  .arm-actions .arm-icon-action {
    flex: 0 0 auto;
    /* ui-density-fixed: 移动沉浸页专用尺寸，保证 44px 触控区 */
    width: 48px;
    border: 0;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
</style>
