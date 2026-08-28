<template>
  <div class="tag-space-route">
    <ResourcePageShell
      :title="t('tagSpace.title')"
      :subtitle="t('tagSpace.subtitle')"
      accent="tag"
      layout="workspace"
      :show-header="!bookmark.isMobile"
    >
      <template #actions>
        <template v-if="!isReadOnly">
          <BButton @click="openManagement">{{ t('tagSpace.manageTags') }}</BButton>
          <BButton type="primary" @click="createTag">{{ t('tagSpace.createTag') }}</BButton>
        </template>
      </template>

      <div
        ref="scrollRef"
        v-auto-scrollbar
        class="tag-space-index"
        @touchstart.passive="pullRefresh.onTouchStart"
        @touchmove="pullRefresh.onTouchMove"
        @touchend.passive="pullRefresh.onTouchEnd"
        @touchcancel.passive="pullRefresh.onTouchCancel"
      >
        <BCard as="section" variant="raised" padding="15px 18px" class="space-overview">
          <div class="overview-primary">
            <span class="overview-mark" aria-hidden="true">#</span>
            <div>
              <strong>{{ overview.activeTagTotal }}</strong>
              <span>{{ t('tagSpace.activeSpaces') }}</span>
            </div>
          </div>
          <div class="overview-resources" :aria-label="t('tagSpace.coveredResources')">
            <div v-for="metric in overviewMetrics" :key="metric.key" class="overview-metric">
              <span class="metric-dot" :class="`metric-dot--${metric.key}`"></span>
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
            </div>
          </div>
          <BButton
            v-if="overview.emptyTagTotal && !isReadOnly"
            size="small"
            class="empty-tag-hint"
            @click="openManagement"
          >
            {{ t('tagSpace.emptyTagsInManagement', { count: overview.emptyTagTotal }) }}
          </BButton>
        </BCard>

        <BCard as="section" variant="panel" padding="14px 16px 16px" class="space-workspace">
          <div class="space-toolbar">
            <BInput
              v-if="!bookmark.isMobile"
              v-model:value="keyword"
              clearable
              height="40px"
              class="space-search"
              :placeholder="t('tagSpace.searchPlaceholder')"
            >
              <template #prefix><SvgIcon :src="icon.navigation.search" size="18" /></template>
            </BInput>
            <div class="space-toolbar__copy">
              <strong>{{ t('tagSpace.browseTitle') }}</strong>
              <span>{{ t('tagSpace.resultCount', { count: total }) }}</span>
            </div>
            <BSelect v-model:value="sort" class="space-sort" :options="sortOptions" />
          </div>

          <div class="space-filters no-scrollbar" :aria-label="t('tagSpace.filtersTitle')">
            <BButton
              v-for="item in filterOptions"
              :key="item.value"
              size="small"
              class="space-filter"
              :class="[`space-filter--${item.value}`, { 'is-active': filter === item.value }]"
              :aria-pressed="filter === item.value"
              @click="filter = item.value"
            >
              <span class="metric-dot" :class="`metric-dot--${item.value}`"></span>
              <span>{{ item.label }}</span>
              <strong>{{ item.count }}</strong>
            </BButton>
            <span v-if="refreshing" class="refreshing-copy" role="status">{{ t('tagSpace.refreshing') }}</span>
          </div>

          <BCard v-if="error && hasData" variant="raised" padding="10px 12px" class="inline-error" role="alert">
            <span>{{ t('tagSpace.staleError') }}</span>
            <BButton size="small" @click="reload({ silent: true })">{{ t('common.retry') }}</BButton>
          </BCard>

          <div v-if="loading" class="space-grid" aria-busy="true" :aria-label="t('common.loading')">
            <BCard v-for="index in 8" :key="index" as="article" padding="18px" class="space-card space-skeleton">
              <span class="skeleton-line skeleton-line--title"></span>
              <span class="skeleton-line skeleton-line--metric"></span>
              <span class="skeleton-line"></span>
              <span class="skeleton-line skeleton-line--short"></span>
            </BCard>
          </div>

          <BCard v-else-if="error && !hasData" variant="raised" padding="28px" class="state-card" role="alert">
            <span class="state-symbol">!</span>
            <strong>{{ t('tagSpace.loadFailedTitle') }}</strong>
            <p>{{ t('tagSpace.loadFailedDesc') }}</p>
            <BButton type="primary" @click="reload()">{{ t('common.retry') }}</BButton>
          </BCard>

          <BCard v-else-if="!items.length" variant="raised" padding="28px" class="state-card">
            <span class="state-symbol">#</span>
            <strong>{{ emptyStateTitle }}</strong>
            <p>{{ emptyStateDescription }}</p>
            <BButton v-if="keyword.trim()" @click="keyword = ''">{{ t('tagSpace.clearSearch') }}</BButton>
            <BButton v-else-if="filter !== 'all'" @click="filter = 'all'">{{ t('tagSpace.clearFilter') }}</BButton>
            <div v-else-if="onlyEmptyTags && !isReadOnly" class="state-actions">
              <BButton @click="openManagement">{{ t('tagSpace.manageTags') }}</BButton>
              <BButton type="primary" @click="openResourceCenter">{{ t('tagSpace.addTagsToContent') }}</BButton>
            </div>
            <BButton v-else-if="!isReadOnly" type="primary" @click="createTag">{{ t('tagSpace.createTag') }}</BButton>
          </BCard>

          <div v-else class="space-grid">
            <BCard
              v-for="space in items"
              :key="space.id"
              as="article"
              variant="card"
              interactive
              padding="0"
              class="space-card"
              role="button"
              tabindex="0"
              :aria-label="
                t('tagSpace.openSpaceAria', {
                  name: space.name || t('tagSpace.unnamed'),
                  count: space.counts.total,
                })
              "
              @click="openSpace(space.id)"
              @keydown.enter="openSpace(space.id)"
              @keydown.space.prevent="openSpace(space.id)"
            >
              <div class="space-card__header">
                <div class="space-identity">
                  <span class="space-icon">
                    <SvgIcon v-if="space.iconUrl" :src="space.iconUrl" size="24" />
                    <span v-else>#</span>
                  </span>
                  <div>
                    <BTooltip :title="space.name" :disabled="space.name.length < 18">
                      <strong>{{ space.name || t('tagSpace.unnamed') }}</strong>
                    </BTooltip>
                    <span>{{ t('tagSpace.resourceTotal', { count: space.counts.total }) }}</span>
                  </div>
                </div>
                <span class="open-arrow" aria-hidden="true">→</span>
              </div>

              <div class="space-metrics">
                <span v-for="metric in cardMetrics(space)" :key="metric.key" class="space-metric">
                  <span class="metric-dot" :class="`metric-dot--${metric.key}`"></span>
                  <span>{{ metric.label }}</span>
                  <strong>{{ metric.value }}</strong>
                </span>
              </div>

              <div class="space-previews">
                <div
                  v-for="preview in space.previewResources"
                  :key="`${preview.type}:${preview.id}`"
                  class="preview-row"
                >
                  <span class="preview-icon" :class="`preview-icon--${preview.type}`">
                    <SvgIcon :src="resourceIcon(preview.type)" size="15" />
                  </span>
                  <span>{{ preview.title || t('tagSpace.untitledResource') }}</span>
                </div>
              </div>

              <div class="space-card__footer">
                <span>{{ activityLabel(space.lastActivityTime) }}</span>
                <strong>{{ t('tagSpace.enterSpace') }}</strong>
              </div>
            </BCard>
          </div>

          <div v-if="items.length && hasMore" class="load-more-row">
            <BButton :loading="loadingMore" @click="loadMore">{{ t('tagSpace.loadMore') }}</BButton>
          </div>
        </BCard>
      </div>
    </ResourcePageShell>

    <MobilePageActionsDrawer
      v-model:open="mobileActionsOpen"
      :title="t('common.more')"
      :actions="mobileActions"
      @action="handleMobileAction"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute } from 'vue-router';
  import router from '@/router';
  import { bookmarkStore, useUserStore } from '@/store';
  import icon from '@/config/icon';
  import type { BaseOptions } from '@/config/bookmarkCfg.ts';
  import type { TagSpaceFilter, TagSpaceResourceType, TagSpaceSort, TagSpaceSummary } from '@/api/tagSpace';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useAndroidPullRefresh } from '@/composables/useAndroidPullRefresh';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { useTagSpaceIndex } from './useTagSpaceIndex';
  import { readTagSpaceHistoryState, readTagSpaceQuery, writeTagSpaceQuery } from './tagSpaceIndexState';

  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const route = useRoute();
  const initialQuery = readTagSpaceQuery(route.query);
  const keyword = ref(bookmark.isMobile ? '' : initialQuery.keyword);
  const filter = ref<TagSpaceFilter>(initialQuery.filter);
  const sort = ref<TagSpaceSort>(initialQuery.sort);
  let restoredHistoryState = readTagSpaceHistoryState(window.history.state);
  const mobileActionsOpen = ref(false);
  const scrollRef = ref<HTMLElement | null>(null);
  const {
    items,
    page,
    total,
    facets,
    overview,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    hasData,
    reload,
    loadMore,
  } = useTagSpaceIndex({ keyword, filter, sort });

  const isReadOnly = computed(() => user.adminContext?.mode === 'readonly');
  const onlyEmptyTags = computed(
    () =>
      !keyword.value.trim() &&
      filter.value === 'all' &&
      overview.value.tagTotal > 0 &&
      overview.value.activeTagTotal === 0,
  );
  const emptyStateTitle = computed(() => {
    if (keyword.value.trim()) return t('tagSpace.noMatchTitle');
    if (filter.value !== 'all') return t('tagSpace.noFilteredSpacesTitle');
    if (onlyEmptyTags.value) return t('tagSpace.onlyEmptyTagsTitle');
    return t('tagSpace.emptyTitle');
  });
  const emptyStateDescription = computed(() => {
    if (keyword.value.trim()) return t('tagSpace.noMatchDesc');
    if (filter.value !== 'all') return t('tagSpace.noFilteredSpacesDesc');
    if (onlyEmptyTags.value) return t('tagSpace.onlyEmptyTagsDesc');
    return t('tagSpace.emptyDesc');
  });

  const overviewMetrics = computed(() => [
    { key: 'bookmark', label: t('tagSpace.bookmark'), value: overview.value.covered.bookmark },
    { key: 'note', label: t('tagSpace.note'), value: overview.value.covered.note },
    { key: 'file', label: t('tagSpace.file'), value: overview.value.covered.file },
  ]);
  const filterOptions = computed(() => [
    { value: 'all' as const, label: t('tagSpace.filterAll'), count: facets.value.all },
    { value: 'bookmark' as const, label: t('tagSpace.bookmark'), count: facets.value.bookmark },
    { value: 'note' as const, label: t('tagSpace.note'), count: facets.value.note },
    { value: 'file' as const, label: t('tagSpace.file'), count: facets.value.file },
  ]);
  const sortOptions = computed<BaseOptions[]>(() => [
    { label: t('tagSpace.sortRecent'), value: 'recent' },
    { label: t('tagSpace.sortDefault'), value: 'default' },
    { label: t('tagSpace.sortResourceDesc'), value: 'resourceDesc' },
    { label: t('tagSpace.sortNameAsc'), value: 'nameAsc' },
  ]);
  const mobileActions = computed<MobilePageActionItem[]>(() =>
    isReadOnly.value
      ? []
      : [
          {
            key: 'manage',
            label: t('tagSpace.manageTags'),
            description: t('tagSpace.manageTagsHint'),
            icon: icon.manage_categoryBtn_tag,
          },
        ],
  );

  const pullRefresh = useAndroidPullRefresh({
    externalBusy: computed(() => loading.value || refreshing.value || loadingMore.value),
    getScrollContainer: () => scrollRef.value,
    onRefresh: () => reload({ silent: true }),
  });
  useForegroundRefresh({
    refresh: () => reload({ silent: true }),
    canRefresh: () => !loading.value && !refreshing.value && !loadingMore.value,
  });
  useMobileTopBar(
    ['tagMg'],
    isReadOnly.value
      ? { searchSourceType: 'tag' }
      : {
          searchSourceType: 'tag',
          onAuxiliaryAction: () => {
            mobileActionsOpen.value = true;
          },
          auxiliaryActionLabel: () => t('common.more'),
          auxiliaryActionIcon: () => icon.common.more,
          onAdd: createTag,
          addLabel: () => t('tagSpace.createTag'),
        },
  );

  function cardMetrics(space: TagSpaceSummary) {
    return [
      { key: 'bookmark', label: t('tagSpace.bookmark'), value: space.counts.bookmark },
      { key: 'note', label: t('tagSpace.note'), value: space.counts.note },
      { key: 'file', label: t('tagSpace.file'), value: space.counts.file },
    ].filter((metric) => metric.value > 0);
  }

  function resourceIcon(type: TagSpaceResourceType) {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    return icon.resource.bookmark;
  }

  function activityLabel(value: string | null) {
    if (!value) return t('tagSpace.noActivity');
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return t('tagSpace.hasActivity');
    return t('tagSpace.updatedAt', {
      time: new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date),
    });
  }

  function openSpace(id: string) {
    saveIndexState();
    router.push(`/tag/${id}`);
  }

  function openManagement() {
    if (isReadOnly.value) return;
    saveIndexState();
    router.push({ path: '/manage/tagMg', query: { mode: 'manage' } });
  }

  function createTag() {
    if (isReadOnly.value) return;
    router.push('/manage/editTag/add');
  }

  function openResourceCenter() {
    router.push('/search');
  }

  function handleMobileAction(action: MobilePageActionItem) {
    if (action.key === 'manage') openManagement();
  }

  function saveIndexState() {
    if (route.name !== 'tagMg' || route.query.mode === 'manage') return;
    restoredHistoryState = { page: page.value, scrollTop: scrollRef.value?.scrollTop || 0 };
    window.history.replaceState(
      {
        ...window.history.state,
        tagSpaceIndex: restoredHistoryState,
      },
      '',
    );
  }

  function restoreScroll() {
    nextTick(() => {
      if (scrollRef.value) scrollRef.value.scrollTop = restoredHistoryState.scrollTop;
    });
  }

  watch([keyword, filter, sort], () => {
    const query = writeTagSpaceQuery(route.query, {
      keyword: keyword.value,
      filter: filter.value,
      sort: sort.value,
    });
    void router.replace({ path: route.path, query });
  });

  watch(
    () => bookmark.isMobile,
    (isMobile) => {
      if (isMobile && keyword.value) keyword.value = '';
    },
  );

  watch(
    () => route.query,
    (query) => {
      const state = readTagSpaceQuery(query);
      if (keyword.value !== state.keyword) keyword.value = state.keyword;
      if (filter.value !== state.filter) filter.value = state.filter;
      if (sort.value !== state.sort) sort.value = state.sort;
    },
  );

  onMounted(async () => {
    if (bookmark.isMobile && route.query.q) {
      await router.replace({
        path: route.path,
        query: writeTagSpaceQuery(route.query, { keyword: '', filter: filter.value, sort: sort.value }),
      });
    }
    await reload({ targetPage: restoredHistoryState.page });
    restoreScroll();
  });
  onActivated(restoreScroll);
  onDeactivated(saveIndexState);
  onBeforeUnmount(saveIndexState);
