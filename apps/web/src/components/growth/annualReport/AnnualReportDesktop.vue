<template>
  <div class="ar-desktop">
    <header class="ard-head">
      <BButton class="ard-back" @click="emit('back')">
        <SvgIcon :src="icon.arrow_left" size="16" />
        <span>{{ t('annualReport.backToGrowth') }}</span>
      </BButton>
      <h1>{{ t('annualReport.pageTitle', { year }) }}</h1>
      <span v-if="rangeLabel" class="ard-range">{{ rangeLabel }}</span>
      <span class="ard-spacer" />
      <BButton v-if="ready && !isLast" type="text" class="ard-link" @click="emit('poster')">
        {{ t('annualReport.directPoster') }}
      </BButton>
    </header>

    <div v-if="!ready" class="ard-state">
      <AnnualReportState
        :kind="stateKind"
        :year="year"
        :open-from="report?.openFrom"
        @retry="emit('retry')"
        @back="emit('back')"
        @create="emit('create')"
        @login="emit('login')"
      />
    </div>

    <div v-else class="ard-body">
      <nav class="ard-panel ard-rail" :aria-label="t('annualReport.directory')">
        <BButton
          v-for="(chapter, chapterIndex) in chapters"
          :key="chapter"
          class="ard-rail-item"
          :class="{ 'is-current': chapterIndex === index }"
          :aria-current="chapterIndex === index ? 'step' : undefined"
          @click="emit('go', chapterIndex)"
        >
          <span class="ard-rail-number">{{ chapterIndex + 1 }}</span>
          <SvgIcon :src="ANNUAL_CHAPTER_ICONS[chapter]" size="16" />
          <span class="ard-rail-label">{{ t(`annualReport.chapters.${chapter}`, { year }) }}</span>
        </BButton>
        <p class="ard-rail-foot">
          <SvgIcon :src="icon.growth.lock" size="13" />
          <span>{{ t('annualReport.privateNote') }}</span>
        </p>
      </nav>

      <div ref="stageRef" class="ard-stage">
        <div class="ard-stage-row">
          <BButton
            icon-only
            class="ard-arrow is-prev"
            :disabled="isFirst"
            :aria-label="t('annualReport.prev')"
            @click="emit('prev')"
          >
            <SvgIcon class="ard-chevron" :src="icon.pagination.chevron" size="14" />
          </BButton>
          <div class="ard-fit" :style="fitStyle">
            <div class="ard-canvas" :style="canvasStyle">
              <AnnualStory
                v-if="current && current !== 'poster'"
                :key="current"
                :report="report!"
                :chapter="current"
                :number="index"
                :display-name="displayName"
                :avatar-src="avatarSrc"
                @next="emit('next')"
                @poster="emit('poster')"
              />
              <div v-else class="ard-poster-slot">
                <AnnualReportPoster
                  ref="posterRef"
                  :report="report!"
                  :display-name="displayName"
                  :avatar-src="avatarSrc"
                  :show-name="showName"
                  :show-keywords="showKeywords"
                />
              </div>
            </div>
          </div>
          <BButton
            icon-only
            class="ard-arrow is-next"
            :disabled="isLast"
            :aria-label="t('annualReport.next')"
            @click="emit('next')"
          >
            <SvgIcon class="ard-chevron" :src="icon.pagination.chevron" size="14" />
          </BButton>
        </div>
        <div class="ard-pager">
          <span>{{ t('annualReport.pager', { n: index + 1, total: chapters.length }) }}</span>
          <span class="ard-dots" aria-hidden="true">
            <i v-for="(chapter, chapterIndex) in chapters" :key="chapter" :class="{ on: chapterIndex === index }" />
          </span>
          <span><kbd>←</kbd> <kbd>→</kbd> {{ t('annualReport.keyboardHint') }}</span>
        </div>
      </div>

      <aside class="ard-panel ard-side">
        <template v-if="current === 'poster'">
          <h3 class="ard-side-title">{{ t('annualReport.share.title') }}</h3>
          <p class="ard-side-sub">{{ t('annualReport.share.sub') }}</p>
          <AnnualPosterOptions
            v-model:show-name="showName"
            v-model:show-keywords="showKeywords"
            :year="year"
            :light="report!.tier !== 'full'"
          />
          <div class="ard-actions">
            <BButton
              type="primary"
              class="ard-action-primary"
              :loading="cloudSaving"
              :disabled="busy && !cloudSaving"
              @click="savePosterToCloud"
            >
              <SvgIcon v-if="!cloudSaving" :src="icon.common.folder" size="16" />
              {{ t('annualReport.share.saveToCloud') }}
            </BButton>
            <BButton :loading="sharing" :disabled="busy && !sharing" @click="sharePoster">
              <SvgIcon v-if="!sharing" :src="icon.cloudSpace.share" size="15" />
              {{ t('annualReport.share.share') }}
            </BButton>
            <BButton :loading="exporting" :disabled="busy && !exporting" @click="downloadPoster">
              <SvgIcon v-if="!exporting" :src="icon.cloudSpace.download" size="16" />
              {{ t('annualReport.share.download') }}
            </BButton>
          </div>
          <p class="ard-hint">
            <SvgIcon :src="icon.growth.lock" size="13" />
            <span>{{ t('annualReport.share.hint') }}</span>
          </p>
        </template>
        <AnnualReportDetails
          v-else-if="current"
          :report="report!"
          :chapter="current"
          @open="(target) => emit('open', target)"
        />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { RouteLocationRaw } from 'vue-router';
  import type { AnnualReportChapter } from '@lightnote/shared/annual-report';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useUiDensity } from '@/composables/useUiDensity';
  import { useAnnualPosterExport } from '@/composables/useAnnualReport';
  import {
    ANNUAL_CHAPTER_ICONS,
    annualReportStateKind,
    formatAnnualDate,
    type AnnualReport,
  } from '@/utils/annualReport';
  import AnnualPosterOptions from './AnnualPosterOptions.vue';
  import AnnualReportDetails from './AnnualReportDetails.vue';
  import AnnualReportPoster from './AnnualReportPoster.vue';
  import AnnualReportState from './AnnualReportState.vue';
  import AnnualStory from './AnnualStory.vue';

  const STORY_WIDTH = 420;
  const STORY_HEIGHT = 720;
  const MIN_SCALE = 0.78;

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
    go: [index: number];
    next: [];
    prev: [];
    poster: [];
    retry: [];
    back: [];
    create: [];
    login: [];
    open: [target: RouteLocationRaw];
  }>();
  const { t, locale } = useI18n();
  const { density, dimension } = useUiDensity();

  const ready = computed(
    () => props.state === 'ready' && Boolean(props.report?.available) && props.report?.tier !== 'empty',
  );
  const stateKind = computed(() => annualReportStateKind(props.state, props.report));
  const rangeLabel = computed(() => {
    const report = props.report;
    if (!report?.available || !report.dataEnd) return '';
    return report.phase === 'final'
      ? t('annualReport.rangeFinal', { year: report.year })
      : t('annualReport.rangePreview', { date: formatAnnualDate(report.dataEnd, locale.value) });
  });

  /* ---------- 故事卡按可用高度等比缩放，不重新排版 ---------- */
  const stageRef = ref<HTMLElement | null>(null);
  const scale = ref(1);
  function updateScale() {
    const stage = stageRef.value;
    if (!stage) return;
    const pagerReserve = dimension(56, 'layout');
    const available = window.innerHeight - stage.getBoundingClientRect().top - pagerReserve;
    scale.value = Math.max(MIN_SCALE, Math.min(1, available / STORY_HEIGHT));
  }
  const fitStyle = computed(() => ({
    width: `${STORY_WIDTH * scale.value}px`,
    height: `${STORY_HEIGHT * scale.value}px`,
  }));
  const canvasStyle = computed(() => ({ transform: `scale(${scale.value})`, transformOrigin: 'top left' }));
  watch([ready, density], () => void nextTick(updateScale));

  /* ---------- ← / → 翻页：输入框和可编辑区域内不拦截 ---------- */
  function onKeydown(event: KeyboardEvent) {
    if (!ready.value || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
    ) {
      return;
    }
    if (event.key === 'ArrowRight') emit('next');
    else if (event.key === 'ArrowLeft') emit('prev');
    else return;
    event.preventDefault();
  }
  onMounted(() => {
    window.addEventListener('resize', updateScale, { passive: true });
    window.addEventListener('keydown', onKeydown);
    void nextTick(updateScale);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateScale);
    window.removeEventListener('keydown', onKeydown);
  });

  /* ---------- 海报导出 ---------- */
  const posterRef = ref<InstanceType<typeof AnnualReportPoster> | null>(null);
  const { exporting, sharing, cloudSaving, busy, downloadPoster, sharePoster, savePosterToCloud } =
    useAnnualPosterExport({
      posterRoot: () => posterRef.value?.root,
      report: toRef(props, 'report'),
      ownerKey: toRef(props, 'ownerKey'),
    });
