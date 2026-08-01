<template>
  <div class="search-center-route">
    <!-- 与「待整理」共用同一个顶栏组件：两个分区是不同路由，但对用户是同一页面的两个页签 -->
    <ResourceCenterTopBar
      v-if="bookmark.isMobile"
      :keyword="queryState.keyword"
      input-id="mobile-search-page-input"
      @update:keyword="onMobileSearchKeyword"
      @submit="submitSearch"
      @back="leaveSearchPage"
      @create="inbox.openQuickCapture()"
    />

    <ResourcePageShell
      class="search-center-shell"
      :title="t('resourceCenter.title')"
      :subtitle="t('resourceCenter.subtitle')"
      accent="neutral"
      layout="workspace"
      :class="{ 'search-center-shell--mobile': bookmark.isMobile }"
    >
      <div
        class="search-page"
        :class="{
          'search-page--night': user.currentTheme === 'night',
          'search-page--mobile': bookmark.isMobile,
        }"
      >
        <div class="search-page-topbar">
          <ResourceCenterSectionNav class="section-switcher" />
        </div>

        <BCard v-if="!bookmark.isMobile" as="section" variant="raised" padding="16px 20px" class="search-header">
          <div class="search-header-input">
            <b-input
              id="search-center-input"
              v-model:value="queryState.keyword"
              :placeholder="t('resourceCenter.searchPlaceholder')"
              height="42px"
              @input="syncQueryDebounced"
              @enter="submitSearch"
            >
              <template #prefix>
                <svg-icon :src="icon.navigation.search" size="18" />
              </template>
            </b-input>
            <BButton
              class="search-ai-entry"
              :disabled="!queryState.keyword.trim() && !selectedIds.length"
              @click="openSearchAi(selectedIds.length > 1 ? 'compare' : 'find')"
            >
              <svg-icon :src="icon.ai.ask" size="16" />
              {{ t('ai.entry.askSearch') }}
            </BButton>
            <BTooltip :title="t('resourceCenter.refresh')">
              <BButton
                class="search-header-icon-btn refresh-btn"
                :disabled="viewState.loading"
                :aria-label="t('resourceCenter.refresh')"
                @click="refreshData"
                v-click-log="{ module: '资源中心', operation: '刷新搜索结果' }"
              >
                <span class="refresh-icon" :class="{ 'refresh-icon--spinning': viewState.loading }" aria-hidden="true">
                  <SvgIcon :src="icon.cloudSpace.preview.retry" size="17" />
                </span>
              </BButton>
            </BTooltip>
            <BTooltip :title="t('resourceCenter.knowledgeGraph')">
              <BButton
                class="search-header-icon-btn graph-entry"
                :aria-label="t('resourceCenter.knowledgeGraph')"
                @click="$router.push({ path: '/manage/tagMg', query: { view: 'map' } })"
                v-click-log="{ module: '资源中心', operation: '进入知识地图' }"
              >
                <svg-icon :src="icon.ai.internet" size="17" aria-hidden="true" />
              </BButton>
            </BTooltip>
          </div>
        </BCard>

        <section class="search-layout">
          <!-- 移动端不放一排类型 Tab：用户搜索时先看最佳匹配，而不是先决定类型。
               类型收进底部筛选抽屉，这里只保留一行类型数量作为结果概览。 -->
          <BCard as="main" variant="card" padding="16px" class="result-panel">
            <div class="result-toolbar result-toolbar--summary">
              <div class="result-heading">
                <template v-if="bookmark.isMobile">
                  <div class="result-title">{{ t('resourceCenter.results') }}</div>
                  <div class="result-subtitle">{{ mobileResultSubtitle }}</div>
                </template>
                <BPopover
                  v-else
                  v-model:open="desktopTypeMenuOpen"
                  trigger="click"
                  placement="bottom-left"
                  overlay-class-name="desktop-type-filter-popover"
                >
                  <BButton
                    class="desktop-type-trigger"
                    :aria-label="t('resourceCenter.typeFilter')"
                    :aria-expanded="desktopTypeMenuOpen"
                  >
                    <span
                      class="filter-dot"
                      :class="`filter-dot--${desktopTypeSummary.value}`"
                      aria-hidden="true"
                    ></span>
                    <span class="desktop-type-trigger__label">{{ desktopTypeSummary.label }}</span>
                    <span class="filter-count">{{ desktopTypeSummary.count }}</span>
                    <span class="desktop-type-trigger__arrow" aria-hidden="true">▾</span>
                  </BButton>
                  <template #content>
                    <div class="desktop-type-menu" role="menu" :aria-label="t('resourceCenter.typeFilter')">
                      <BButton
                        v-for="item in typeFilters"
                        :key="item.value"
                        class="filter-item"
                        :class="{ active: isTypeFilterActive(item.value) }"
                        role="menuitemcheckbox"
                        :aria-checked="isTypeFilterActive(item.value)"
                        @click="selectDesktopType(item.value)"
                      >
                        <span class="filter-dot" :class="`filter-dot--${item.value}`" aria-hidden="true"></span>
                        <span>{{ item.label }}</span>
                        <span class="filter-count">{{ item.count }}</span>
                      </BButton>
                    </div>
                  </template>
                </BPopover>
              </div>
              <div v-if="!bookmark.isMobile" class="desktop-result-controls">
                <label class="select-wrap select-wrap--compact">
                  <span>{{ t('resourceCenter.sort.label') }}</span>
                  <BSelect
                    class="filter-select"
                    :options="sortOptions"
                    v-model:value="queryState.sort"
                    @change="applyQueryState('切换排序')"
                  />
                </label>

                <label class="select-wrap select-wrap--compact">
                  <span>{{ t('resourceCenter.date.label') }}</span>
                  <BSelect
                    class="filter-select"
                    :options="dateOptions"
                    v-model:value="queryState.date"
                    @change="applyQueryState('筛选时间范围')"
                  />
                </label>

                <div class="view-switch">
                  <BButton class="view-btn" :class="{ active: queryState.view === 'card' }" @click="setView('card')">
                    {{ t('resourceCenter.view.card') }}
                  </BButton>
                  <BButton class="view-btn" :class="{ active: queryState.view === 'list' }" @click="setView('list')">
                    {{ t('resourceCenter.view.list') }}
                  </BButton>
                </div>

                <BButton class="tagless-btn" :class="{ active: queryState.untagged }" @click="toggleUntagged">
                  {{ t('resourceCenter.untagged') }}
                </BButton>

                <BButton
                  class="select-visible-btn"
                  :disabled="!selectableVisibleItems.length"
                  @click="toggleBatchMode"
                >
                  {{ batchMode ? t('resourceCenter.batch.exit') : t('resourceCenter.batch.enter') }}
                </BButton>
              </div>
              <div v-if="bookmark.isMobile" class="toolbar-actions toolbar-actions--mobile">
                <BButton
                  class="mobile-toolbar-btn mobile-toolbar-btn--icon"
                  :disabled="viewState.loading"
                  :aria-label="t('resourceCenter.refresh')"
                  :title="t('resourceCenter.refresh')"
                  @click="refreshData"
                  v-click-log="{ module: '资源中心', operation: '刷新搜索结果' }"
                >
                  <span
                    class="refresh-icon"
                    :class="{ 'refresh-icon--spinning': viewState.loading }"
                    aria-hidden="true"
                  >
                    <SvgIcon :src="icon.cloudSpace.preview.retry" size="16" />
                  </span>
                </BButton>
                <BButton
                  class="mobile-toolbar-btn mobile-filter-btn"
                  :class="{ active: mobileActiveFilterCount > 0 }"
                  @click="mobileFilterVisible = true"
                  v-click-log="{ module: '资源中心', operation: '打开移动端筛选' }"
                >
                  <SvgIcon :src="icon.cloudSpace.filter" size="15" aria-hidden="true" />
                  <span>{{ t('common.filter') }}</span>
                  <span v-if="mobileActiveFilterCount" class="mobile-filter-count">{{ mobileActiveFilterCount }}</span>
                </BButton>
                <BButton
                  class="mobile-toolbar-btn mobile-ai-btn"
                  :disabled="!queryState.keyword.trim() && !selectedIds.length"
                  :aria-label="t('ai.entry.askSearch')"
                  :title="t('ai.entry.askSearch')"
                  @click="openSearchAi(selectedIds.length > 1 ? 'compare' : 'find')"
                >
                  <SvgIcon :src="icon.ai.ask" size="15" aria-hidden="true" />
                  <span>AI</span>
                </BButton>
                <BButton class="mobile-toolbar-btn" @click="toggleBatchMode">
                  {{ batchMode ? t('resourceCenter.batch.exit') : t('resourceCenter.batch.enter') }}
                </BButton>
              </div>
              <div v-else class="toolbar-actions">
                <BButton
                  size="small"
                  class="clear-btn"
                  :disabled="!queryState.keyword"
                  @click="clearKeyword"
                  v-click-log="{ module: '资源中心', operation: '清空搜索关键词' }"
                >
                  {{ t('resourceCenter.clear') }}
                </BButton>
                <BButton
                  size="small"
                  class="clear-btn"
                  :disabled="!hasActiveAdvancedFilters"
                  @click="clearAdvancedFilters"
                  v-click-log="{ module: '资源中心', operation: '清空筛选条件' }"
                >
                  {{ t('resourceCenter.clearFilters') }}
                </BButton>
              </div>
            </div>

            <section v-if="!bookmark.isMobile" class="advanced-filters">
              <div class="tag-filter-wrap" v-if="tagOptions.length">
                <div class="tag-filter-label">{{ t('resourceCenter.tagFilter') }}</div>
                <div class="tag-filter-main">
                  <div class="tag-filter-list">
                    <BButton
                      v-for="tag in tagOptions"
                      :key="tag"
                      class="tag-chip"
                      :class="{ active: queryState.tags.includes(tag) }"
                      @click="toggleTagFilter(tag)"
                    >
                      {{ tag }}
                    </BButton>
                  </div>
                  <BPopover
                    v-if="tagOptions.length > 14"
                    v-model:open="showAllTags"
                    trigger="click"
                    placement="bottom-right"
                  >
                    <BButton class="tag-toggle-btn">
                      {{ showAllTags ? t('resourceCenter.tagCollapse') : `${t('common.more')} ${tagOptions.length}` }}
                    </BButton>
                    <template #content>
                      <div class="tag-filter-popover">
                        <BInput
                          v-model:value="tagSearch"
                          :placeholder="t('resourceCenter.tagSearchPlaceholder')"
                          clearable
                        />
                        <BButton
                          v-for="tag in filteredTagOptions"
                          :key="tag"
                          class="tag-chip"
                          :class="{ active: queryState.tags.includes(tag) }"
                          @click="toggleTagFilter(tag)"
                        >
                          {{ tag }}
                        </BButton>
                      </div>
                    </template>
                  </BPopover>
                </div>
              </div>
            </section>

            <section v-if="batchMode" class="batch-toolbar">
              <div class="batch-left">
                <span>{{ t('resourceCenter.batch.selectedCount', { count: selectedIds.length }) }}</span>
              </div>
              <div class="batch-actions">
                <b-button v-if="bookmark.isMobile" @click="toggleSelectAllVisible">
                  {{ allVisibleSelected ? t('resourceCenter.batch.unselectAll') : t('resourceCenter.batch.selectAll') }}
                </b-button>
                <b-button @click="openSearchAi('organize')">
                  <SvgIcon :src="icon.ai.organize" size="15" />
                  {{ t('ai.entry.organizeSelected') }}
                </b-button>
                <b-button @click="batchAddToInbox">{{ t('inbox.addExisting') }}</b-button>
                <b-button type="primary" @click="batchAddTag">{{ t('resourceCenter.batch.addTag') }}</b-button>
                <b-button type="primary" @click="batchRemoveTag">{{ t('resourceCenter.batch.removeTag') }}</b-button>
                <b-button type="danger" @click="batchDelete">{{ t('resourceCenter.batch.delete') }}</b-button>
              </div>
            </section>

            <div ref="resultScrollRef" class="result-scroll-area">
              <div
                v-if="shouldShowLoadingSkeleton"
                class="result-skeleton"
                :class="{ 'result-skeleton--list': effectiveView === 'list' }"
              >
                <div v-for="n in 24" :key="n" class="result-sk-card">
                  <div class="result-sk-top">
                    <div class="result-sk-dot"></div>
                    <div class="result-sk-line result-sk-line--short"></div>
                  </div>
                  <div class="result-sk-line result-sk-line--title"></div>
                  <div class="result-sk-line result-sk-line--desc"></div>
                  <div class="result-sk-line result-sk-line--desc result-sk-line--desc2"></div>
                  <div class="result-sk-meta">
                    <div class="result-sk-line result-sk-line--meta1"></div>
                    <div class="result-sk-line result-sk-line--meta2"></div>
                  </div>
                </div>
              </div>

              <div
                v-else-if="interleavedItems.length"
                class="result-grid"
                :class="{ 'result-grid--list': effectiveView === 'list' }"
              >
                <RightMenu
                  v-for="item in interleavedItems"
                  :key="`${item.type}-${item.id}`"
                  :menu="menuForSearchItem(item)"
                  @select="handleItemMenu($event, item)"
                >
                  <SearchResultItem
                    :item="item"
                    :type-label="getSearchTypeLabel(t, item.type)"
                    :keyword="queryState.keyword"
                    :selected="selectedIds.includes(getItemSelectionKey(item))"
                    :selectable="batchMode"
                    :view="effectiveView"
                    :compact="bookmark.isMobile"
                    @open="openItem(item)"
                    @toggle-select="toggleSelect(item)"
                  />
                </RightMenu>
              </div>

              <template v-else-if="visibleGroups.length">
                <section v-for="group in visibleGroups" :key="group.type" class="result-group">
                  <div class="group-header">
                    <span>{{ getSearchTypeLabel(t, group.type) }}</span>
                    <span>{{ t('resourceCenter.count', { count: summaryTotals[group.type] }) }}</span>
                  </div>
                  <div class="result-grid" :class="{ 'result-grid--list': effectiveView === 'list' }">
                    <RightMenu
                      :menu="menuForSearchItem(item)"
                      @select="handleItemMenu($event, item)"
                      v-for="item in group.items"
                      :key="`${item.type}-${item.id}`"
                    >
                      <SearchResultItem
                        :item="item"
                        :type-label="getSearchTypeLabel(t, item.type)"
                        :keyword="queryState.keyword"
                        :selected="selectedIds.includes(getItemSelectionKey(item))"
                        :selectable="batchMode"
                        :view="effectiveView"
                        :compact="bookmark.isMobile"
                        @open="openItem(item)"
                        @toggle-select="toggleSelect(item)"
                      />
                    </RightMenu>
                  </div>
                </section>
              </template>

              <div v-else-if="viewState.error" class="result-error-state" role="alert">
                <h3>{{ t('resourceCenter.loadErrorTitle') }}</h3>
                <p>{{ viewState.error.message || t('common.requestFailedDescription') }}</p>
                <p v-if="viewState.error.requestId" class="result-error-request-id">
                  {{ t('common.requestIdLabel') }}：{{ viewState.error.requestId }}
                </p>
                <BButton type="primary" @click="refreshData">{{ t('common.retry') }}</BButton>
              </div>

              <div v-else class="empty-state">
                <div class="empty-orbit"></div>
                <h3>{{ t('resourceCenter.emptyTitle') }}</h3>
                <p>{{ t('resourceCenter.emptyDesc') }}</p>
                <div class="empty-actions">
                  <BButton
                    class="empty-action-btn"
                    @click="router.push('/manage/editBookmark/add')"
                    v-click-log="{ module: '资源中心', operation: '空状态创建书签' }"
                  >
                    {{ t('resourceCenter.emptyActionBookmark') }}
                  </BButton>
                  <BButton
                    class="empty-action-btn"
                    @click="router.push('/noteLibrary/add')"
                    v-click-log="{ module: '资源中心', operation: '空状态创建笔记' }"
                  >
                    {{ t('resourceCenter.emptyActionNote') }}
                  </BButton>
                  <BButton
                    class="empty-action-btn"
                    @click="router.push('/cloudSpace')"
                    v-click-log="{ module: '资源中心', operation: '空状态上传文件' }"
                  >
                    {{ t('resourceCenter.emptyActionFile') }}
                  </BButton>
                  <BButton
                    class="empty-action-btn"
                    @click="router.push('/manage/tagMg')"
                    v-click-log="{ module: '资源中心', operation: '空状态进入标签管理' }"
                  >
                    {{ t('resourceCenter.emptyActionTag') }}
                  </BButton>
                </div>
              </div>
              <div
                v-show="allVisibleItems.length && (viewState.hasMore || viewState.loadingMore)"
                ref="resultLoadSentinel"
                class="result-load-sentinel"
              >
                <BLoading v-if="viewState.loadingMore" inline loading :title="t('common.loading')" />
                <BButton v-else size="small" @click="loadMoreResults">{{ t('common.loadMore') }}</BButton>
              </div>
            </div>
          </BCard>
        </section>
      </div>
    </ResourcePageShell>

    <BDrawer
      v-if="bookmark.isMobile"
      :open="mobileFilterVisible"
      :title="t('resourceCenter.mobileFiltersTitle')"
      placement="bottom"
      height="min(76dvh, 640px)"
      body-padding="14px 16px max(18px, env(safe-area-inset-bottom))"
      @close="mobileFilterVisible = false"
    >
      <div class="mobile-filter-drawer">
        <div class="mobile-filter-section">
          <span class="mobile-filter-label">{{ t('resourceCenter.typeFilter') }}</span>
          <div class="mobile-filter-types">
            <BButton
              v-for="type in SEARCH_CENTER_TYPE_LIST"
              :key="type"
              class="mobile-filter-type"
              :class="{ active: isTypeSelected(type) }"
              :aria-pressed="isTypeSelected(type)"
              @click="toggleTypeFilter(type)"
            >
              <span class="filter-dot" :class="`filter-dot--${type}`" aria-hidden="true"></span>
              <span>{{ getSearchTypeLabel(t, type) }}</span>
              <span class="filter-count">{{ summaryTotals[type] || 0 }}</span>
            </BButton>
          </div>
        </div>

        <div class="mobile-filter-field">
          <span class="mobile-filter-label">{{ t('resourceCenter.sort.label') }}</span>
          <BSelect
            class="mobile-filter-select"
            :options="sortOptions"
            v-model:value="queryState.sort"
            @change="applyQueryState('切换排序')"
          />
        </div>

        <div class="mobile-filter-field">
          <span class="mobile-filter-label">{{ t('resourceCenter.date.label') }}</span>
          <BSelect
            class="mobile-filter-select"
            :options="dateOptions"
            v-model:value="queryState.date"
            @change="applyQueryState('筛选时间范围')"
          />
        </div>

        <div class="mobile-filter-section">
          <span class="mobile-filter-label">{{ t('resourceCenter.resourceState') }}</span>
          <BButton
            class="tagless-btn mobile-filter-toggle"
            :class="{ active: queryState.untagged }"
            @click="toggleUntagged"
          >
            {{ t('resourceCenter.untagged') }}
          </BButton>
        </div>

        <div v-if="tagOptions.length" class="mobile-filter-section">
          <span class="mobile-filter-label">{{ t('resourceCenter.tagFilter') }}</span>
          <BInput
            v-model:value="tagSearch"
            :placeholder="t('resourceCenter.tagSearchPlaceholder')"
            clearable
          />
          <div class="mobile-filter-tags">
            <BButton
              v-for="tag in filteredTagOptions"
              :key="tag"
              class="tag-chip"
              :class="{ active: queryState.tags.includes(tag) }"
              @click="toggleTagFilter(tag)"
            >
              {{ tag }}
            </BButton>
          </div>
        </div>

        <div class="mobile-filter-footer">
          <BButton :disabled="!hasActiveAdvancedFilters" @click="clearAdvancedFilters">
            {{ t('resourceCenter.clearFilters') }}
          </BButton>
          <BButton type="primary" @click="mobileFilterVisible = false">{{ t('common.confirm') }}</BButton>
        </div>
      </div>
    </BDrawer>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import RightMenu from '@/components/base/RightMenu.vue';
  import icon from '@/config/icon.ts';
  import {
    batchDeleteSearchResources,
    clearGlobalSearchCache,
    fetchGlobalSearch,
    type SearchCursor,
    type SearchResultItem,
    type SearchType,
  } from '@/api/search.ts';
  import { bookmarkStore, inboxStore, useUserStore } from '@/store';
  import { updatePreference } from '@/utils/savePreference';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import SearchResultItemComp from '@/components/searchCenter/SearchResultItem.vue';
  import {
    buildTypeBuckets,
    collectTagOptions,
    mapDisplayItems,
    type DisplaySearchItem,
    type ResourceDate,
    type ResourceSort,
    type ResourceView,
  } from '@/components/searchCenter/searchUtils.ts';
  import { getSearchTypeLabel, SEARCH_CENTER_TYPE_LIST } from '@/components/searchCenter/searchMeta.ts';
  import { isResourceSearchType, type GlobalSearchType } from '@/utils/globalSearchTypes';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { useInboxEnqueue } from '@/composables/useInboxEnqueue';
  import ResourceCenterSectionNav from '@/components/searchCenter/ResourceCenterSectionNav.vue';
  import ResourceCenterTopBar from '@/components/searchCenter/ResourceCenterTopBar.vue';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import { openAiAssistant, type AiAssistantIntent } from '@/utils/aiEntry';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { SEARCH_PAGE_SIZE, mergeResourcePage } from '@/utils/resourcePagination';

  const SearchResultItem = SearchResultItemComp;
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const inbox = inboxStore();
  const { addResourcesToInbox } = useInboxEnqueue();
  const { t } = useI18n();

  const SEARCH_VIEW_STORAGE_KEY = 'resource-center-view-mode';
  const SEARCH_BATCH_STORAGE_KEY = 'resource-center-batch-items';
  const SEARCH_QUERY_KEYS = ['q', 'type', 'sort', 'view', 'tags', 'date', 'untagged'] as const;
  const SKELETON_DELAY_MS = 140;
  const syncTimer = ref<number | null>(null);
  const isRouteApplying = ref(false);
  const mobileFilterVisible = ref(false);
  const desktopTypeMenuOpen = ref(false);
  const batchMode = ref(false);
  const tagSearch = ref('');
  const showLoadingSkeleton = ref(false);
  let skeletonTimer: number | null = null;
  const resultScrollRef = ref<HTMLElement | null>(null);
  const resultLoadSentinel = ref<HTMLElement | null>(null);
  let resultLoadObserver: IntersectionObserver | null = null;
  let requestSeq = 0;
  const summaryTotals = ref<Record<GlobalSearchType, number>>({
    bookmark: 0,
    note: 0,
    file: 0,
    tag: 0,
    todo: 0,
  });

  const queryState = reactive<{
    keyword: string;
    type: GlobalSearchType | 'all';
    types: GlobalSearchType[];
    sort: ResourceSort;
    view: ResourceView;
    tags: string[];
    date: ResourceDate;
    untagged: boolean;
  }>({
    keyword: '',
    type: 'all',
    types: [],
    sort: (user.preferences.resourceSort as ResourceSort) || 'relevance',
    view:
      (user.preferences.resourceView as ResourceView) ||
      (localStorage.getItem(SEARCH_VIEW_STORAGE_KEY) as ResourceView) ||
      'card',
    tags: [],
    date: 'all',
    untagged: false,
  });

  const viewState = reactive<{
    loading: boolean;
    loadingMore: boolean;
    rawItems: SearchResultItem[];
    nextCursor: SearchCursor | null;
    hasMore: boolean;
    tagOptions: string[];
    error: { message: string; requestId: string } | null;
  }>({
    loading: false,
    loadingMore: false,
    rawItems: [],
    nextCursor: null,
    hasMore: false,
    tagOptions: [],
    error: null,
  });

  const selectedIds = ref<string[]>([]);

  // 移动端强制卡片视图:列表视图会把卡片撑得很宽导致横向滚动,且移动端列表/卡片无实质差异
  const effectiveView = computed<ResourceView>(() => (bookmark.isMobile ? 'card' : queryState.view));

  const sortOptions = computed(() => [
    { value: 'relevance', label: t('resourceCenter.sort.relevance') },
    { value: 'updated', label: t('resourceCenter.sort.updated') },
    { value: 'name', label: t('resourceCenter.sort.name') },
  ]);
  const dateOptions = computed(() => [
    { value: 'all', label: t('resourceCenter.date.all') },
    { value: '7d', label: t('resourceCenter.date.day7') },
    { value: '30d', label: t('resourceCenter.date.day30') },
    { value: '365d', label: t('resourceCenter.date.day365') },
  ]);

  const mappedItems = computed(() => mapDisplayItems(viewState.rawItems, queryState.keyword));
  // 当前没有可复用结果时立即展示骨架屏，避免请求完成前短暂落入“没有匹配内容”空状态。
  // 已经存在结果时仍保留延迟骨架，减少快速刷新造成的整块闪烁。
  const shouldShowLoadingSkeleton = computed(
    () => viewState.loading && (!viewState.rawItems.length || showLoadingSkeleton.value),
  );

  const typeBuckets = computed(() => buildTypeBuckets(mappedItems.value));

  const visibleGroups = computed(() => {
    if (queryState.keyword.trim() && selectedTypes.value.length > 1 && queryState.sort === 'relevance') return [];
    return selectedTypes.value
      .map((type) => ({
        type,
        items: typeBuckets.value[type],
      }))
      .filter((group) => group.items.length);
  });

  const interleavedItems = computed(() =>
    queryState.keyword.trim() && selectedTypes.value.length > 1 && queryState.sort === 'relevance'
      ? mappedItems.value
      : [],
  );
  const allVisibleItems = computed(() =>
    interleavedItems.value.length ? interleavedItems.value : visibleGroups.value.flatMap((group) => group.items),
  );
  // 资源中心数据域固定为书签、笔记、文件和标签。
  const selectableVisibleItems = computed(() =>
    allVisibleItems.value.filter((item) => isResourceSearchType(item.type)),
  );
  const allVisibleSelected = computed(
    () =>
      selectableVisibleItems.value.length > 0 &&
      selectableVisibleItems.value.every((item) => selectedIds.value.includes(getItemSelectionKey(item))),
  );
  const tagOptions = computed(() => {
    const options = viewState.tagOptions.length ? viewState.tagOptions : collectTagOptions(mappedItems.value);
    const selected = new Set(queryState.tags);
    // 从知识地图等入口携带标签筛选时，将已选项固定在折叠区最前面，确保过滤状态一眼可见。
    return [...queryState.tags, ...options.filter((tag) => !selected.has(tag))];
  });
  const filteredTagOptions = computed(() => {
    const keyword = tagSearch.value.trim().toLocaleLowerCase();
    return keyword ? tagOptions.value.filter((tag) => tag.toLocaleLowerCase().includes(keyword)) : tagOptions.value;
  });
  const selectedTypes = computed<GlobalSearchType[]>(() =>
    queryState.types.length ? queryState.types : [...SEARCH_CENTER_TYPE_LIST],
  );
  const hasActiveAdvancedFilters = computed(
    () =>
      queryState.tags.length > 0 ||
      queryState.date !== 'all' ||
      queryState.untagged ||
      queryState.types.length > 0 ||
      queryState.sort !== ((user.preferences.resourceSort as ResourceSort) || 'relevance'),
  );
  const mobileActiveFilterCount = computed(
    () =>
      queryState.tags.length +
      Number(queryState.date !== 'all') +
      Number(queryState.untagged) +
      // 类型 Tab 已收进抽屉，类型条件计入「筛选 N」角标
      Number(queryState.types.length > 0) +
      Number(queryState.sort !== ((user.preferences.resourceSort as ResourceSort) || 'relevance')),
  );

  // PC 端标签保持单行，完整列表通过「更多」浮层查看。
  const showAllTags = ref(false);

  const typeFilters = computed(() => [
    {
      value: 'all' as const,
      label: t('resourceCenter.types.allResults'),
      count: SEARCH_CENTER_TYPE_LIST.reduce(
        (sum, type) => sum + Number(summaryTotals.value[type] || 0),
        0,
      ),
    },
    ...SEARCH_CENTER_TYPE_LIST.map((type) => ({
      value: type,
      label: getSearchTypeLabel(t, type),
      count: summaryTotals.value[type],
    })),
  ]);

  const filteredResultTotal = computed(() =>
    selectedTypes.value.reduce((sum, type) => sum + Number(summaryTotals.value[type] || 0), 0),
  );
  const desktopTypeSummary = computed(() => {
    if (!queryState.types.length) return typeFilters.value[0];
    if (queryState.types.length === 1) {
      return typeFilters.value.find((item) => item.value === queryState.types[0]) || typeFilters.value[0];
    }
    return {
      value: 'all' as const,
      label: t('resourceCenter.types.selectedCount', { count: queryState.types.length }),
      count: filteredResultTotal.value,
    };
  });
  // 类型 Tab 移入抽屉后，这里承担「结果总数 + 各类型数量」的概览职责
  const mobileResultSubtitle = computed(() => {
    const total = t('resourceCenter.totalCount', { count: filteredResultTotal.value });
    const breakdown = selectedTypes.value
      .filter((type) => Number(summaryTotals.value[type] || 0) > 0)
      .map((type) => `${getSearchTypeLabel(t, type)} ${summaryTotals.value[type]}`)
      .join(' · ');
    return breakdown ? `${total} · ${breakdown}` : total;
  });
  function menuForSearchItem(item: DisplaySearchItem) {
    const deleteItem = {
      key: 'delete',
      label: t('common.delete'),
      icon: icon.table_delete,
      danger: true,
    };
    if (item.type === 'tag') return [deleteItem];
    return [
      { key: 'addInbox', label: t('inbox.addExisting'), icon: icon.contextMenu.inbox },
      { key: 'resource-actions-divider', divider: true },
      deleteItem,
    ];
  }

  function isTypeFilterActive(type: GlobalSearchType | 'all') {
    return type === 'all' ? queryState.types.length === 0 : queryState.types.includes(type);
  }

  // 抽屉里的类型是多选：空数组表示全选（与 URL 协议一致），
  // 取消最后一个会让结果永远为空，因此忽略这次点击而不是清空。
  function isTypeSelected(type: GlobalSearchType) {
    return queryState.types.length === 0 || queryState.types.includes(type);
  }

  function toggleTypeFilter(type: GlobalSearchType) {
    const selected = new Set(queryState.types.length ? queryState.types : SEARCH_CENTER_TYPE_LIST);
    if (selected.has(type)) selected.delete(type);
    else selected.add(type);
    const next = SEARCH_CENTER_TYPE_LIST.filter((item) => selected.has(item));
    if (!next.length) return;
    queryState.types = next.length === SEARCH_CENTER_TYPE_LIST.length ? [] : next;
    applyQueryState('筛选资源类型');
  }

  function parseTypes(value: unknown): GlobalSearchType[] {
    const raw = Array.isArray(value) ? String(value[0] || '') : String(value || '');
    const types = [...new Set(raw.split(',').map((item) => item.trim()))].filter((item) =>
      SEARCH_CENTER_TYPE_LIST.includes(item as GlobalSearchType),
    ) as GlobalSearchType[];
    return types.length === SEARCH_CENTER_TYPE_LIST.length ? [] : SEARCH_CENTER_TYPE_LIST.filter((type) => types.includes(type));
  }

  function parseSort(value: unknown): ResourceSort {
    // URL 未带 sort 时回退到用户偏好的默认排序(设置页「资源中心排序」),而非写死相关度
    const fallback = (user.preferences.resourceSort as ResourceSort) || 'relevance';
    const raw = String(value || fallback);
    return ['relevance', 'updated', 'name'].includes(raw) ? (raw as ResourceSort) : fallback;
  }

  function parseView(value: unknown): ResourceView {
    // URL 未带 view 时回退到用户偏好(设置页「资源中心视图」),再回退独立缓存,最后卡片——与 parseSort 对齐。
    // 此前漏了 user.preferences.resourceView:route 同步(line ~490 用 parseView 覆盖 queryState.view)时读不到设置值,
    // 刷新便退回陈旧的独立缓存 SEARCH_VIEW_STORAGE_KEY,表现为「设置改列表、刷新资源中心仍是卡片」。
    const fallback =
      (user.preferences.resourceView as ResourceView) ||
      (localStorage.getItem(SEARCH_VIEW_STORAGE_KEY) as ResourceView) ||
      'card';
    const raw = String(value || fallback);
    return raw === 'list' ? 'list' : 'card';
  }

  function parseDate(value: unknown): ResourceDate {
    const raw = String(value || 'all');
    return ['all', '7d', '30d', '365d'].includes(raw) ? (raw as ResourceDate) : 'all';
  }

  function parseTags(value: unknown): string[] {
    const raw = Array.isArray(value) ? String(value[0] || '') : String(value || '');
    if (!raw) return [];
    return raw
      .split(',')
      .map((tag) => {
        try {
          return decodeURIComponent(tag).trim();
        } catch (error) {
          return tag.trim();
        }
      })
      .filter(Boolean)
      .slice(0, 24);
  }

  function normalizeItemType(input: unknown): SearchType | null {
    const raw = String(input || '').trim();
    if (SEARCH_CENTER_TYPE_LIST.includes(raw as GlobalSearchType)) return raw as GlobalSearchType;
    return null;
  }

  function normalizeSearchItem(rawItem: any): SearchResultItem | null {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const type = normalizeItemType(rawItem.type || rawItem.resourceType || rawItem.itemType);
    const id = String(rawItem.id || rawItem.resourceId || '').trim();
    if (!type || !id) return null;
    return {
      id,
      type,
      title: String(rawItem.title || rawItem.name || rawItem.fileName || rawItem.label || '').trim(),
      description: String(rawItem.description || rawItem.desc || '').trim(),
      extra: rawItem.extra ? String(rawItem.extra) : '',
      category: rawItem.category,
      url: rawItem.url,
      route: rawItem.route,
      iconUrl: rawItem.iconUrl,
      tags: Array.isArray(rawItem.tags) ? rawItem.tags : [],
      matchReason: rawItem.matchReason ? String(rawItem.matchReason) : undefined,
      snippet: rawItem.snippet ? String(rawItem.snippet) : undefined,
      raw: rawItem.raw || rawItem,
    };
  }

  function getItemSelectionKey(item: { id: string; type: SearchType }) {
    return `${item.type}:${item.id}`;
  }

  function applyRouteState() {
    isRouteApplying.value = true;
    try {
      queryState.keyword = Array.isArray(route.query.q) ? String(route.query.q[0] || '') : String(route.query.q || '');
      queryState.types = parseTypes(route.query.type);
      queryState.type = queryState.types.length === 1 ? queryState.types[0] : 'all';
      queryState.sort = parseSort(Array.isArray(route.query.sort) ? route.query.sort[0] : route.query.sort);
      queryState.view = parseView(Array.isArray(route.query.view) ? route.query.view[0] : route.query.view);
      queryState.tags = parseTags(route.query.tags);
      queryState.date = parseDate(Array.isArray(route.query.date) ? route.query.date[0] : route.query.date);
      const untaggedRaw = Array.isArray(route.query.untagged) ? route.query.untagged[0] : route.query.untagged;
      queryState.untagged = String(untaggedRaw || '0') === '1';
    } finally {
      isRouteApplying.value = false;
    }
  }

  function buildQueryPayload() {
    const q = queryState.keyword.trim();
    return {
      ...(q ? { q } : {}),
      ...(queryState.types.length ? { type: queryState.types.join(',') } : {}),
      ...(queryState.sort !== 'relevance' ? { sort: queryState.sort } : {}),
      ...(queryState.view !== 'card' ? { view: queryState.view } : {}),
      ...(queryState.tags.length ? { tags: queryState.tags.map((tag) => encodeURIComponent(tag)).join(',') } : {}),
      ...(queryState.date !== 'all' ? { date: queryState.date } : {}),
      ...(queryState.untagged ? { untagged: '1' } : {}),
    };
  }

  function normalizeQueryValue(value: unknown): string {
    if (Array.isArray(value)) return String(value[0] || '');
    if (value === undefined || value === null) return '';
    return String(value);
  }

  function readCurrentSearchQuery() {
    const current: Record<string, string> = {};
    SEARCH_QUERY_KEYS.forEach((key) => {
      const value = normalizeQueryValue(route.query[key]);
      if (value) current[key] = value;
    });
    return current;
  }

  function isSameSearchQuery(nextQuery: Record<string, string>) {
    const current = readCurrentSearchQuery();
    const nextKeys = Object.keys(nextQuery).sort();
    const currentKeys = Object.keys(current).sort();
    if (nextKeys.length !== currentKeys.length) return false;
    return nextKeys.every((key, index) => key === currentKeys[index] && nextQuery[key] === current[key]);
  }

  function normalizeSearchResultItems(res: { items?: unknown[]; groups?: unknown[] }) {
    const directItems = Array.isArray(res.items) ? res.items : [];
    const groupItems = Array.isArray(res.groups) ? res.groups.flatMap((group: any) => group?.items || []) : [];
    const rawMergedItems = (directItems.length ? directItems : groupItems).map((item) => normalizeSearchItem(item));
    return (rawMergedItems.filter(Boolean) as SearchResultItem[]).filter((item) =>
      SEARCH_CENTER_TYPE_LIST.includes(item.type),
    );
  }

  async function loadData(force = false, skeletonDelayMs = SKELETON_DELAY_MS, append = false) {
    if (append && (viewState.loading || viewState.loadingMore || !viewState.hasMore)) return false;
    const seq = append ? requestSeq : ++requestSeq;
    let loadSucceeded = false;
    if (append) {
      viewState.loadingMore = true;
    } else {
      viewState.loading = true;
      viewState.loadingMore = false;
      viewState.error = null;
      viewState.nextCursor = null;
      viewState.hasMore = false;
      showLoadingSkeleton.value = false;
      if (skeletonTimer !== null) window.clearTimeout(skeletonTimer);
      skeletonTimer = window.setTimeout(() => {
        if (seq === requestSeq && viewState.loading) showLoadingSkeleton.value = true;
      }, skeletonDelayMs);
    }
    try {
      const res = await fetchGlobalSearch(queryState.keyword, SEARCH_PAGE_SIZE, force, {
        type: queryState.types.length === 1 ? queryState.types[0] : 'all',
        types: selectedTypes.value,
        sort: queryState.sort,
        date: queryState.date,
        tags: queryState.tags,
        untagged: queryState.untagged,
        paginationMode: 'ordered',
        cursor: append ? viewState.nextCursor : null,
        includeMetadata: !append,
      });
      if (seq !== requestSeq) return false;
      const normalizedItems = normalizeSearchResultItems(res);
      viewState.rawItems = append
        ? mergeResourcePage(viewState.rawItems, normalizedItems, (item) => getItemSelectionKey(item))
        : normalizedItems;
      viewState.nextCursor = res.nextCursor || null;
      viewState.hasMore = Boolean(res.hasMore);
      if (Array.isArray(res.tagOptions)) viewState.tagOptions = res.tagOptions;
      if (res.typeTotals) {
        summaryTotals.value = {
          bookmark: Number(res.typeTotals.bookmark || 0),
          note: Number(res.typeTotals.note || 0),
          file: Number(res.typeTotals.file || 0),
          tag: Number(res.typeTotals.tag || 0),
          todo: 0,
        };
      }
      const validSelection = new Set(viewState.rawItems.map((item) => getItemSelectionKey(item)));
      selectedIds.value = selectedIds.value.filter((id) => validSelection.has(id));
      loadSucceeded = true;
      return true;
    } catch (error) {
      const requestError = error as Error & { requestId?: string };
      if (!append) viewState.rawItems = [];
      viewState.error = {
        message: requestError.message || t('common.requestFailedDescription'),
        requestId: String(requestError.requestId || ''),
      };
      if (!append) message.error(t('resourceCenter.refreshFailed'));
      return false;
    } finally {
      if (seq === requestSeq) {
        if (skeletonTimer !== null) window.clearTimeout(skeletonTimer);
        skeletonTimer = null;
        showLoadingSkeleton.value = false;
        viewState.loading = false;
        viewState.loadingMore = false;
        if (loadSucceeded) void setupResultLoadObserver();
      }
    }
  }

  function loadMoreResults() {
    return loadData(false, 0, true);
  }

  async function setupResultLoadObserver() {
    resultLoadObserver?.disconnect();
    await nextTick();
    const sentinel = resultLoadSentinel.value;
    const root = bookmark.isMobile ? resultScrollRef.value : sentinel?.closest<HTMLElement>('.search-page') || null;
    if (!sentinel || !root) return;
    resultLoadObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMoreResults();
      },
      { root, rootMargin: '0px 0px 420px', threshold: 0 },
    );
    resultLoadObserver.observe(sentinel);
  }

  function syncQueryNow() {
    const query = buildQueryPayload();
    if (isSameSearchQuery(query)) {
      viewState.loading = false;
      return;
    }
    viewState.loading = true;
    router.replace({ path: '/search', query });
  }

  function syncQueryDebounced() {
    if (syncTimer.value) clearTimeout(syncTimer.value);
    viewState.loading = true;
    syncTimer.value = window.setTimeout(syncQueryNow, 250);
  }

  function applyQueryState(operation: string) {
    recordOperation({ module: '资源中心', operation });
    syncQueryNow();
  }

  function submitSearch() {
    const q = queryState.keyword.trim();
    if (q) {
      recordOperation({ module: '资源中心', operation: `搜索资源【${q}】` });
    }
    syncQueryNow();
  }

  function setActiveType(type: GlobalSearchType | 'all') {
    if (type === 'all') {
      queryState.types = [];
    } else if (!queryState.types.length) {
      queryState.types = [type];
    } else if (queryState.types.includes(type)) {
      const next = queryState.types.filter((item) => item !== type);
      queryState.types = next.length ? next : [];
    } else {
      queryState.types = SEARCH_CENTER_TYPE_LIST.filter((item) => [...queryState.types, type].includes(item));
      if (queryState.types.length === SEARCH_CENTER_TYPE_LIST.length) queryState.types = [];
    }
    queryState.type = queryState.types.length === 1 ? queryState.types[0] : 'all';
    selectedIds.value = [];
    applyQueryState(`筛选搜索类型【${getSearchTypeLabel(t, type)}】`);
  }

  function selectDesktopType(type: GlobalSearchType | 'all') {
    setActiveType(type);
    desktopTypeMenuOpen.value = false;
  }

  function setView(view: ResourceView) {
    if (queryState.view === view) return;
    queryState.view = view;
    localStorage.setItem(SEARCH_VIEW_STORAGE_KEY, view);
    updatePreference({ resourceView: view }).catch(() => {}); // 记忆到偏好:跨设备 + 设置页可改
    applyQueryState('切换视图');
  }

  function clearKeyword() {
    queryState.keyword = '';
    selectedIds.value = [];
    applyQueryState('清空搜索关键词');
  }

  function toggleUntagged() {
    queryState.untagged = !queryState.untagged;
    selectedIds.value = [];
    applyQueryState('筛选无标签资源');
  }

  function toggleTagFilter(tag: string) {
    if (queryState.tags.includes(tag)) {
      queryState.tags = queryState.tags.filter((item) => item !== tag);
    } else {
      queryState.tags = [...queryState.tags, tag];
    }
    selectedIds.value = [];
    applyQueryState('应用筛选');
  }

  function clearAdvancedFilters() {
    queryState.tags = [];
    queryState.date = 'all';
    queryState.untagged = false;
    queryState.types = [];
    queryState.sort = (user.preferences.resourceSort as ResourceSort) || 'relevance';
    selectedIds.value = [];
    applyQueryState('清空筛选');
  }

  async function refreshData() {
    selectedIds.value = [];
    clearGlobalSearchCache();
    viewState.loading = true;
    try {
      await nextTick();
      await loadData(true);
    } catch (error) {
      message.error(t('resourceCenter.refreshFailed'));
    }
  }

  function openItem(item: DisplaySearchItem) {
    if (item.type === 'bookmark' && item.url) {
      openBookmarkUrl(item.url);
      return;
    }
    // 文件先于 route 判断：云空间需要带上 fileName 搜索过滤
    if (item.type === 'file') {
      router.push({ path: '/cloudSpace', query: { fileName: item.title } });
      return;
    }
    if (item.route) {
      router.push(item.route);
      return;
    }
  }

  function toggleSelect(item: DisplaySearchItem) {
    if (!batchMode.value) return;
    const key = getItemSelectionKey(item);
    if (selectedIds.value.includes(key)) {
      selectedIds.value = selectedIds.value.filter((entry) => entry !== key);
    } else {
      selectedIds.value = [...selectedIds.value, key];
    }
  }

  function toggleBatchMode() {
    batchMode.value = !batchMode.value;
    if (!batchMode.value) selectedIds.value = [];
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected.value) {
      selectedIds.value = selectedIds.value.filter(
        (id) => !selectableVisibleItems.value.some((item) => getItemSelectionKey(item) === id),
      );
      return;
    }
    const merged = new Set(selectedIds.value);
    selectableVisibleItems.value.forEach((item) => merged.add(getItemSelectionKey(item)));
    selectedIds.value = Array.from(merged);
  }

  function openSearchAi(intent: AiAssistantIntent) {
    const selected = mappedItems.value.filter((item) => selectedIds.value.includes(getItemSelectionKey(item)));
    if (selected.length > 5) message.info(t('ai.materialLimit', { count: 5 }));
    openAiAssistant({
      surface: 'search',
      suggestedIntent: intent,
      query: queryState.keyword.trim() || undefined,
      contextRefs: selected.slice(0, 5).map((item) => ({ type: item.type, id: String(item.id), title: item.title })),
    });
  }

  function getSelectedItemsByTypes(types: SearchType[]) {
    return allVisibleItems.value
      .filter((item) => selectedIds.value.includes(getItemSelectionKey(item)))
      .filter((item) => types.includes(item.type))
      .map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
      }));
  }

  function openBatchTagWorkspace(mode: 'add' | 'remove') {
    const selectedItems = getSelectedItemsByTypes(['bookmark', 'note', 'file']);
    const selectedTagCount = selectedIds.value.filter((id) => id.startsWith('tag:')).length;
    if (!selectedItems.length) {
      message.warning(t('resourceCenter.batch.onlyResourceSupported'));
      return;
    }
    if (selectedTagCount > 0) {
      message.info(t('resourceCenter.batch.tagIgnoredForTagOps', { count: selectedTagCount }));
    }
    sessionStorage.setItem(SEARCH_BATCH_STORAGE_KEY, JSON.stringify(selectedItems));
    router.push({
      path: '/search/batch-tags',
      query: { mode, from: route.fullPath },
    });
  }

  function batchAddTag() {
    if (!selectedIds.value.length) {
      message.warning(t('resourceCenter.batch.noSelection'));
      return;
    }
    recordOperation({ module: '资源中心', operation: '进入批量加标签工作页' });
    openBatchTagWorkspace('add');
  }

  function batchRemoveTag() {
    if (!selectedIds.value.length) {
      message.warning(t('resourceCenter.batch.noSelection'));
      return;
    }
    recordOperation({ module: '资源中心', operation: '进入批量移除标签工作页' });
    openBatchTagWorkspace('remove');
  }

  function getSingleDeleteApi(type: SearchType) {
    if (type === 'bookmark') return '/api/bookmark/delBookmark';
    if (type === 'note') return '/api/note/delNote';
    if (type === 'file') return '/api/file/deleteFileById';
    return '/api/bookmark/delTag';
  }

  function handleItemMenu(action: string, item: DisplaySearchItem) {
    if (action === 'addInbox' && item.type !== 'tag') {
      addItemsToInbox([item]);
      return;
    }
    if (action !== 'delete') return;
    const typeLabel = getSearchTypeLabel(t, item.type);
    const name = item.title || '-';
    Alert.alert({
      title: t('resourceCenter.batch.deleteConfirmTitle'),
      content:
        item.type === 'tag'
          ? t('resourceCenter.deleteConfirmUnbind', { type: typeLabel, name })
          : t('resourceCenter.deleteConfirmTrash', { type: typeLabel, name }),
      okText: t('resourceCenter.batch.deleteConfirmOk'),
      cancelText: t('resourceCenter.batch.deleteConfirmCancel'),
      async onOk() {
        try {
          const api = getSingleDeleteApi(item.type);
          const res = await apiBasePost(api, { id: item.id });
          if (Number(res?.status) !== 200) {
            message.error(res?.msg || t('resourceCenter.batch.deleteFailed'));
            return;
          }
          recordOperation({ module: '资源中心', operation: `右键删除${typeLabel}成功【${name}】` });
          message.success(t('resourceCenter.batch.deleteSuccess', { count: 1 }));
          selectedIds.value = selectedIds.value.filter((id) => id !== getItemSelectionKey(item));
          clearGlobalSearchCache();
          await refreshData();
        } catch (error) {
          message.error(t('resourceCenter.batch.deleteFailed'));
        }
      },
    });
  }

  async function addItemsToInbox(items: DisplaySearchItem[]) {
    const resources = items
      .filter((item) => item.type !== 'tag')
      .map((item) => ({ resourceType: item.type as 'bookmark' | 'note' | 'file', resourceId: String(item.id) }));
    await addResourcesToInbox(resources, '资源中心');
  }

  async function batchAddToInbox() {
    const items = allVisibleItems.value.filter((item) => selectedIds.value.includes(getItemSelectionKey(item)));
    await addItemsToInbox(items);
  }

  async function batchDelete() {
    if (!selectedIds.value.length) {
      message.warning(t('resourceCenter.batch.noSelection'));
      return;
    }
    const selectedItems = getSelectedItemsByTypes(['bookmark', 'note', 'file', 'tag']);
    if (!selectedItems.length) {
      message.warning(t('resourceCenter.batch.noSelection'));
      return;
    }
    Alert.alert({
      title: t('resourceCenter.batch.deleteConfirmTitle'),
      content: t('resourceCenter.batch.deleteConfirmContent', { count: selectedItems.length }),
      okText: t('resourceCenter.batch.deleteConfirmOk'),
      cancelText: t('resourceCenter.batch.deleteConfirmCancel'),
      async onOk() {
        try {
          const res = await batchDeleteSearchResources(selectedItems.map((item) => ({ id: item.id, type: item.type })));
          if (Number(res?.status) !== 200) {
            message.error(res?.msg || t('resourceCenter.batch.deleteFailed'));
            return;
          }
          const affected = Number(res?.data?.affectedItemCount || 0);
          recordOperation({
            module: '资源中心',
            operation: `批量删除资源成功【选中${selectedItems.length}条，删除${affected}条】`,
          });
          message.success(t('resourceCenter.batch.deleteSuccess', { count: affected }));
          selectedIds.value = [];
          clearGlobalSearchCache();
          await refreshData();
        } catch (error) {
          message.error(t('resourceCenter.batch.deleteFailed'));
        }
      },
    });
  }

  let isInitialRouteLoad = true;
  watch(
    () => route.query,
    () => {
      applyRouteState();
      nextTick(() => {
        const scrollRoot = bookmark.isMobile
          ? resultScrollRef.value
          : document.querySelector<HTMLElement>('.search-center-route .search-page');
        scrollRoot?.scrollTo({ top: 0 });
      });
      // 模块级搜索缓存用于同页筛选/视图切换，不能跨页面进入继续充当资源事实源。
      // 每次 SearchCenter 重新挂载时强制请求一次，确保新增、编辑或删除后的资源立即可见。
      const force = isInitialRouteLoad;
      isInitialRouteLoad = false;
      void loadData(force);
    },
    { immediate: true },
  );

  watch(
    () => queryState.view,
    (val) => {
      localStorage.setItem(SEARCH_VIEW_STORAGE_KEY, val);
    },
  );

  watch(
    () => bookmark.isMobile,
    () => {
      void setupResultLoadObserver();
    },
  );

  function focusSearchInput() {
    nextTick(() => {
      const host = document.getElementById('search-center-input');
      const input = host && (host.tagName === 'INPUT' ? host : host.querySelector('input'));
      (input as HTMLInputElement | null)?.focus();
    });
  }

  function onMobileSearchKeyword(value: string | number | undefined) {
    queryState.keyword = String(value ?? '');
    syncQueryDebounced();
  }

  // 本页自带顶栏，通知共享顶栏整体让位，避免同屏出现两个搜索入口
  useMobileTopBar(['searchCenter'], { ownTopBar: true });

  // 完整搜索页是二级页面：返回发起搜索的来源页，没有历史时回落资料首页
  function leaveSearchPage() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    void router.push('/home');
  }


  // 打开资源中心自动聚焦搜索框(移动端不主动聚焦,避免一进页面就弹出软键盘)。
  onMounted(() => {
    void setupResultLoadObserver();
    // 移动端类型 Tab 已移入筛选抽屉，不再需要横向滚动定位；也不主动聚焦，避免一进页面就弹软键盘
    if (!bookmark.isMobile) focusSearchInput();
  });

  onBeforeUnmount(() => {
    if (syncTimer.value) clearTimeout(syncTimer.value);
    if (skeletonTimer !== null) window.clearTimeout(skeletonTimer);
    requestSeq += 1;
    resultLoadObserver?.disconnect();
  });
