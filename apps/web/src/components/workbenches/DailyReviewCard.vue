<template>
  <section class="daily-review" :aria-label="t('growth.dailyReviewTitle')" :aria-busy="recapLoading || undefined">
    <header class="daily-review__header">
      <span class="daily-review__title-icon" aria-hidden="true">
        <SvgIcon :src="icon.noteTemplate.review" size="21" />
      </span>
      <div class="daily-review__heading">
        <div class="daily-review__title-row">
          <h2>{{ t('growth.dailyReviewTitle') }}</h2>
          <span v-if="readOnly" class="daily-review__readonly">{{ t('growth.dailyReviewReadOnly') }}</span>
        </div>
        <p>{{ t('growth.dailyReviewSubtitle') }}</p>
      </div>
      <time class="daily-review__date" :datetime="recap?.stableDate || undefined">{{ reviewDateLabel }}</time>
    </header>

    <div v-if="recapLoading && !recap" class="daily-review__loading">
      <BLoading inline :loading="true" :title="t('growth.dailyReviewLoading')" />
    </div>

    <div v-else-if="recapError && !recap" class="daily-review__state daily-review__state--error" role="alert">
      <span class="daily-review__state-icon" aria-hidden="true">!</span>
      <div>
        <strong>{{ t('growth.dailyReviewLoadFailedTitle') }}</strong>
        <span>{{ t('growth.dailyReviewLoadFailedDesc') }}</span>
      </div>
      <BButton class="daily-review__retry" size="small" :loading="recapLoading" @click="retry">
        {{ t('common.retry') }}
      </BButton>
    </div>

    <div v-else-if="!hasItems" class="daily-review__state daily-review__state--empty">
      <span class="daily-review__empty-icon" aria-hidden="true">
        <SvgIcon :src="icon.noteDetail.history" size="22" />
      </span>
      <div>
        <strong>{{ t('growth.recapEmptyTitle') }}</strong>
        <span>{{ t('growth.recapEmptyDesc') }}</span>
      </div>
    </div>

    <template v-else>
      <div v-if="recapError" class="daily-review__stale" role="status">
        <span>{{ t('growth.dailyReviewStale') }}</span>
        <BButton class="daily-review__retry" size="small" :loading="recapLoading" @click="retry">
          {{ t('common.retry') }}
        </BButton>
      </div>

      <BTabs
        v-model:active-tab="activeSection"
        class="daily-review__tabs"
        variant="segment"
        :options="sectionTabs"
        v-click-log="{ module: '每日回顾', operation: '切换回顾分类' }"
      />

      <article
        v-if="currentItem"
        :key="`${activeSection}-${currentItem.type}-${currentItem.id}`"
        class="daily-review__item"
        :class="`is-${currentItem.type}`"
        aria-live="polite"
      >
        <span class="daily-review__resource-icon" aria-hidden="true">
          <SvgIcon :src="itemIcon(currentItem)" size="22" />
        </span>
        <div class="daily-review__item-main">
          <div class="daily-review__item-meta">
            <span>{{ itemTypeLabel(currentItem) }}</span>
            <time :datetime="currentItem.time">{{ itemDateLabel(currentItem.time) }}</time>
          </div>
          <h3>{{ currentItem.title || t('growth.dailyReviewUntitled') }}</h3>
          <p>{{ currentSection?.hint }}</p>
        </div>
        <BButton
          type="primary"
          class="daily-review__open"
          :disabled="!canOpen(currentItem)"
          :title="canOpen(currentItem) ? '' : t('growth.dailyReviewUnavailable')"
          @click="openItem(currentItem)"
        >
          {{ t('growth.dailyReviewOpen') }}
          <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
        </BButton>
      </article>

      <footer v-if="currentItem" class="daily-review__footer">
        <div class="daily-review__position" aria-live="polite">
          <span class="daily-review__position-dot" aria-hidden="true"></span>
          {{ t('growth.dailyReviewPosition', { current: currentIndex + 1, total: currentItems.length }) }}
        </div>
        <div v-if="currentItems.length > 1 || !readOnly" class="daily-review__actions">
          <BButton
            v-if="currentItems.length > 1"
            class="daily-review__next"
            size="small"
            :disabled="Boolean(actionKey)"
            @click="showNext"
          >
            <SvgIcon :src="icon.infrastructure.refresh" size="14" aria-hidden="true" />
            {{ t('growth.dailyReviewChange') }}
          </BButton>
          <template v-if="!readOnly">
            <BButton
              class="daily-review__snooze"
              size="small"
              :loading="actionKey === actionId(currentItem, 'snooze_7d')"
              :disabled="Boolean(actionKey)"
              @click="updateState(currentItem, 'snooze_7d')"
            >
              {{ t('growth.recapSnooze') }}
            </BButton>
            <BButton
              class="daily-review__dismiss"
              size="small"
              :disabled="Boolean(actionKey)"
              @click="confirmDismiss(currentItem)"
            >
              {{ t('growth.recapDismiss') }}
            </BButton>
          </template>
        </div>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useGrowth, type RecapItem } from '@/composables/useGrowth.ts';
  import icon from '@/config/icon.ts';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';

  type ReviewSectionKey = 'weekly' | 'onThisDay' | 'buried';
  type RecapAction = 'snooze_7d' | 'dismiss';

  const props = withDefaults(defineProps<{ readOnly?: boolean }>(), { readOnly: false });
  const readOnly = computed(() => props.readOnly);
  const { t, locale } = useI18n();
  const router = useRouter();
  const { recap, recapLoading, recapError, loadRecap, setRecapState } = useGrowth();
  const activeSection = ref<ReviewSectionKey>('weekly');
  const sectionIndexes = ref<Record<ReviewSectionKey, number>>({ weekly: 0, onThisDay: 0, buried: 0 });
  const actionKey = ref('');

  const sections = computed(() =>
    [
      {
        key: 'weekly' as const,
        label: t('growth.recapRecent'),
        hint: t('growth.recapRecentSub'),
        items: recap.value?.weekly || [],
      },
      {
        key: 'onThisDay' as const,
        label: t('growth.recapOnThisDay'),
        hint: t('growth.recapOnThisDaySub'),
        items: recap.value?.onThisDay || [],
      },
      {
        key: 'buried' as const,
        label: t('growth.recapBuried'),
        hint: t('growth.recapBuriedSub'),
        items: recap.value?.buried || [],
      },
    ].filter((section) => section.items.length > 0),
  );
  const hasItems = computed(() => sections.value.length > 0);
  const sectionTabs = computed(() =>
    sections.value.map((section) => ({ key: section.key, label: section.label, badge: section.items.length })),
  );
  const currentSection = computed(() => sections.value.find((section) => section.key === activeSection.value));
  const currentItems = computed(() => currentSection.value?.items || []);
  const currentIndex = computed(() => {
    const count = currentItems.value.length;
    return count ? sectionIndexes.value[activeSection.value] % count : 0;
  });
  const currentItem = computed(() => currentItems.value[currentIndex.value] || null);
  const reviewDateLabel = computed(() => formatStableDate(recap.value?.stableDate));

  watch(
    sections,
    (available) => {
      if (available.some((section) => section.key === activeSection.value)) return;
      activeSection.value = available[0]?.key || 'weekly';
    },
    { immediate: true },
  );

  function formatStableDate(value?: string) {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : new Date();
    return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', weekday: 'short' }).format(date);
  }

  function itemDateLabel(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }

  function itemIcon(item: RecapItem) {
    return item.type === 'note' ? icon.resource.note : icon.resource.bookmark;
  }

  function itemTypeLabel(item: RecapItem) {
    return t(item.type === 'note' ? 'growth.recapNote' : 'growth.recapBookmark');
  }

  function canOpen(item: RecapItem) {
    return item.type === 'note' || Boolean(item.url);
  }

  function openItem(item: RecapItem) {
    if (!canOpen(item)) return;
    if (item.type === 'note') {
      void router.push({
        path: `/noteLibrary/${encodeURIComponent(item.id)}`,
        query: { from: router.currentRoute.value.fullPath },
      });
    } else if (item.url) {
      openBookmarkUrl(item.url);
    }
    recordOperation({ module: '每日回顾', operation: `打开回顾${item.type === 'note' ? '笔记' : '书签'}` });
  }

  function showNext() {
    const count = currentItems.value.length;
    if (count < 2) return;
    sectionIndexes.value[activeSection.value] = (currentIndex.value + 1) % count;
    recordOperation({ module: '每日回顾', operation: '切换下一条回顾' });
  }

  function actionId(item: RecapItem, action: RecapAction) {
    return `${action}:${item.type}:${item.id}`;
  }

  async function updateState(item: RecapItem, action: RecapAction) {
    if (readOnly.value || actionKey.value) return;
    actionKey.value = actionId(item, action);
    try {
      const response = await setRecapState(item, action);
      if (response?.status === 200 && response.data?.ok) {
        message.success(t(action === 'snooze_7d' ? 'growth.recapSnoozed' : 'growth.recapDismissed'));
        recordOperation({
          module: '每日回顾',
          operation: action === 'snooze_7d' ? '回顾稍后提醒' : '回顾不再推荐',
        });
      } else {
        message.error(t('growth.recapStateFailed'));
      }
    } catch (error) {
      console.warn('更新每日回顾偏好失败:', error);
      message.error(t('growth.recapStateFailed'));
    } finally {
      actionKey.value = '';
    }
  }

  function confirmDismiss(item: RecapItem) {
    if (readOnly.value || actionKey.value) return;
    Alert.alert({
      title: t('growth.dailyReviewDismissConfirmTitle'),
      content: t('growth.dailyReviewDismissConfirmDesc'),
      okText: t('growth.dailyReviewDismissConfirm'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => void updateState(item, 'dismiss'),
    });
  }

  function retry() {
    void loadRecap(true);
  }

  onMounted(() => {
    if (!recap.value && !recapLoading.value && !recapError.value) void loadRecap();
  });
</script>

<style scoped lang="less">
  .daily-review {
    position: relative;
    min-width: 0;
    overflow: hidden;
    padding: 16px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 16px;
    color: var(--text-color);
    background: var(--card-background);
    box-shadow: 0 12px 30px -28px color-mix(in srgb, var(--text-color) 38%, transparent);
  }

  .daily-review::before {
    position: absolute;
    inset: 0 0 auto;
    height: 3px;
    background: var(--primary-color);
    content: '';
  }

  .daily-review__header {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
  }

  .daily-review__title-icon,
  .daily-review__resource-icon,
  .daily-review__empty-icon {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    line-height: 0;
  }

  .daily-review__title-icon {
    width: 40px;
    height: 40px;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, var(--card-background));
  }

  .daily-review__heading,
  .daily-review__item-main {
    min-width: 0;
  }

  .daily-review__title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .daily-review__heading h2,
  .daily-review__item h3 {
    margin: 0;
    color: var(--text-color);
  }

  .daily-review__heading h2 {
    font-size: 16px;
    line-height: 1.35;
    font-weight: 750;
  }

  .daily-review__heading p,
  .daily-review__item p {
    margin: 0;
    color: var(--desc-color);
  }

  .daily-review__heading p {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.45;
  }

  .daily-review__date,
  .daily-review__readonly {
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--menu-body-bg-color, var(--card-background));
    white-space: nowrap;
  }

  .daily-review__date {
    padding: 5px 9px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .daily-review__readonly {
    padding: 2px 7px;
    font-size: 10px;
  }

  .daily-review__loading,
  .daily-review__state {
    min-height: 126px;
    margin-top: 14px;
    box-sizing: border-box;
  }

  .daily-review__loading {
    display: grid;
    place-items: center;
    border: 1px dashed var(--surface-border-color, var(--card-border-color));
    border-radius: 13px;
  }

  .daily-review__state {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 13px;
    background: var(--menu-body-bg-color, var(--card-background));
  }

  .daily-review__state--error {
    border-color: var(--error-color, #d14343);
  }

  .daily-review__state-icon {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 2px solid var(--error-color, #d14343);
    border-radius: 50%;
    color: var(--error-color, #d14343);
    font-weight: 800;
  }

  .daily-review__empty-icon {
    width: 34px;
    height: 34px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 10px;
    color: var(--desc-color);
  }

  .daily-review__state > div {
    display: grid;
    gap: 3px;
  }

  .daily-review__state strong {
    font-size: 13px;
  }

  .daily-review__state span:not(.daily-review__state-icon):not(.daily-review__empty-icon) {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.45;
  }

  .daily-review__stale {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 12px;
    padding: 8px 10px;
    border: 1px solid var(--warning-color, #ad6800);
    border-radius: 10px;
    color: var(--warning-color, #ad6800);
    font-size: 11.5px;
  }

  .daily-review__tabs {
    width: fit-content;
    max-width: 100%;
    margin-top: 14px;
  }

  .daily-review__tabs :deep(.tab-container) {
    max-width: 100%;
    overflow-x: auto;
  }

  .daily-review__item {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr) auto;
    align-items: center;
    gap: 13px;
    margin-top: 12px;
    padding: 14px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-left: 3px solid var(--review-accent, var(--primary-color));
    border-radius: 13px;
    background: var(--menu-body-bg-color, var(--card-background));
  }

  .daily-review__item.is-note {
    --review-accent: var(--resource-note-color, #615ced);
  }

  .daily-review__item.is-bookmark {
    --review-accent: var(--resource-bookmark-color, #e48b2c);
  }

  .daily-review__resource-icon {
    width: 44px;
    height: 44px;
    border: 1px solid var(--review-accent);
    border-radius: 12px;
    color: var(--review-accent);
    background: color-mix(in srgb, var(--review-accent) 8%, var(--card-background));
  }

  .daily-review__item-meta {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--desc-color);
    font-size: 10.5px;
  }

  .daily-review__item-meta span {
    color: var(--review-accent);
    font-weight: 700;
  }

  .daily-review__item-meta span::after {
    margin-left: 7px;
    color: var(--desc-color);
    content: '·';
  }

  .daily-review__item h3 {
    margin-top: 4px;
    overflow: hidden;
    font-size: 15px;
    line-height: 1.35;
    font-weight: 720;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-review__item p {
    margin-top: 3px;
    overflow: hidden;
    font-size: 11.5px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-review__open {
    gap: 5px;
  }

  .daily-review__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
  }

  .daily-review__position {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--desc-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .daily-review__position-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--primary-color);
  }

  .daily-review__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-wrap: wrap;
  }

  .daily-review__next {
    gap: 5px;
    color: var(--primary-color);
  }

  .daily-review__dismiss {
    color: var(--error-color, #d14343);
  }

  @media (max-width: 640px) {
    .daily-review {
      padding: 14px 12px 12px;
      border-radius: 16px;
    }

    .daily-review__header {
      grid-template-columns: 38px minmax(0, 1fr);
      gap: 9px;
    }

    .daily-review__title-icon {
      width: 38px;
      height: 38px;
    }

    .daily-review__date {
      grid-column: 2;
      width: fit-content;
      margin-top: -3px;
    }

    .daily-review__tabs {
      width: 100%;
    }

    .daily-review__tabs :deep(.tab-container) {
      width: 100%;
    }

    .daily-review__tabs :deep(.tab) {
      flex: 1 0 auto;
      justify-content: center;
      min-height: 40px;
      padding-inline: 10px;
    }

    .daily-review__item {
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 10px;
      padding: 12px 10px;
    }

    .daily-review__resource-icon {
      width: 40px;
      height: 40px;
    }

    .daily-review__item h3,
    .daily-review__item p {
      white-space: normal;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .daily-review__open {
      grid-column: 1 / -1;
      width: 100%;
      min-height: 44px;
    }

    .daily-review__footer,
    .daily-review__stale {
      align-items: stretch;
      flex-direction: column;
    }

    .daily-review__state {
      align-items: stretch;
      grid-template-columns: auto minmax(0, 1fr);
    }

    .daily-review__state .daily-review__retry {
      grid-column: 1 / -1;
      width: 100%;
      min-height: 44px;
    }

    .daily-review__actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .daily-review__actions :deep(.b_btn) {
      width: 100%;
      min-height: 44px;
    }

    .daily-review__actions .daily-review__next:last-child,
    .daily-review__actions .daily-review__next:nth-last-child(3) {
      grid-column: 1 / -1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .daily-review * {
      scroll-behavior: auto !important;
    }
  }
</style>