</script>

<style scoped lang="less">
  .ar-desktop {
    min-height: 100%;
    box-sizing: border-box;
    max-width: var(--ui-layout-1240, 1240px);
    margin: 0 auto;
    padding: var(--ui-space-18, 18px) var(--ui-space-28, 28px) var(--ui-space-40, 40px);
    color: var(--text-color);
  }
  .ard-head {
    display: flex;
    align-items: center;
    gap: var(--ui-space-14, 14px);
    min-height: var(--ui-layout-40, 40px);
    margin-bottom: var(--ui-space-16, 16px);
  }
  .ard-head h1 {
    margin: 0;
    font-size: var(--ui-font-20, 20px);
    font-weight: 650;
  }
  .ard-back {
    gap: var(--ui-space-4, 4px);
  }
  .ard-range {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  .ard-spacer {
    flex: 1;
  }
  .ard-link {
    color: var(--workspace-purple-text);
  }
  .ard-state {
    display: flex;
    justify-content: center;
    padding-top: var(--ui-space-24, 24px);
  }
  .ard-body {
    display: grid;
    grid-template-columns: var(--ui-layout-216, 216px) auto minmax(0, 1fr);
    align-items: start;
    gap: var(--ui-space-24, 24px);
  }
  .ard-panel {
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    background: var(--workspace-content);
  }
  .ard-rail {
    position: sticky;
    top: var(--ui-space-16, 16px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-2, 2px);
    padding: var(--ui-space-8, 8px);
  }
  .ard-rail-item {
    justify-content: flex-start;
    gap: var(--ui-space-10, 10px);
    width: 100%;
    min-height: var(--ui-control-40, 40px);
    padding: 0 var(--ui-space-10, 10px);
    border-left: 3px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text-color);
  }
  .ard-rail-item:hover {
    background: var(--workspace-hover);
  }
  .ard-rail-item.is-current {
    border-left-color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
    color: var(--workspace-purple-text);
    font-weight: 600;
  }
  .ard-rail-number {
    width: var(--ui-layout-18, 18px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-variant-numeric: tabular-nums;
  }
  .is-current .ard-rail-number {
    color: var(--workspace-purple-text);
  }
  .ard-rail-label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .ard-rail-foot {
    display: flex;
    gap: var(--ui-space-6, 6px);
    margin: var(--ui-space-8, 8px) var(--ui-space-6, 6px) var(--ui-space-4, 4px);
    padding-top: var(--ui-space-10, 10px);
    border-top: 1px solid var(--workspace-divider);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.55;
  }
  .ard-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ui-space-12, 12px);
  }
  .ard-stage-row {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
  }
  .ard-arrow {
    width: var(--ui-control-40, 40px);
    height: var(--ui-control-40, 40px);
    border: 1px solid var(--workspace-border);
    border-radius: 50%;
    background: var(--workspace-content);
  }
  .is-prev .ard-chevron {
    transform: rotate(90deg);
  }
  .is-next .ard-chevron {
    transform: rotate(-90deg);
  }
  .ard-fit {
    position: relative;
    flex: 0 0 auto;
  }
  .ard-canvas {
    position: absolute;
    top: 0;
    left: 0;
  }
  .ard-poster-slot {
    display: flex;
    justify-content: center;
    box-sizing: border-box;
    /* ui-density-fixed: 年度报告故事卡为固定 420×720 画布，整体缩放 */
    width: 420px;
    /* ui-density-fixed: 年度报告故事卡为固定 420×720 画布，整体缩放 */
    height: 720px;
    /* ui-density-fixed: 年度报告故事卡为固定 420×720 画布，整体缩放 */
    padding-top: 40px;
  }
  .ard-pager {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ard-pager kbd {
    padding: var(--ui-space-1, 1px) var(--ui-space-5, 5px);
    border: 1px solid var(--workspace-border);
    border-radius: 4px;
    font-family: inherit;
    font-size: var(--ui-font-11, 11px);
  }
  .ard-dots {
    display: flex;
    gap: var(--ui-space-6, 6px);
  }
  .ard-dots i {
    width: var(--ui-layout-6, 6px);
    height: var(--ui-layout-6, 6px);
    border-radius: 50%;
    background: var(--surface-border-color);
  }
  .ard-dots i.on {
    width: var(--ui-layout-18, 18px);
    border-radius: 3px;
    background: var(--primary-color);
  }
  .ard-side {
    position: sticky;
    top: var(--ui-space-16, 16px);
    padding: var(--ui-space-16, 16px) var(--ui-space-18, 18px);
  }
  .ard-side-title {
    margin: 0 0 var(--ui-space-4, 4px);
    font-size: var(--ui-font-15, 15px);
    font-weight: 650;
  }
  .ard-side-sub {
    margin: 0 0 var(--ui-space-8, 8px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ard-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-10, 10px);
    margin-top: var(--ui-space-14, 14px);
    padding-top: var(--ui-space-14, 14px);
    border-top: 1px solid var(--workspace-divider);
  }
  .ard-actions :deep(.b_btn) {
    flex: 1;
    gap: var(--ui-space-6, 6px);
  }
  .ard-actions .ard-action-primary {
    flex: 1 1 100%;
  }
  .ard-hint {
    display: flex;
    gap: var(--ui-space-6, 6px);
    margin: var(--ui-space-12, 12px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.55;
  }
</style>