</script>

<style scoped lang="less">
  .search-center-route {
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
  }

  /* 完整搜索页专用顶栏：占位与共享 MobileTopBar 一致（56px），
     其下的 ResourcePageShell 需要相应让出高度。 */




  .search-page {
    --search-hero-bg: var(--surface-raised-background);
    --search-panel-bg: var(--workspace-panel-bg-color);
    --search-card-bg: var(--card-background);
    --search-border-color: var(--surface-border-color);
    --search-muted-bg: color-mix(in srgb, var(--surface-panel-bg) 88%, var(--card-background));

    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    padding: 0;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .section-switcher {
    margin-bottom: 12px;
  }

  .search-page--night {
    --search-hero-bg: var(--surface-raised-background);
    --search-panel-bg: var(--workspace-panel-bg-color);
    --search-card-bg: var(--card-background);
    --search-border-color: var(--surface-border-color);
    --search-muted-bg: color-mix(in srgb, var(--surface-panel-bg) 88%, var(--card-background));
  }

  .search-header {
    --b-card-background: var(--search-hero-bg);
    --b-card-border-color: var(--search-border-color);
    --b-card-shadow: var(--surface-raised-shadow);

    position: relative;
    overflow: hidden;
    border-radius: 18px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background:
      radial-gradient(
        circle at 97% -10%,
        color-mix(in srgb, var(--resource-bookmark-color) 7%, transparent),
        transparent 42%
      ),
      var(--search-hero-bg);
    border-color: var(--search-border-color);
    box-shadow: var(--surface-raised-shadow);
  }

  .search-header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .search-header-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .search-header-sub {
    color: var(--desc-color);
    font-size: 13px;
  }

  .eyebrow {
    color: var(--resource-bookmark-color);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: 20px;
    line-height: 1.2;
    font-weight: 800;
  }

  p {
    margin: 0;
    color: var(--desc-color);
    line-height: 1.7;
  }

  :deep(.b-input) {
    border-radius: 18px;
  }

  .refresh-btn,
  .clear-btn,
  .filter-item,
  .tag-chip,
  .batch-btn,
  .tagless-btn,
  .view-btn,
  .empty-action-btn {
    border: 0;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }

  .refresh-btn {
    height: 46px;
    border-radius: 16px;
    color: #fff;
    background: linear-gradient(
      135deg,
      var(--resource-bookmark-color),
      color-mix(in srgb, var(--resource-bookmark-color) 70%, #ffffff)
    );
    font-weight: 700;
  }

  .refresh-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    transform-origin: center;
  }

  .refresh-icon--spinning {
    animation: search-refresh-spin 0.7s linear infinite;
  }

  @keyframes search-refresh-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .graph-entry {
    flex-shrink: 0;
    border: 0;
    cursor: pointer;
    color: #fff;
    background: #615ced;
    font-size: 13px;
    padding: 8px 14px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }

  .search-header-input {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 110px;
    gap: 10px;
    align-items: center;
  }

  .result-subtitle,
  .filter-count {
    color: var(--desc-color);
  }

  .search-layout {
    margin-top: 20px;
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }

  .result-panel {
    --b-card-border-color: var(--search-border-color);

    border-radius: 20px;
  }

  .filter-item {
    width: 100%;
    display: grid;
    grid-template-columns: 10px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border-radius: 12px;
    background: transparent;
    text-align: left;
  }

  .filter-item.active,
  .filter-item:hover {
    background: var(--search-muted-bg);
  }

  .desktop-type-trigger {
    width: 168px;
    min-width: 0;
    height: 34px;
    padding: 0 10px;
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--search-border-color);
    border-radius: 10px;
    background: var(--search-muted-bg);
    text-align: left;
  }

  .desktop-type-trigger__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 650;
  }

  .desktop-type-trigger__arrow {
    color: var(--desc-color);
    font-size: 11px;
  }

  .desktop-type-menu {
    width: 210px;
    padding: 6px;
    display: grid;
    gap: 2px;
  }

  .desktop-type-menu .filter-item {
    min-height: 36px;
    padding: 7px 9px;
  }

  .filter-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #94a3b8;
  }

  .filter-dot--bookmark {
    background: var(--resource-bookmark-color);
  }

  .filter-dot--note {
    background: var(--resource-note-color);
  }

  .filter-dot--file {
    background: var(--resource-file-color);
  }

  .filter-dot--tag {
    background: var(--resource-tag-color);
  }

  .filter-dot--todo {
    background: var(--primary-color);
  }

  .result-panel {
    --b-card-background: var(--search-card-bg);
    --b-card-shadow: var(--surface-card-shadow);

    min-height: 420px;
  }

  .result-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--search-border-color);
  }

  .result-title {
    font-size: 20px;
    font-weight: 800;
  }

  .toolbar-actions {
    display: flex;
    gap: 8px;
  }

  .clear-btn {
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--search-muted-bg);
  }

  .clear-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .advanced-filters {
    margin-top: 12px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid var(--search-border-color);
    background: var(--search-panel-bg);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .filter-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }

  .refresh-btn--inline {
    height: 48px;
    border-radius: 12px;
    font-weight: 700;
  }

  .select-wrap {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
    color: var(--desc-color);
  }

  .select-wrap select {
    height: 32px;
    border-radius: 10px;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    color: var(--text-color);
    padding: 0 10px;
    min-width: 120px;
  }

  .filter-select {
    min-width: 140px;
  }

  .view-switch {
    display: inline-flex;
    border: 1px solid var(--search-border-color);
    border-radius: 10px;
    overflow: hidden;
  }

  .view-btn {
    padding: 6px 12px;
    background: transparent;
  }

  .view-btn.active {
    background: var(--primary-color);
    color: #fff;
  }

  .tagless-btn {
    padding: 6px 12px;
    border-radius: 10px;
    background: var(--search-muted-bg);
  }

  .tagless-btn.active {
    background: color-mix(in srgb, var(--resource-file-color) 16%, transparent);
    color: var(--resource-file-color);
  }

  .tag-filter-wrap {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .tag-filter-label {
    color: var(--desc-color);
    font-size: 13px;
    line-height: 30px;
  }

  .tag-filter-main {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .tag-filter-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-right: 2px;
  }

  .tag-toggle-btn {
    align-self: flex-start;
    border: 0;
    cursor: pointer;
    background: transparent;
    color: var(--resource-bookmark-color);
    font-size: 12px;
    font-weight: 600;
    padding: 2px 0;
  }

  .tag-filter-popover {
    width: min(560px, calc(100vw - 32px));
    max-height: min(320px, calc(100dvh - 32px));
    padding: 12px;
    box-sizing: border-box;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    overflow-y: auto;
  }

  .tag-filter-popover :deep(.input-container) {
    flex: 0 0 100%;
    width: 100%;
    margin-bottom: 4px;
  }

  .tag-chip {
    min-height: 28px;
    border: 1px solid color-mix(in srgb, var(--search-border-color) 74%, transparent);
    border-radius: 999px;
    padding: 4px 10px;
    background: var(--search-muted-bg);
    color: color-mix(in srgb, var(--text-color) 72%, var(--desc-color));
    font-size: 12px;
  }

  .tag-chip.active {
    border-color: color-mix(in srgb, var(--resource-tag-color) 32%, var(--search-border-color));
    background: color-mix(in srgb, var(--resource-tag-color) 12%, var(--search-muted-bg));
    color: var(--resource-tag-color);
  }

  .batch-toolbar {
    margin-top: 12px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .batch-left,
  .batch-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--desc-color);
    font-size: 13px;
  }

  .batch-btn {
    min-height: 30px;
    border-radius: 10px;
    padding: 0 10px;
    background: var(--search-muted-bg);
  }

  .result-scroll-area {
    margin-top: 12px;
    box-sizing: border-box;
    border-radius: 14px;
  }

  .result-load-sentinel {
    min-height: 32px;
    padding: 10px 0 2px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
  }

  .result-group {
    margin-top: 16px;
  }

  .group-header {
    display: flex;
    justify-content: space-between;
    color: var(--desc-color);
    font-weight: 700;
    font-size: 13px;
    margin-bottom: 10px;
  }

  .result-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
  }

  .result-grid--list {
    /* minmax(0,1fr):裸 1fr 的最小值是 min-content,会被超长描述撑破 → 横向溢出、标签/时间被推出视口;
       minmax(0,1fr) 让单列最小可收缩到 0,列表行内 row-desc 的 flex-shrink 才生效,行宽收敛到容器内 */
    grid-template-columns: minmax(0, 1fr);
  }

  .result-skeleton {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .result-skeleton--list {
    grid-template-columns: 1fr;
  }

  .result-sk-card {
    min-height: 168px;
    border-radius: 16px;
    border: 1px solid var(--search-border-color);
    background: var(--search-card-bg);
    box-shadow: var(--surface-card-shadow);
    padding: 14px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* 列表骨架:紧凑横向行,与重构后的列表行一致(避免加载完从大卡跳变) */
  .result-skeleton--list .result-sk-card {
    min-height: 0;
    flex-direction: row;
    align-items: center;
    padding: 10px 14px;
    gap: 12px;
  }
  .result-skeleton--list .result-sk-top {
    margin-bottom: 0;
  }
  .result-skeleton--list .result-sk-line--title {
    width: 160px;
  }
  .result-skeleton--list .result-sk-line--desc {
    flex: 1;
    width: auto;
  }
  .result-skeleton--list .result-sk-line--desc2,
  .result-skeleton--list .result-sk-meta {
    display: none;
  }

  .result-sk-top {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    margin-bottom: 4px;
  }

  .result-sk-dot {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 76%, var(--background-color));
    animation: sk-breathe 1.55s ease-in-out infinite alternate;
  }

  .result-sk-line {
    height: 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 76%, var(--background-color));
    animation: sk-breathe 1.55s ease-in-out infinite alternate;
  }

  .result-sk-line--short {
    width: 120px;
  }

  .result-sk-line--title {
    height: 10px;
    width: 100%;
  }

  .result-sk-line--desc {
    width: 92%;
  }

  .result-sk-line--desc2 {
    width: 86%;
  }

  .result-sk-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: auto;
  }

  .result-sk-line--meta1 {
    width: 46%;
    height: 11px;
    border-radius: 999px;
  }

  .result-sk-line--meta2 {
    width: 58%;
    height: 11px;
    border-radius: 999px;
  }

  @keyframes sk-breathe {
    0% {
      opacity: 0.78;
    }
    100% {
      opacity: 1;
    }
  }

  .empty-state {
    min-height: 300px;
    display: grid;
    place-items: center;
    align-content: center;
    text-align: center;
    color: var(--desc-color);
  }

  .result-error-state {
    min-height: 260px;
    padding: 28px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 1px dashed color-mix(in srgb, var(--danger-color, #dc2626) 30%, var(--card-border-color));
    border-radius: 14px;
    text-align: center;
    background: color-mix(in srgb, var(--danger-color, #dc2626) 4%, var(--card-background));
  }

  .result-error-state h3,
  .result-error-state p {
    margin: 0;
  }

  .result-error-state p,
  .result-error-request-id {
    color: var(--desc-color);
    font-size: 13px;
  }

  .empty-state h3 {
    margin: 16px 0 8px;
    color: var(--text-color);
  }

  .empty-orbit {
    width: 76px;
    height: 76px;
    border-radius: 50%;
    border: 12px solid color-mix(in srgb, var(--resource-bookmark-color) 14%, transparent);
    border-top-color: var(--resource-bookmark-color);
  }

  .empty-actions {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }

  .empty-action-btn {
    min-height: 32px;
    border-radius: 12px;
    padding: 0 12px;
    background: var(--search-muted-bg);
  }

  /* 桌面端工作区：顶部承担定位与搜索，筛选保持可见，仅让结果列表滚动。 */
  @media (min-width: 768px) {
    .search-center-shell :deep(.resource-page-body) {
      min-height: 0;
      overflow: hidden;
    }

    .search-page {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
      overflow: hidden;
      padding: 0;
    }

    .search-page-topbar {
      flex: 0 0 auto;
      min-height: 34px;
      display: flex;
      align-items: center;
    }

    .section-switcher {
      margin-bottom: 0;
    }

    .search-header {
      flex: 0 0 auto;
      min-height: 58px;
      box-sizing: border-box;
      padding: 8px 12px;
      flex-direction: row;
      align-items: center;
      gap: 10px;
      border-radius: 14px;
      box-shadow: var(--surface-raised-shadow);
    }

    .search-header-copy {
      flex: 0 1 460px;
      min-width: 280px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .search-header-title {
      flex-wrap: nowrap;
      align-items: center;
    }

    .search-header-sub {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .search-header-input {
      width: 100%;
      flex: 1 1 auto;
      min-width: 360px;
      display: grid;
      grid-template-columns: minmax(260px, 1fr) auto 42px 42px;
      gap: 8px;
    }

    :deep(.search-header-input .b-input) {
      border-radius: 12px;
    }

    .search-ai-entry,
    .search-header-icon-btn {
      height: 42px;
      border-radius: 11px;
      font-weight: 600;
    }

    .search-ai-entry {
      flex-shrink: 0;
      min-width: 118px;
      padding: 0 14px;
      gap: 6px;
      color: #fff;
      background: var(--primary-color);
    }

    .search-header-icon-btn {
      width: 42px;
      min-width: 42px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-color);
      background: var(--search-muted-bg);
    }

    .graph-entry {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--background-color));
    }

    .search-layout {
      flex: 1 1 auto;
      min-height: 0;
      margin-top: 0;
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      align-items: stretch;
      overflow: hidden;
    }

    .filter-item {
      height: auto;
      min-height: 38px;
      line-height: 1.2;
      padding: 8px 10px;
      border-radius: 10px;
      justify-content: initial;
      background: transparent;
    }

    .filter-item.active {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 9%, var(--search-muted-bg));
    }

    .result-panel {
      min-height: 0;
      padding: 14px;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .result-toolbar--summary {
      flex: 0 0 auto;
      min-height: 38px;
      padding: 0 2px 7px;
      gap: 8px;
    }

    .result-heading {
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    .result-title {
      flex: 0 0 auto;
      font-size: 17px;
    }

    .result-subtitle {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }

    .clear-btn {
      height: 28px;
      min-height: 28px;
      padding: 0 10px;
      border-radius: 9px;
      background: transparent;
    }

    .desktop-result-controls {
      min-width: 0;
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      gap: 7px;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
    }

    .desktop-result-controls::-webkit-scrollbar {
      display: none;
    }

    .desktop-result-controls .select-visible-btn {
      margin-left: 0;
    }

    .result-toolbar--summary > .toolbar-actions {
      flex: 0 0 auto;
      margin-left: auto;
    }

    .advanced-filters {
      flex: 0 0 auto;
      margin-top: 6px;
      padding: 6px 8px;
      border: 0;
      border-radius: 10px;
      background: color-mix(in srgb, var(--search-muted-bg) 78%, transparent);
    }

    .filter-row {
      flex-wrap: nowrap;
      gap: 8px;
    }

    .select-wrap {
      flex: 0 0 auto;
    }

    .filter-select {
      min-width: 116px;
    }

    .view-switch {
      flex: 0 0 auto;
      height: 32px;
      border-radius: 9px;
    }

    .view-btn,
    .tagless-btn,
    .select-visible-btn {
      height: 30px;
      min-height: 30px;
      line-height: 1;
      padding: 0 10px;
      border-radius: 8px;
      background: transparent;
      font-size: 12px;
    }

    .view-btn.active {
      border-radius: 8px;
    }

    .tagless-btn {
      background: color-mix(in srgb, var(--background-color) 70%, transparent);
    }

    .select-visible-btn {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 9%, var(--background-color));
    }

    .tag-filter-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .tag-filter-label {
      flex: 0 0 auto;
      line-height: 26px;
    }

    .tag-filter-main {
      min-width: 0;
      flex: 1 1 auto;
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }

    .tag-filter-list {
      min-width: 0;
      flex: 1 1 auto;
      flex-wrap: nowrap;
      gap: 6px;
      overflow: hidden;
    }

    .tag-filter-list .tag-chip {
      flex: 0 0 auto;
    }

    .tag-chip {
      min-height: 26px;
      height: 26px;
      line-height: 1;
      padding: 0 9px;
      background: color-mix(in srgb, var(--background-color) 74%, transparent);
    }

    .tag-toggle-btn {
      flex: 0 0 auto;
      align-self: center;
      height: 22px;
      min-height: 22px;
      padding: 0 4px;
      background: transparent;
    }

    .batch-toolbar {
      flex: 0 0 auto;
      min-height: 40px;
      margin-top: 8px;
      padding: 5px 8px 5px 12px;
      border-radius: 11px;
      background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
      box-shadow: inset 3px 0 0 var(--primary-color);
    }

    .batch-actions :deep(.b_btn) {
      height: 28px;
      padding: 0 10px;
      font-size: 12px;
    }

    .result-scroll-area {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden auto;
      margin-top: 6px;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      mask-image: linear-gradient(to bottom, transparent 0, #000 8px, #000 calc(100% - 8px), transparent 100%);
    }

    .result-group:first-child,
    .result-skeleton {
      margin-top: 4px;
    }

    .result-group:last-child {
      margin-bottom: 0;
    }

    .result-grid {
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }

    .result-grid--list {
      grid-template-columns: minmax(0, 1fr);
    }

    .empty-state {
      min-height: 100%;
    }
  }

  @media (min-width: 768px) and (max-width: 1180px) {
    .search-header-copy {
      flex-basis: 300px;
      min-width: 220px;
    }

    .search-header-sub {
      display: none;
    }

    .filter-row {
      flex-wrap: wrap;
    }

    .select-visible-btn {
      margin-left: 0;
    }

    .result-toolbar--summary {
      flex-wrap: wrap;
    }

    .desktop-result-controls {
      width: 100%;
      order: 3;
      flex-basis: 100%;
    }
  }

  @media (min-width: 768px) and (max-width: 900px) {
    .desktop-result-controls {
      gap: 5px;
    }

    .desktop-result-controls .select-wrap > span {
      display: none;
    }

    .desktop-result-controls .filter-select {
      width: 104px;
      min-width: 104px;
    }

    .desktop-result-controls .view-btn,
    .desktop-result-controls .tagless-btn,
    .desktop-result-controls .select-visible-btn {
      padding-inline: 8px;
    }
  }

  @media (max-width: 767px) {
    .search-page {
      padding: 0;
      display: block;
      overflow-y: auto;
    }

    .search-header {
      padding: 14px 16px;
      border-radius: 16px;
    }

    .search-header-copy {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    h1 {
      font-size: 18px;
    }

    .search-layout {
      grid-template-columns: 1fr;
    }

    .search-header-input {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .graph-entry {
      grid-column: 1 / -1;
      width: 100%;
    }

    .tag-filter-wrap {
      grid-template-columns: 1fr;
      gap: 6px;
    }

    .result-panel {
      overflow: visible;
    }

    .result-scroll-area {
      overflow: visible;
    }

    .filter-item {
      padding: 6px;
    }
  }

  @media (max-width: 767px) {
    .search-center-shell :deep(.resource-page-header) {
      display: none;
    }

    .search-page-topbar {
      margin-bottom: 8px;
    }

    /* 页面自带 56px 顶栏后，正文容器不能再按整屏高度撑开 */
    .search-center-route {
      display: flex;
      flex-direction: column;
    }

    .search-center-route .search-center-shell {
      min-height: 0;
      flex: 1 1 auto;
    }

    .section-switcher {
      margin-bottom: 0;
    }

    .search-header {
      padding: 10px 12px;
    }

    .search-header-input {
      grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
      gap: 8px;
    }

    .refresh-btn,
    .graph-entry,
    .search-ai-entry {
      width: 100%;
      min-width: 0;
      height: 38px;
      padding-inline: 10px;
      border-radius: 11px;
    }

    .graph-entry {
      grid-column: auto;
      justify-content: center;
    }

    .search-layout {
      margin-top: 12px;
      gap: 12px;
    }

    .result-panel {
      min-height: 0;
      padding: 10px;
      border-radius: 14px;
    }

    .result-toolbar--summary {
      min-height: 0;
      padding-bottom: 8px;
      align-items: center;
      flex-direction: row;
      gap: 8px;
    }

    .result-heading {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .result-title {
      white-space: nowrap;
      font-size: 16px;
      line-height: 1.2;
    }

    .result-subtitle {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      line-height: 1.35;
    }

    .toolbar-actions {
      flex: 0 0 auto;
      width: auto;
      gap: 4px;
    }

    .toolbar-actions :deep(.b_btn) {
      flex: 0 0 auto;
      min-width: 0;
      height: 28px;
      min-height: 28px;
      padding: 0 8px;
      border-radius: 8px;
      font-size: 12px;
    }

    .advanced-filters {
      margin-top: 8px;
      padding: 8px;
      gap: 8px;
      border-radius: 12px;
    }

    .filter-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      align-items: center;
    }

    .result-panel,
    .result-scroll-area,
    .advanced-filters,
    .filter-row,
    .batch-toolbar,
    .batch-actions,
    .result-group,
    .result-grid {
      min-width: 0;
      max-width: 100%;
    }

    .select-wrap {
      min-width: 0;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 4px;
      font-size: 11px;
    }

    .filter-select {
      width: 100%;
      min-width: 0;
    }

    :deep(.filter-select .select-trigger) {
      height: 32px;
      min-height: 32px;
      padding: 0 8px;
      border-radius: 8px;
      font-size: 12px;
    }

    .tagless-btn,
    .select-visible-btn {
      width: 100%;
      height: 32px;
      min-height: 32px;
      padding: 0 8px;
      border-radius: 8px;
      font-size: 12px;
      white-space: nowrap;
    }

    .tag-filter-wrap {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px;
      align-items: center;
    }

    .tag-filter-label {
      font-size: 11px;
      line-height: 26px;
    }

    .tag-filter-main {
      min-width: 0;
      flex-direction: row;
      align-items: center;
      gap: 6px;
    }

    .tag-filter-list {
      min-width: 0;
      flex: 1 1 auto;
      flex-wrap: nowrap;
      gap: 6px;
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      touch-action: pan-x;
      -webkit-overflow-scrolling: touch;
    }

    .tag-filter-list::-webkit-scrollbar {
      display: none;
    }

    .tag-chip {
      flex: 0 0 auto;
      height: 26px;
      min-height: 26px;
      padding: 0 9px;
      line-height: 1;
    }

    .tag-toggle-btn {
      display: none;
    }

    .result-scroll-area {
      margin-top: 8px;
    }

    .batch-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .batch-left {
      min-width: 0;
    }

    .batch-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .batch-actions :deep(.b_btn) {
      width: 100%;
      padding-inline: 8px;
    }

    .result-grid,
    .result-grid--list {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* 移动端使用独立的紧凑工作区：顶部仅保留视图与类型切换，筛选进入底部抽屉，结果占满余下高度。 */
  .search-center-shell--mobile :deep(.resource-page-header) {
    display: none;
  }

  .search-center-shell--mobile :deep(.resource-page-body) {
    overflow: hidden;
  }

  .search-page--mobile {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .search-page--mobile .search-page-topbar {
    flex: 0 0 auto;
    margin-bottom: 6px;
  }

  .search-page--mobile .section-switcher {
    margin-bottom: 0;
  }

  .search-page--mobile .search-layout {
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
  }

  .search-page--mobile .filter-item {
    width: auto;
    min-width: max-content;
    height: 34px;
    flex: 0 0 auto;
    padding: 0 11px;
    display: inline-flex;
    grid-template-columns: none;
    gap: 6px;
    border: 1px solid var(--search-border-color);
    border-radius: 999px;
    background: var(--search-card-bg);
    box-shadow: none;
    font-size: 12px;
    line-height: 1;
  }

  .search-page--mobile .filter-item.active {
    border-color: color-mix(in srgb, var(--primary-color) 34%, var(--search-border-color));
    background: color-mix(in srgb, var(--primary-color) 10%, var(--search-card-bg));
    color: var(--primary-color);
  }

  .search-page--mobile .filter-dot {
    width: 6px;
    height: 6px;
  }

  .search-page--mobile .filter-count {
    font-size: 11px;
  }

  .search-page--mobile .result-panel {
    --b-card-background: transparent;
    --b-card-shadow: none;

    flex: 1 1 auto;
    min-height: 0;
    padding: 0 !important;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  /* 类型 Tab 移入抽屉后，这一行要承载「总数 + 各类型数量」；
     与工具按钮挤在同一行会把统计截断，因此让统计独占一行。 */
  .search-page--mobile .result-toolbar--summary {
    flex: 0 0 auto;
    padding: 4px 0 7px;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
  }

  .search-page--mobile .result-heading {
    width: 100%;
    min-width: 0;
    flex: 1 1 100%;
    display: flex;
    align-items: baseline;
    flex-direction: row;
    gap: 7px;
  }

  .search-page--mobile .result-title {
    flex: 0 0 auto;
    font-size: 16px;
  }

  .search-page--mobile .result-subtitle {
    min-width: 0;
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-page--mobile .toolbar-actions--mobile {
    flex: 0 0 auto;
    gap: 4px;
  }

  .search-page--mobile .mobile-toolbar-btn {
    min-width: 34px;
    height: 34px;
    min-height: 34px;
    padding: 0 9px;
    gap: 4px;
    border: 1px solid var(--search-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--search-card-bg);
    font-size: 12px;
    line-height: 1;
  }

  .search-page--mobile .mobile-toolbar-btn--icon {
    width: 34px;
    padding: 0;
  }

  .search-page--mobile .mobile-toolbar-btn.active {
    border-color: color-mix(in srgb, var(--primary-color) 35%, var(--search-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, var(--search-card-bg));
  }

  .search-page--mobile .mobile-toolbar-btn:disabled {
    opacity: 0.48;
  }

  .mobile-filter-count {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--primary-color);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
  }

  .search-page--mobile .batch-toolbar {
    flex: 0 0 auto;
    min-width: 0;
    margin-top: 6px;
    padding: 6px 8px;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--search-card-bg));
  }

  .search-page--mobile .batch-left {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .search-page--mobile .batch-actions {
    min-width: 0;
    width: auto;
    flex: 1 1 auto;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  .search-page--mobile .batch-actions::-webkit-scrollbar {
    display: none;
  }

  .search-page--mobile .batch-actions :deep(.b_btn) {
    width: auto;
    min-width: max-content;
    height: 30px;
    flex: 0 0 auto;
    padding: 0 9px;
    font-size: 11px;
  }

  .search-page--mobile .result-scroll-area {
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 0;
    padding: 0 2px 12px;
    overflow: hidden auto;
    border: 0;
    border-radius: 0;
    background: transparent;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }

  .search-page--mobile .result-group {
    margin-top: 9px;
  }

  .search-page--mobile .result-group:first-child,
  .search-page--mobile .result-skeleton {
    margin-top: 7px;
  }

  .search-page--mobile .group-header {
    margin-bottom: 6px;
    padding: 0 2px;
    font-size: 12px;
  }

  .search-page--mobile .result-grid,
  .search-page--mobile .result-grid--list {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .search-page--mobile .result-skeleton {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .search-page--mobile .result-sk-card {
    min-height: 106px;
    padding: 10px 12px;
    gap: 7px;
    border-radius: 14px;
  }

  .search-page--mobile .result-sk-line--desc2,
  .search-page--mobile .result-sk-line--meta2 {
    display: none;
  }

  .search-page--mobile .result-sk-meta {
    min-height: 11px;
    margin-top: 0;
  }

  .search-page--mobile .empty-state {
    min-height: 100%;
  }

  .mobile-filter-drawer {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .mobile-filter-field,
  .mobile-filter-section {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mobile-filter-label {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 650;
  }

  .mobile-filter-select {
    width: 100%;
  }

  .mobile-filter-toggle {
    width: max-content;
    min-height: 34px;
  }

  .mobile-filter-tags {
    max-height: 30dvh;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    overflow-y: auto;
  }

  /* 类型筛选：两列多选，取代原来占一整行的类型 Tab */
  .mobile-filter-types {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .mobile-filter-type {
    width: 100%;
    min-width: 0;
    height: 38px;
    padding: 0 10px;
    gap: 7px;
    justify-content: flex-start;
    border: 1px solid var(--search-border-color);
    border-radius: 10px;
    color: var(--text-color);
    background: var(--card-background) !important;
    font-size: 13px;
  }

  .mobile-filter-type.active {
    border-color: color-mix(in srgb, var(--primary-color) 55%, transparent);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background)) !important;
  }

  .mobile-filter-type .filter-count {
    margin-left: auto;
    color: var(--desc-color);
    font-size: 11px;
  }

  .mobile-filter-footer {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding-top: 10px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    background: var(--background-color);
  }

  .mobile-filter-footer :deep(.b_btn) {
    width: 100%;
    min-height: 40px;
  }
</style>
