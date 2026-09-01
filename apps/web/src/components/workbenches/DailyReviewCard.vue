<template>
  <section
    v-if="showCard"
    class="daily-review"
    :class="{ 'daily-review--compact': isTerminal }"
    :aria-label="t('growth.dailyReviewTitle')"
    :aria-busy="loading || Boolean(actionKey) || undefined"
  >
    <template v-if="isTerminal">
      <div class="daily-review__compact-state" :class="isSkipped ? 'is-skipped' : 'is-completed'" role="status">
        <span class="daily-review__state-icon" :class="isSkipped ? 'is-skipped' : 'is-success'" aria-hidden="true">
          <SvgIcon :src="isSkipped ? icon.noteTemplate.review : icon.message.success" size="19" />
        </span>
        <div class="daily-review__compact-copy">
          <div class="daily-review__title-row">
            <strong>{{
              isSkipped ? t('growth.dailyReviewSkippedTitle') : t('growth.dailyReviewCompletedTitle')
            }}</strong>
            <BChip v-if="readOnly" tone="neutral">{{ t('growth.dailyReviewReadOnly') }}</BChip>
            <BChip v-if="completionRewardExp > 0" class="daily-review__reward" tone="success">
              {{ t('growth.dailyReviewRewardGranted', { exp: completionRewardExp }) }}
            </BChip>
            <BChip v-else-if="completionRewardSettled" class="daily-review__reward" tone="neutral">
              {{ t('growth.dailyReviewRewardCapReached') }}
            </BChip>
          </div>
          <span>{{ terminalDescription }}</span>
        </div>
        <time class="daily-review__date" :datetime="review?.date || undefined">{{ reviewDateLabel }}</time>
        <BButton
          v-if="isSkipped && !readOnly"
          class="daily-review__resume"
          size="small"
          :loading="actionKey === 'today:resume_today'"
          :disabled="Boolean(actionKey)"
          @click="resumeToday"
        >
          {{ t('growth.dailyReviewResumeToday') }}
        </BButton>
      </div>
    </template>

    <template v-else>
      <header class="daily-review__header">
        <span class="daily-review__title-icon" aria-hidden="true">
          <SvgIcon :src="icon.noteTemplate.review" size="21" />
        </span>
        <div class="daily-review__heading">
          <div class="daily-review__title-row">
            <h2>{{ t('growth.dailyReviewTitle') }}</h2>
            <BChip v-if="readOnly" tone="neutral">{{ t('growth.dailyReviewReadOnly') }}</BChip>
            <BChip v-else-if="canEarnReward" class="daily-review__reward-preview" tone="neutral">
              {{ t('growth.dailyReviewRewardPreview', { exp: configuredRewardExp }) }}
            </BChip>
          </div>
          <p>{{ t('growth.dailyReviewSubtitle') }}</p>
        </div>
        <time class="daily-review__date" :datetime="review?.date || undefined">{{ reviewDateLabel }}</time>
      </header>
    </template>

    <div v-if="error && review" class="daily-review__notice is-stale" role="status">
      <span>{{ t('growth.dailyReviewStale') }}</span>
      <BButton size="small" :loading="loading" @click="retryLoad">{{ t('common.retry') }}</BButton>
    </div>

    <div v-if="actionError && review" class="daily-review__notice is-action-error" role="alert">
      <span>
        <strong>{{ t('growth.dailyReviewSyncFailedTitle') }}</strong>
        {{ syncFailureDesc }}
      </span>
      <BButton size="small" :loading="actionKey === 'retry'" :disabled="Boolean(actionKey)" @click="retryAction">
        {{ t('growth.dailyReviewRetrySync') }}
      </BButton>
    </div>

    <template v-if="!isTerminal">
      <div v-if="loading && !review" class="daily-review__loading">
        <BLoading inline :loading="true" :title="t('growth.dailyReviewLoading')" />
      </div>

      <div v-else-if="error && !review" class="daily-review__state daily-review__state--error" role="alert">
        <span class="daily-review__state-icon is-error" aria-hidden="true">
          <SvgIcon :src="icon.message.error" size="19" />
        </span>
        <div>
          <strong>{{ t('growth.dailyReviewLoadFailedTitle') }}</strong>
          <span>{{ t('growth.dailyReviewLoadFailedDesc') }}</span>
        </div>
        <BButton class="daily-review__retry" size="small" :loading="loading" @click="retryLoad">
          {{ t('common.retry') }}
        </BButton>
      </div>

      <div v-else-if="isEmpty" class="daily-review__state daily-review__state--empty">
        <span class="daily-review__state-icon is-empty" aria-hidden="true">
          <SvgIcon :src="icon.noteDetail.history" size="21" />
        </span>
        <div>
          <strong>{{ t('growth.dailyReviewEmptyTitle') }}</strong>
          <span>{{ t('growth.dailyReviewEmptyDesc') }}</span>
        </div>
      </div>

      <template v-else-if="currentItem">
        <div class="daily-review__progress-row">
          <span>{{ t('growth.dailyReviewProgress', { done: progress.done, total: progress.total }) }}</span>
          <BProgress
            class="daily-review__progress"
            size="small"
            :percent="progressPercent"
            :aria-label="t('growth.dailyReviewProgress', { done: progress.done, total: progress.total })"
          />
        </div>

        <article
          :key="currentItem.id"
          class="daily-review__item"
          :class="`is-${currentItem.resourceType}`"
          aria-live="polite"
        >
          <span class="daily-review__resource-icon" aria-hidden="true">
            <SvgIcon :src="itemIcon(currentItem)" size="22" />
          </span>
          <div class="daily-review__item-main">
            <div class="daily-review__item-meta">
              <BChip :tone="currentItem.resourceType">{{ itemTypeLabel(currentItem) }}</BChip>
              <time v-if="currentItemDate" :datetime="currentItemDate.iso">{{ itemDateLabel(currentItemDate) }}</time>
            </div>
            <h3>{{ currentItem.title || t('growth.dailyReviewUntitled') }}</h3>
            <p class="daily-review__reason">{{ itemReason(currentItem) }}</p>
          </div>
          <div class="daily-review__primary-actions">
            <BButton
              v-if="currentItem.reasonCode === 'active_tag' && currentItem.reasonTag?.id"
              class="daily-review__tag-space"
              :disabled="Boolean(actionKey)"
              @click="openTagSpace(currentItem)"
            >
              <SvgIcon :src="icon.resource.tag" size="15" aria-hidden="true" />
              {{ t('growth.dailyReviewOpenTagSpace') }}
            </BButton>
            <BButton
              type="primary"
              class="daily-review__open"
              :loading="actionKey === actionId(currentItem, 'open')"
              :disabled="!canOpen(currentItem) || Boolean(actionKey)"
              :title="canOpen(currentItem) ? '' : t('growth.dailyReviewUnavailable')"
              @click="openItem(currentItem)"
            >
              {{ t('growth.dailyReviewOpen') }}
              <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
            </BButton>
          </div>
        </article>

        <footer class="daily-review__footer">
          <div class="daily-review__position" aria-live="polite">
            <span class="daily-review__position-dot" aria-hidden="true"></span>
            {{
              t('growth.dailyReviewPosition', {
                current: currentPosition,
                total: progress.total,
              })
            }}
          </div>
          <div class="daily-review__actions">
            <BButton
              v-if="!readOnly"
              class="daily-review__skip"
              size="small"
              :loading="actionKey === 'today:skip_today'"
              :disabled="Boolean(actionKey)"
              @click="skipToday"
            >
              {{ t('growth.dailyReviewSkipToday') }}
            </BButton>
            <BButton
              v-if="pendingItems.length > 1"
              class="daily-review__next"
              size="small"
              :disabled="Boolean(actionKey)"
              @click="showNext"
            >
              <SvgIcon :src="icon.infrastructure.refresh" size="14" aria-hidden="true" />
              {{ t('growth.dailyReviewChange') }}
            </BButton>
            <BActionMenu
              v-if="!readOnly"
              :items="moreActions"
              placement="bottom-right"
              :disabled="Boolean(actionKey)"
              :aria-label="t('growth.dailyReviewMoreActions')"
              @select="handleMoreAction"
            >
              <BButton
                class="daily-review__more"
                size="small"
                :disabled="Boolean(actionKey)"
                :aria-label="t('growth.dailyReviewMoreActions')"
                :title="t('growth.dailyReviewMoreActions')"
              >
                <SvgIcon :src="icon.common.more" size="17" aria-hidden="true" />
              </BButton>
            </BActionMenu>
          </div>
        </footer>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import type { BActionMenuItem } from '@/components/base/BasicComponents/actionMenu.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import type {
    DailyReviewItem,
    DailyReviewItemWriteAction,
    DailyReviewMutationResponse,
  } from '@/api/dailyReviewApi.ts';
  import { useDailyReview } from '@/composables/useDailyReview.ts';
  import icon from '@/config/icon.ts';
  import { useUserStore } from '@/store';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import { resolveResourceRoute } from '@/utils/resourceNavigation.ts';

  const props = withDefaults(defineProps<{ readOnly?: boolean }>(), { readOnly: false });
  const { t, locale } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const readOnly = computed(() => props.readOnly || Boolean(user.adminContext));
  const {
    review,
    loading,
    error,
    actionError,
    failedAction,
    loadDailyReview,
    actOnItem,
    actOnToday,
    retryFailedAction,
  } = useDailyReview();
  const currentIndex = ref(0);
  const actionKey = ref('');

  const identityKey = computed(() =>
    [
      user.id || 'visitor',
      user.role || 'visitor',
      user.adminContext?.id || '',
      user.adminContext?.subjectUserId || '',
      user.adminContext?.mode || '',
      readOnly.value ? 'readonly' : 'writable',
    ].join('|'),
  );
  const isVisitor = computed(() => user.role === 'visitor' || Boolean(review.value?.isVisitor));
  const progress = computed(() => review.value?.progress || { done: 0, total: 0, pending: 0 });
  const orderedItems = computed(() => [...(review.value?.items || [])].sort((a, b) => a.slot - b.slot));
  const pendingItems = computed(() => orderedItems.value.filter((item) => item.action === 'pending'));
  const currentItem = computed(() => {
    const count = pendingItems.value.length;
    return count ? pendingItems.value[currentIndex.value % count] || null : null;
  });
  const currentItemDate = computed(() => (currentItem.value ? itemCalendarDate(currentItem.value) : null));
  const currentPosition = computed(() => {
    if (!currentItem.value || !progress.value.total) return 0;
    const index = orderedItems.value.findIndex((item) => item.id === currentItem.value?.id);
    return Math.min(Math.max(index + 1, 1), progress.value.total);
  });
  const isEmpty = computed(() => review.value?.session?.status === 'empty');
  const isCompleted = computed(() => review.value?.session?.status === 'completed');
  const isSkipped = computed(() => review.value?.session?.status === 'skipped');
  const isTerminal = computed(() => isCompleted.value || isSkipped.value);
  const configuredRewardExp = computed(() => Math.max(0, Number(review.value?.session?.reward?.rewardExp || 0)));
  const completionRewardSettled = computed(() => isCompleted.value && Boolean(review.value?.session?.reward?.settled));
  const completionRewardExp = computed(() =>
    completionRewardSettled.value ? Math.max(0, Number(review.value?.session?.reward?.grantedExp || 0)) : 0,
  );
  const allAvailableItemsReviewed = computed(
    () =>
      orderedItems.value.length > 0 &&
      orderedItems.value.every((item) => item.action === 'opened' || item.action === 'opened_tag_space'),
  );
  const canEarnReward = computed(
    () =>
      !isTerminal.value &&
      configuredRewardExp.value > 0 &&
      !review.value?.session?.reward?.settled &&
      orderedItems.value.length > 0 &&
      orderedItems.value.every(
        (item) => item.action === 'pending' || item.action === 'opened' || item.action === 'opened_tag_space',
      ),
  );
  const terminalDescription = computed(() => {
    if (isSkipped.value) return t('growth.dailyReviewSkippedDesc');
    return allAvailableItemsReviewed.value
      ? t('growth.dailyReviewCompletedDesc')
      : t('growth.dailyReviewProcessedDesc');
  });
  const showCard = computed(() => {
    if (isVisitor.value) return false;
    if ((loading.value && !review.value) || (error.value && !review.value)) return true;
    const status = review.value?.session?.status;
    return status === 'active' || status === 'empty' || status === 'completed' || status === 'skipped';
  });
  const progressPercent = computed(() =>
    progress.value.total ? (progress.value.done / progress.value.total) * 100 : 0,
  );
  const syncFailureDesc = computed(() => {
    const action = failedAction.value;
    return action?.kind === 'item' && (action.action === 'open' || action.action === 'open_tag_space')
      ? t('growth.dailyReviewSyncFailedDesc')
      : t('growth.dailyReviewActionSyncFailedDesc');
  });
  const reviewDateLabel = computed(() => formatStableDate(review.value?.date));
  const moreActions = computed<BActionMenuItem[]>(() => [
    { key: 'snooze_7d', label: t('growth.recapSnooze'), icon: icon.common.time },
    { key: 'preference-divider', divider: true },
    { key: 'dismiss', label: t('growth.dailyReviewDismissItem'), icon: icon.table_delete, danger: true },
  ]);

  watch(
    () => pendingItems.value.map((item) => item.id).join('|'),
    () => {
      if (!pendingItems.value.length || currentIndex.value >= pendingItems.value.length) currentIndex.value = 0;
    },
  );

  watch(
    identityKey,
    () => {
      currentIndex.value = 0;
      if (user.role === 'visitor') return;
      void loadDailyReview({ ensure: !readOnly.value });
    },
    { immediate: true },
  );

  interface CalendarDate {
    year: number;
    month: number;
    day: number;
    iso: string;
  }

  function parseCalendarDate(value?: string | null): CalendarDate | null {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { year, month, day, iso: `${match[1]}-${match[2]}-${match[3]}` };
  }

  function legacyTimeDate(value?: string | null) {
    const match = value?.match(/^(\d{4}-\d{2}-\d{2})/);
    return parseCalendarDate(match?.[1]);
  }

  function itemCalendarDate(item: DailyReviewItem) {
    // resourceDate 非空时是唯一事实源；只有旧条目明确缺失该字段时才从 time 的日期部分兼容回退。
    return item.resourceDate == null ? legacyTimeDate(item.time) : parseCalendarDate(item.resourceDate);
  }

  function calendarDateAsUtc(date: CalendarDate) {
    return new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
  }

  function currentCalendarDate(): CalendarDate {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return {
      year,
      month,
      day,
      iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
  }

  function formatStableDate(value?: string | null) {
    const calendarDate = parseCalendarDate(value) || currentCalendarDate();
    return new Intl.DateTimeFormat(locale.value, {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    }).format(calendarDateAsUtc(calendarDate));
  }

  function itemDateLabel(date: CalendarDate) {
    return new Intl.DateTimeFormat(locale.value, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(calendarDateAsUtc(date));
  }

  function itemReason(item: DailyReviewItem) {
    const itemDate = itemCalendarDate(item);
    const today = parseCalendarDate(review.value?.date) || currentCalendarDate();
    if (item.reasonCode === 'on_this_day' && itemDate) {
      return t('growth.dailyReviewReasonOnThisDay', {
        years: Math.max(1, today.year - itemDate.year),
      });
    }
    if (item.reasonCode === 'active_tag' && item.reasonTag?.name) {
      return t('growth.dailyReviewReasonActiveTag', { tag: item.reasonTag.name });
    }
    if (item.reasonCode === 'buried' && itemDate) {
      const months = Math.max(1, (today.year - itemDate.year) * 12 + today.month - itemDate.month);
      return months >= 12
        ? t('growth.dailyReviewReasonBuriedYears', { years: Math.floor(months / 12) })
        : t('growth.dailyReviewReasonBuriedMonths', { months });
    }
    return t('growth.dailyReviewReasonFallback');
  }

  function itemIcon(item: DailyReviewItem) {
    if (item.resourceType === 'note') return icon.resource.note;
    if (item.resourceType === 'file') return icon.resource.file;
    return icon.resource.bookmark;
  }

  function itemTypeLabel(item: DailyReviewItem) {
    if (item.resourceType === 'note') return t('growth.dailyReviewResourceNote');
    if (item.resourceType === 'file') return t('growth.dailyReviewResourceFile');
    return t('growth.dailyReviewResourceBookmark');
  }

  function canOpen(item: DailyReviewItem) {
    return item.resourceType === 'bookmark' ? Boolean(item.url) : Boolean(item.resourceId);
  }

  function actionId(item: DailyReviewItem, action: DailyReviewItemWriteAction) {
    return `${action}:${item.id}`;
  }

  function handleSuccessfulAction(response: DailyReviewMutationResponse, action: DailyReviewItemWriteAction) {
    if (response?.status !== 200 || !response.data?.ok) return false;
    if (action === 'snooze_7d') message.success(t('growth.recapSnoozed'));
    if (action === 'dismiss') message.success(t('growth.recapDismissed'));
    return true;
  }

  function startItemAction(item: DailyReviewItem, action: DailyReviewItemWriteAction, keepalive = false) {
    if (readOnly.value || actionKey.value) return null;
    const key = actionId(item, action);
    actionKey.value = key;
    const request = actOnItem(item.id, action, { keepalive })
      .then((response) => {
        if (handleSuccessfulAction(response, action)) {
          recordOperation({
            module: '每日回顾',
            operation:
              action === 'open'
                ? '打开内容并完成回顾'
                : action === 'open_tag_space'
                  ? '进入标签空间并完成回顾'
                  : action === 'snooze_7d'
                    ? '七天后再看'
                    : '不再推荐当前内容',
          });
        }
        return response;
      })
      .catch((writeError) => {
        console.warn('同步每日回顾进度失败:', writeError);
        return null;
      })
      .finally(() => {
        if (actionKey.value === key) actionKey.value = '';
      });
    return request;
  }

  function openItem(item: DailyReviewItem) {
    if (!canOpen(item)) return;
    let syncRequest: ReturnType<typeof startItemAction> = null;
    if (item.resourceType === 'bookmark' && item.url) {
      const opened = openBookmarkUrl(item.url, {
        beforeNavigate: () => {
          syncRequest = startItemAction(item, 'open', true);
        },
      });
      if (!opened) return;
    } else if (item.resourceType === 'note') {
      syncRequest = startItemAction(item, 'open', true);
      void router.push({
        path: `/noteLibrary/${encodeURIComponent(item.resourceId)}`,
        query: { from: router.currentRoute.value.fullPath },
      });
    } else {
      syncRequest = startItemAction(item, 'open', true);
      const target = resolveResourceRoute({ type: item.resourceType, id: item.resourceId, title: item.title });
      if (target) void router.push(target);
    }
    recordOperation({ module: '每日回顾', operation: `打开回顾${itemTypeLabel(item)}` });
    void syncRequest;
  }

  function openTagSpace(item: DailyReviewItem) {
    if (item.reasonCode !== 'active_tag' || !item.reasonTag?.id) return;
    const syncRequest = startItemAction(item, 'open_tag_space', true);
    void router.push(`/tag/${encodeURIComponent(item.reasonTag.id)}`);
    recordOperation({ module: '每日回顾', operation: '进入推荐标签空间' });
    void syncRequest;
  }

  function showNext() {
    if (pendingItems.value.length < 2 || actionKey.value) return;
    currentIndex.value = (currentIndex.value + 1) % pendingItems.value.length;
    recordOperation({ module: '每日回顾', operation: '切换下一条回顾' });
  }

  function updateItemPreference(action: 'snooze_7d' | 'dismiss') {
    const item = currentItem.value;
    if (!item || readOnly.value || actionKey.value) return;
    void startItemAction(item, action);
  }

  function confirmDismiss() {
    const target = currentItem.value;
    if (!target || readOnly.value || actionKey.value) return;
    Alert.alert({
      title: t('growth.dailyReviewDismissConfirmTitle'),
      content: t('growth.dailyReviewDismissConfirmDesc'),
      okText: t('growth.dailyReviewDismissConfirm'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => {
        if (readOnly.value || actionKey.value) return;
        void startItemAction(target, 'dismiss');
      },
    });
  }

  function handleMoreAction(key: string) {
    if (key === 'snooze_7d') updateItemPreference('snooze_7d');
    if (key === 'dismiss') confirmDismiss();
  }

  async function skipToday() {
    if (readOnly.value || actionKey.value) return;
    const key = 'today:skip_today';
    actionKey.value = key;
    try {
      const response = await actOnToday('skip_today');
      if (response?.status === 200 && response.data?.ok) {
        message.success(t('growth.dailyReviewSkipped'));
        recordOperation({ module: '每日回顾', operation: '今天先收起' });
      }
    } catch (writeError) {
      console.warn('收起每日回顾失败:', writeError);
    } finally {
      if (actionKey.value === key) actionKey.value = '';
    }
  }

  async function resumeToday() {
    if (readOnly.value || actionKey.value) return;
    const key = 'today:resume_today';
    actionKey.value = key;
    try {
      const response = await actOnToday('resume_today');
      if (response?.status === 200 && response.data?.ok) {
        message.success(t('growth.dailyReviewResumed'));
        recordOperation({ module: '每日回顾', operation: '重新展开今日回顾' });
      }
    } catch (writeError) {
      console.warn('重新展开每日回顾失败:', writeError);
    } finally {
      if (actionKey.value === key) actionKey.value = '';
    }
  }

  async function retryAction() {
    if (actionKey.value) return;
    actionKey.value = 'retry';
    try {
      await retryFailedAction();
    } catch (writeError) {
      console.warn('重试同步每日回顾进度失败:', writeError);
    } finally {
      if (actionKey.value === 'retry') actionKey.value = '';
    }
  }

  function retryLoad() {
    void loadDailyReview({ force: true, ensure: !readOnly.value });
  }
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

  .daily-review--compact {
    padding-top: 13px;
    padding-bottom: 13px;
  }

  .daily-review__compact-state {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 11px;
    min-height: 40px;
  }

  .daily-review__compact-state.is-completed {
    color: var(--success-color, #2d8a4b);
  }

  .daily-review__compact-state.is-skipped {
    color: var(--primary-color);
  }

  .daily-review__compact-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .daily-review__compact-copy strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .daily-review__compact-copy > span {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11.5px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-review__header {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
  }

  .daily-review__title-icon,
  .daily-review__resource-icon,
  .daily-review__state-icon {
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
    font-weight: 700;
  }

  .daily-review__heading p,
  .daily-review__reason {
    margin: 0;
    color: var(--desc-color);
  }

  .daily-review__heading p {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.45;
  }

  .daily-review__date {
    padding: 5px 9px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--menu-body-bg-color, var(--card-background));
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .daily-review__loading,
  .daily-review__state {
    min-height: 116px;
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

  .daily-review__state--completed {
    border-color: var(--success-color, #2d8a4b);
  }

  .daily-review__state-icon {
    width: 34px;
    height: 34px;
    border: 1px solid currentColor;
    border-radius: 10px;
  }

  .daily-review__state-icon.is-error {
    color: var(--error-color, #d14343);
  }

  .daily-review__state-icon.is-success {
    color: var(--success-color, #2d8a4b);
  }

  .daily-review__state-icon.is-skipped {
    color: var(--primary-color);
  }

  .daily-review__state-icon.is-empty {
    color: var(--desc-color);
  }

  .daily-review__state > div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .daily-review__state strong {
    font-size: 13px;
  }

  .daily-review__state span {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.45;
  }

  .daily-review__notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 12px;
    padding: 8px 10px;
    border: 1px solid currentColor;
    border-radius: 10px;
    font-size: 11.5px;
    line-height: 1.4;
  }

  .daily-review__notice.is-stale {
    color: var(--warning-color, #ad6800);
  }

  .daily-review__notice.is-action-error {
    color: var(--error-color, #d14343);
  }

  .daily-review__notice strong {
    margin-right: 4px;
  }

  .daily-review__progress-row {
    display: grid;
    grid-template-columns: auto minmax(90px, 180px);
    align-items: center;
    justify-content: end;
    gap: 10px;
    margin-top: 13px;
    color: var(--desc-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .daily-review__progress {
    width: 180px;
    max-width: 100%;
  }

  .daily-review__item {
    --review-accent: var(--primary-color);

    display: grid;
    grid-template-columns: 46px minmax(0, 1fr) auto;
    align-items: center;
    gap: 13px;
    margin-top: 10px;
    padding: 14px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-left: 3px solid var(--review-accent);
    border-radius: 13px;
    background: var(--menu-body-bg-color, var(--card-background));
  }

  .daily-review__item.is-note {
    --review-accent: var(--resource-note-color, #00a884);
  }

  .daily-review__item.is-bookmark {
    --review-accent: var(--resource-bookmark-color, #615ced);
  }

  .daily-review__item.is-file {
    --review-accent: var(--resource-file-color, #ff8a00);
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
    gap: 8px;
    color: var(--desc-color);
    font-size: 10.5px;
  }

  .daily-review__item h3 {
    margin-top: 5px;
    overflow: hidden;
    font-size: 15px;
    line-height: 1.35;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-review__reason {
    margin-top: 3px;
    overflow: hidden;
    font-size: 11.5px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-review__primary-actions,
  .daily-review__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-wrap: wrap;
  }

  .daily-review__open,
  .daily-review__tag-space,
  .daily-review__next {
    gap: 5px;
  }

  .daily-review__tag-space,
  .daily-review__next {
    color: var(--primary-color);
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

  .daily-review__skip {
    color: var(--desc-color);
  }

  .daily-review__more {
    width: 32px;
    padding: 0;
  }

  :global(html.light-note-mobile-rendering .daily-review) {
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.16);
  }

  :global(html.light-note-mobile-rendering .daily-review__title-icon),
  :global(html.light-note-mobile-rendering .daily-review__resource-icon) {
    background: var(--menu-body-bg-color, var(--card-background));
  }

  @media (max-width: 640px) {
    .daily-review {
      padding: 14px 12px 12px;
      border-radius: 16px;
    }

    .daily-review--compact {
      padding-top: 12px;
    }

    .daily-review__compact-state {
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 9px;
    }

    .daily-review__compact-state .daily-review__date {
      grid-column: auto;
      width: auto;
      margin-top: 0;
    }

    .daily-review__compact-state .daily-review__resume {
      grid-column: 2 / -1;
      width: 100%;
      min-height: 44px;
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

    .daily-review__notice,
    .daily-review__footer {
      align-items: stretch;
      flex-direction: column;
    }

    .daily-review__progress-row {
      grid-template-columns: auto minmax(80px, 1fr);
    }

    .daily-review__progress {
      width: 100%;
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
    .daily-review__reason {
      display: -webkit-box;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .daily-review__primary-actions {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .daily-review__primary-actions :deep(.b_btn) {
      width: 100%;
      min-height: 44px;
    }

    .daily-review__open:only-child {
      grid-column: 1 / -1;
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

    .daily-review__notice :deep(.b_btn) {
      width: 100%;
      min-height: 44px;
    }

    .daily-review__actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 44px;
      width: 100%;
    }

    .daily-review__actions :deep(.b_btn) {
      width: 100%;
      min-height: 44px;
    }

    .daily-review__actions :deep(.b-action-menu-anchor) {
      grid-column: 3;
      width: 44px;
    }

    .daily-review__more {
      padding: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .daily-review * {
      scroll-behavior: auto !important;
    }
  }
</style>