</script>

<style scoped lang="less">
  .tag-space-route {
    width: 100%;
    height: 100%;
  }

  .tag-space-index {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .space-overview {
    display: grid;
    grid-template-columns: minmax(180px, 0.7fr) minmax(360px, 1.5fr) auto;
    align-items: center;
    gap: 18px;
    flex: 0 0 auto;
  }

  .overview-primary,
  .overview-resources,
  .overview-metric,
  .space-toolbar,
  .space-filters,
  .space-identity,
  .space-metrics,
  .space-metric,
  .preview-row,
  .space-card__footer,
  .inline-error {
    display: flex;
    align-items: center;
  }

  .overview-primary {
    min-width: 0;
    gap: 12px;
  }

  .overview-mark,
  .state-symbol {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-tag-color, #ec4899);
    border-radius: 12px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    font-size: 22px;
    font-weight: 750;
  }

  .overview-primary > div {
    display: flex;
    flex-direction: column;
  }

  .overview-primary strong {
    color: var(--text-color);
    font-size: 23px;
    line-height: 1.15;
  }

  .overview-primary span,
  .overview-metric span,
  .space-toolbar__copy span,
  .space-identity span,
  .space-card__footer span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .overview-resources {
    min-width: 0;
    gap: 9px;
    flex-wrap: wrap;
  }

  .overview-metric {
    min-width: 112px;
    gap: 7px;
    padding: 8px 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
  }

  .overview-metric strong {
    margin-left: auto;
  }

  .empty-tag-hint {
    max-width: 260px;
    height: auto;
    min-height: 28px;
    line-height: 1.35;
    white-space: normal;
  }

  .space-workspace {
    min-height: 0;
    flex: 1 0 auto;
  }

  .space-toolbar {
    min-height: 40px;
    gap: 12px;
  }

  .space-search {
    width: min(420px, 42vw);
  }

  .space-toolbar__copy {
    min-width: 150px;
    margin-right: auto;
    display: flex;
    flex-direction: column;
  }

  .space-toolbar__copy strong {
    font-size: 14px;
  }

  .space-sort {
    width: 170px;
  }

  .space-filters {
    min-height: 42px;
    display: flex;
    gap: 7px;
    padding: 11px 0 13px;
    overflow-x: auto;
  }

  .space-filter {
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 999px;
  }

  .space-filter.is-active {
    border-color: var(--resource-tag-color, #ec4899);
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color) !important;
  }

  .metric-dot {
    width: 7px;
    height: 7px;
    display: inline-block;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--resource-tag-color, #ec4899);
  }

  .metric-dot--bookmark {
    background: var(--resource-bookmark-color, #615ced);
  }
  .metric-dot--note {
    background: var(--resource-note-color, #00a884);
  }
  .metric-dot--file {
    background: var(--resource-file-color, #ff8a00);
  }

  .refreshing-copy {
    margin-left: auto;
    align-self: center;
    color: var(--desc-color);
    font-size: 12px;
  }

  .inline-error {
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    border-color: var(--danger-color, #fe2c55);
    color: var(--danger-color, #fe2c55);
  }

  .space-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(285px, 1fr));
    gap: 12px;
  }

  .space-card {
    min-height: 232px;
    overflow: hidden;
    cursor: pointer;
  }

  .space-card:focus-visible,
  .space-card:hover {
    border-color: var(--resource-tag-color, #ec4899);
  }

  .space-card__header {
    padding: 16px 16px 13px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .space-identity {
    min-width: 0;
    gap: 10px;
  }

  .space-icon {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--resource-tag-color, #ec4899);
    border-radius: 11px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    font-size: 19px;
    font-weight: 750;
  }

  .space-identity > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .space-identity :deep(.b-tooltip-wrap) {
    min-width: 0;
    max-width: 100%;
  }

  .space-identity strong {
    overflow: hidden;
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .open-arrow {
    color: var(--desc-color);
    font-size: 17px;
  }

  .space-metrics {
    min-height: 35px;
    gap: 12px;
    padding: 9px 16px 5px;
    flex-wrap: wrap;
  }

  .space-metric {
    gap: 5px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .space-metric strong {
    color: var(--text-color);
  }

  .space-previews {
    min-height: 82px;
    padding: 5px 16px 10px;
    display: grid;
    align-content: start;
    gap: 5px;
  }

  .preview-row {
    min-width: 0;
    gap: 7px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .preview-row > span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-icon {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border-radius: 7px;
    color: var(--resource-bookmark-color, #615ced);
    background: var(--workspace-panel-bg-color);
  }
  .preview-icon--note {
    color: var(--resource-note-color, #00a884);
  }
  .preview-icon--file {
    color: var(--resource-file-color, #ff8a00);
  }

  .space-card__footer {
    min-height: 38px;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 16px;
    border-top: 1px solid var(--surface-divider-color);
  }

  .space-card__footer strong {
    color: var(--resource-tag-color, #ec4899);
    font-size: 12px;
  }

  .state-card {
    min-height: 260px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 9px;
    text-align: center;
  }

  .state-card > strong {
    font-size: 16px;
  }
  .state-card p {
    max-width: 460px;
    margin: 0 0 5px;
    color: var(--desc-color);
    font-size: 13px;
  }
  .state-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .load-more-row {
    display: flex;
    justify-content: center;
    padding: 18px 0 4px;
  }

  .space-skeleton {
    cursor: default;
  }
  .skeleton-line {
    height: 12px;
    margin: 12px 0;
    display: block;
    border-radius: 999px;
    background: var(--skeleton-bg-color, var(--surface-divider-color));
    animation: tag-space-pulse 1.15s ease-in-out infinite alternate;
  }
  .skeleton-line--title {
    width: 62%;
    height: 17px;
  }
  .skeleton-line--metric {
    width: 82%;
    margin-top: 32px;
  }
  .skeleton-line--short {
    width: 46%;
  }

  @keyframes tag-space-pulse {
    to {
      opacity: 0.42;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .space-card:hover .open-arrow {
      color: var(--resource-tag-color, #ec4899);
      transform: translateX(2px);
    }
  }

  @media (max-width: 900px) {
    .space-overview {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .empty-tag-hint {
      max-width: none;
      justify-self: start;
    }
  }

  @media (max-width: 767px) {
    .tag-space-index {
      gap: 10px;
      overflow-x: hidden;
      scrollbar-gutter: auto;
    }
    .space-overview {
      padding: 13px 14px !important;
    }
    .overview-primary {
      padding-bottom: 10px;
      border-bottom: 1px solid var(--surface-divider-color);
    }
    .overview-mark {
      width: 38px;
      height: 38px;
    }
    .overview-primary strong {
      font-size: 21px;
    }
    .overview-resources {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .overview-metric {
      min-width: 0;
      padding: 7px 8px;
    }
    .overview-metric span:not(.metric-dot) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .empty-tag-hint {
      width: 100%;
    }
    .space-workspace {
      padding: 12px 0 16px !important;
      border-inline: 0;
      border-radius: 12px;
    }
    .space-toolbar {
      padding-inline: 13px;
    }
    .space-toolbar__copy {
      min-width: 0;
    }
    .space-sort {
      width: 145px;
    }
    .space-filters {
      padding: 10px 13px 12px;
    }
    .space-filter {
      flex: 0 0 auto;
      min-height: 30px;
    }
    .refreshing-copy {
      display: none;
    }
    .inline-error {
      margin: 0 13px 10px;
    }
    .space-grid {
      grid-template-columns: 1fr;
      gap: 9px;
      padding-inline: 10px;
    }
    .space-card {
      min-height: 0;
    }
    .space-card__header {
      padding: 14px 14px 11px;
    }
    .space-metrics {
      padding-inline: 14px;
    }
    .space-previews {
      min-height: 0;
      padding: 4px 14px 9px;
    }
    .space-card__footer {
      padding-inline: 14px;
    }
    .state-card {
      margin-inline: 10px;
      min-height: 240px;
    }
  }

  html.light-note-mobile-rendering .space-card:focus-visible,
  html.light-note-mobile-rendering .space-filter.is-active {
    border-color: var(--resource-tag-color, #ec4899);
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .space-card,
    .open-arrow,
    .skeleton-line {
      transition: none;
      animation: none;
    }
  }
</style>
