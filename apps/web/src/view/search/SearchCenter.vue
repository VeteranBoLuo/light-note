<template>
  <div class="search-page" :class="{ 'search-page--night': user.currentTheme === 'night' }">
    <div class="search-page-topbar">
      <ResourceCenterSectionNav class="section-switcher" />
    </div>

    <section class="search-header">
      <div class="search-header-copy">
        <div class="search-header-title">
          <span class="eyebrow">{{ t('resourceCenter.eyebrow') }}</span>
          <h1>{{ t('resourceCenter.title') }}</h1>
        </div>
        <span class="search-header-sub">{{ t('resourceCenter.subtitle') }}</span>
      </div>

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
          class="refresh-btn"
          :loading="viewState.loading"
          @click="refreshData"
          v-click-log="{ module: '资源中心', operation: '刷新搜索结果' }"
        >
          {{ t('resourceCenter.refreshShort') }}
        </BButton>
        <BButton
          class="graph-entry"
          @click="$router.push('/graph')"
          v-click-log="{ module: '资源中心', operation: '进入知识图谱' }"
        >
          <svg-icon :src="icon.ai.internet" size="16" />
          {{ t('resourceCenter.knowledgeGraph') }}
        </BButton>
      </div>
    </section>

    <section class="search-layout">
      <aside class="type-filter">
        <BButton
          v-for="item in typeFilters"
          :key="item.value"
          class="filter-item"
          :class="{ active: queryState.type === item.value }"
          @click="setActiveType(item.value)"
          v-click-log="{ module: '资源中心', operation: `筛选搜索类型【${item.label}】` }"
        >
          <span class="filter-dot" :class="`filter-dot--${item.value}`"></span>
          <span>{{ item.label }}</span>
          <span class="filter-count">{{ item.count }}</span>
        </BButton>
      </aside>

      <main class="result-panel">
        <div class="result-toolbar result-toolbar--summary">
          <div class="result-heading">
            <div class="result-title">{{ t('resourceCenter.results') }}</div>
            <div class="result-subtitle">{{ resultSubtitle }}</div>
          </div>
          <div class="toolbar-actions">
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

        <section class="advanced-filters">
          <div class="filter-row">
            <label class="select-wrap">
              <span>{{ t('resourceCenter.sort.label') }}</span>
              <BSelect
                class="filter-select"
                :options="sortOptions"
                v-model:value="queryState.sort"
                @change="applyQueryState('切换排序')"
              />
            </label>

            <label class="select-wrap">
              <span>{{ t('resourceCenter.date.label') }}</span>
              <BSelect
                class="filter-select"
                :options="dateOptions"
                v-model:value="queryState.date"
                @change="applyQueryState('筛选时间范围')"
              />
            </label>

            <div class="view-switch" v-if="!bookmark.isMobile">
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
              @click="toggleSelectAllVisible"
            >
              {{ allVisibleSelected ? t('resourceCenter.batch.unselectAll') : t('resourceCenter.batch.selectAll') }}
            </BButton>
          </div>

          <div class="tag-filter-wrap" v-if="tagOptions.length">
            <div class="tag-filter-label">{{ t('resourceCenter.tagFilter') }}</div>
            <div class="tag-filter-main">
              <div class="tag-filter-list" :class="{ 'tag-filter-list--collapsed': !showAllTags }">
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
              <BButton v-if="tagOptions.length > 14" class="tag-toggle-btn" @click="showAllTags = !showAllTags">
                {{
                  showAllTags
                    ? t('resourceCenter.tagCollapse')
                    : t('resourceCenter.tagExpand', { count: tagOptions.length })
                }}
              </BButton>
            </div>
          </div>
        </section>

        <section v-if="selectedIds.length" class="batch-toolbar">
          <div class="batch-left">
            <span>{{ t('resourceCenter.batch.selectedCount', { count: selectedIds.length }) }}</span>
          </div>
          <div class="batch-actions">
            <b-button @click="batchAddToInbox">{{ t('inbox.addExisting') }}</b-button>
            <b-button type="primary" @click="batchAddTag">{{ t('resourceCenter.batch.addTag') }}</b-button>
            <b-button type="primary" @click="batchRemoveTag">{{ t('resourceCenter.batch.removeTag') }}</b-button>
            <b-button type="danger" @click="batchDelete">{{ t('resourceCenter.batch.delete') }}</b-button>
          </div>
        </section>

        <div class="result-scroll-area">
          <div
            v-if="viewState.loading"
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

          <template v-else-if="visibleGroups.length">
            <section v-for="group in visibleGroups" :key="group.type" class="result-group">
              <div class="group-header">
                <span>{{ getSearchTypeLabel(t, group.type) }}</span>
                <span>{{ t('resourceCenter.count', { count: group.items.length }) }}</span>
              </div>
              <div class="result-grid" :class="{ 'result-grid--list': effectiveView === 'list' }">
                <RightMenu
                  :menu="item.type === 'tag' ? [deleteMenuLabel] : [addInboxMenuLabel, deleteMenuLabel]"
                  @select="handleItemMenu($event, item)"
                  v-for="item in group.items"
                  :key="`${item.type}-${item.id}`"
                >
                  <SearchResultItem
                    :item="item"
                    :type-label="getSearchTypeLabel(t, item.type)"
                    :keyword="queryState.keyword"
                    :selected="selectedIds.includes(getItemSelectionKey(item))"
                    :selectable="true"
                    :view="effectiveView"
                    @open="openItem(item)"
                    @toggle-select="toggleSelect(item)"
                  />
                </RightMenu>
              </div>
            </section>
          </template>

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
        </div>
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import RightMenu from '@/components/base/RightMenu.vue';
  import icon from '@/config/icon.ts';
  import {
    batchDeleteSearchResources,
    clearGlobalSearchCache,
    fetchGlobalSearch,
    type SearchResultItem,
    type SearchType,
  } from '@/api/search.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { updatePreference } from '@/utils/savePreference';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import SearchResultItemComp from '@/components/searchCenter/SearchResultItem.vue';
  import {
    buildTypeBuckets,
    collectTagOptions,
    filterByDate,
    filterByTags,
    filterByUntagged,
    mapDisplayItems,
    sortDisplayItems,
    type DisplaySearchItem,
    type ResourceDate,
    type ResourceSort,
    type ResourceView,
  } from '@/components/searchCenter/searchUtils.ts';
  import { getSearchTypeLabel, SEARCH_TYPE_LIST } from '@/components/searchCenter/searchMeta.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { useInboxEnqueue } from '@/composables/useInboxEnqueue';
  import ResourceCenterSectionNav from '@/components/searchCenter/ResourceCenterSectionNav.vue';

  const SearchResultItem = SearchResultItemComp;
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const { addResourcesToInbox } = useInboxEnqueue();
  const { t } = useI18n();

  const SEARCH_VIEW_STORAGE_KEY = 'resource-center-view-mode';
  const SEARCH_BATCH_STORAGE_KEY = 'resource-center-batch-items';
  const SEARCH_QUERY_KEYS = ['q', 'type', 'sort', 'view', 'tags', 'date', 'untagged'] as const;
  const MIN_SKELETON_MS = 120;
  const REFRESH_SKELETON_MS = 360;
  const syncTimer = ref<number | null>(null);
  const isRouteApplying = ref(false);
  let requestSeq = 0;
  const summaryTotals = ref<Record<SearchType, number>>({
    bookmark: 0,
    note: 0,
    file: 0,
    tag: 0,
  });

  const queryState = reactive<{
    keyword: string;
    type: SearchType | 'all';
    sort: ResourceSort;
    view: ResourceView;
    tags: string[];
    date: ResourceDate;
    untagged: boolean;
  }>({
    keyword: '',
    type: 'all',
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
    rawItems: SearchResultItem[];
  }>({
    loading: false,
    rawItems: [],
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

  const itemsAfterCommonFilters = computed(() =>
    mappedItems.value.filter((item) => {
      if (!filterByDate(item, queryState.date)) return false;
      if (!filterByTags(item, queryState.tags)) return false;
      if (!filterByUntagged(item, queryState.untagged)) return false;
      return true;
    }),
  );

  const filteredItems = computed(() =>
    itemsAfterCommonFilters.value.filter((item) => {
      if (queryState.type !== 'all' && item.type !== queryState.type) return false;
      return true;
    }),
  );

  const sortedItems = computed(() => sortDisplayItems(filteredItems.value, queryState.sort));
  const typeBuckets = computed(() => buildTypeBuckets(sortedItems.value));

  const visibleGroups = computed(() => {
    if (queryState.type === 'all') {
      return SEARCH_TYPE_LIST.map((type) => ({
        type,
        items: typeBuckets.value[type],
      })).filter((group) => group.items.length);
    }
    return [{ type: queryState.type, items: typeBuckets.value[queryState.type] }];
  });

  const allVisibleItems = computed(() => visibleGroups.value.flatMap((group) => group.items));
  const selectableVisibleItems = computed(() => allVisibleItems.value);
  const allVisibleSelected = computed(
    () =>
      selectableVisibleItems.value.length > 0 &&
      selectableVisibleItems.value.every((item) => selectedIds.value.includes(getItemSelectionKey(item))),
  );
  const tagOptions = computed(() => collectTagOptions(mappedItems.value));
  const hasActiveAdvancedFilters = computed(
    () =>
      queryState.tags.length > 0 ||
      queryState.date !== 'all' ||
      queryState.untagged ||
      queryState.sort !== ((user.preferences.resourceSort as ResourceSort) || 'relevance'),
  );

  // 标签筛选 chips 折叠:默认收起,标签较多时点「更多」展开(原 hero 统计卡已删,信息与左侧类型筛选栏重复)
  const showAllTags = ref(false);

  const typeFilters = computed(() => [
    {
      value: 'all' as const,
      label: t('resourceCenter.types.allResults'),
      count: itemsAfterCommonFilters.value.length,
    },
    ...SEARCH_TYPE_LIST.map((type) => ({
      value: type,
      label: getSearchTypeLabel(t, type),
      count: itemsAfterCommonFilters.value.filter((item) => item.type === type).length,
    })),
  ]);

  const resultSubtitle = computed(() => {
    const q = queryState.keyword.trim();
    const prefix = q ? t('resourceCenter.keywordSummary', { keyword: q }) : t('resourceCenter.defaultSummary');
    return `${prefix} · ${t('resourceCenter.totalCount', { count: allVisibleItems.value.length })}`;
  });
  const deleteMenuLabel = computed(() => t('common.delete'));
  const addInboxMenuLabel = computed(() => t('inbox.addExisting'));

  function parseType(value: unknown): SearchType | 'all' {
    const raw = String(value || 'all');
    return SEARCH_TYPE_LIST.includes(raw as SearchType) ? (raw as SearchType) : 'all';
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
    if (SEARCH_TYPE_LIST.includes(raw as SearchType)) return raw as SearchType;
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
      queryState.type = parseType(Array.isArray(route.query.type) ? route.query.type[0] : route.query.type);
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
      ...(queryState.type !== 'all' ? { type: queryState.type } : {}),
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
    return rawMergedItems.filter(Boolean) as SearchResultItem[];
  }

  async function loadData(force = false, minSkeletonMs = MIN_SKELETON_MS) {
    const seq = ++requestSeq;
    const loadingStart = Date.now();
    viewState.loading = true;
    try {
      const res = await fetchGlobalSearch(queryState.keyword, 0, force);
      if (seq !== requestSeq) return;
      const normalizedItems = normalizeSearchResultItems(res);
      viewState.rawItems = normalizedItems;
      if (res.typeTotals) {
        summaryTotals.value = {
          bookmark: Number(res.typeTotals.bookmark || 0),
          note: Number(res.typeTotals.note || 0),
          file: Number(res.typeTotals.file || 0),
          tag: Number(res.typeTotals.tag || 0),
        };
      }
      const validSelection = new Set(normalizedItems.map((item) => getItemSelectionKey(item)));
      selectedIds.value = selectedIds.value.filter((id) => validSelection.has(id));
    } finally {
      if (seq === requestSeq) {
        const elapsed = Date.now() - loadingStart;
        if (elapsed < minSkeletonMs) {
          await new Promise((resolve) => setTimeout(resolve, minSkeletonMs - elapsed));
        }
        viewState.loading = false;
      }
    }
  }

  function syncQueryNow() {
    const query = buildQueryPayload();
    if (isSameSearchQuery(query)) return;
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

  function setActiveType(type: SearchType | 'all') {
    queryState.type = type;
    selectedIds.value = [];
    applyQueryState(`筛选搜索类型【${getSearchTypeLabel(t, type)}】`);
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
      await loadData(true, REFRESH_SKELETON_MS);
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
    const key = getItemSelectionKey(item);
    if (selectedIds.value.includes(key)) {
      selectedIds.value = selectedIds.value.filter((entry) => entry !== key);
    } else {
      selectedIds.value = [...selectedIds.value, key];
    }
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

  function handleItemMenu(menu: string, item: DisplaySearchItem) {
    if (menu === addInboxMenuLabel.value && item.type !== 'tag') {
      addItemsToInbox([item]);
      return;
    }
    if (menu !== deleteMenuLabel.value) return;
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

  watch(
    () => route.query,
    () => {
      applyRouteState();
      loadData();
    },
    { immediate: true },
  );

  watch(
    () => queryState.view,
    (val) => {
      localStorage.setItem(SEARCH_VIEW_STORAGE_KEY, val);
    },
  );

  // 打开资源中心自动聚焦搜索框(移动端不聚焦,避免弹出软键盘遮挡内容);让「打开即可搜」
  onMounted(() => {
    if (bookmark.isMobile) return;
    nextTick(() => {
      const host = document.getElementById('search-center-input');
      const input = host && (host.tagName === 'INPUT' ? host : host.querySelector('input'));
      (input as HTMLInputElement | null)?.focus();
    });
  });

  onBeforeUnmount(() => {
    if (syncTimer.value) clearTimeout(syncTimer.value);
  });
</script>

<style scoped lang="less">
  .search-page {
    --search-hero-bg: linear-gradient(135deg, var(--background-color), var(--menu-body-bg-color));
    --search-stat-bg: rgba(255, 255, 255, 0.48);
    --search-panel-bg: var(--background-color);
    --search-card-bg: var(--menu-body-bg-color);
    --search-card-shadow: rgba(20, 20, 43, 0.14);
    --search-muted-bg: var(--bl-input-noBorder-bg-color);

    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    padding: 24px;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .section-switcher {
    margin-bottom: 12px;
  }

  .search-page--night {
    --search-hero-bg: linear-gradient(135deg, #25272d, #303033);
    --search-stat-bg: #30333b;
    --search-panel-bg: #262629;
    --search-card-bg: #303033;
    --search-card-shadow: rgba(0, 0, 0, 0.36);
    --search-muted-bg: #35363d;
  }

  .search-header {
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
        color-mix(in srgb, var(--resource-bookmark-color) 18%, transparent),
        transparent 42%
      ),
      var(--search-hero-bg);
    border: 1px solid var(--card-border-color);
    box-shadow: var(--ant-table-boxShadow);
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

  .type-filter,
  .result-panel {
    border-radius: 20px;
    border: 1px solid var(--card-border-color);
    background: var(--search-panel-bg);
    box-shadow: var(--ant-table-boxShadow);
  }

  .type-filter {
    padding: 12px;
    position: sticky;
    top: 0;
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

  .result-panel {
    padding: 16px;
    min-height: 420px;
  }

  .result-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--card-border-color);
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
    border: 1px solid var(--card-border-color);
    background: color-mix(in srgb, var(--background-color) 94%, transparent);
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
    border: 1px solid var(--card-border-color);
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

  .tag-filter-list--collapsed {
    max-height: 34px;
    overflow: hidden;
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

  .tag-chip {
    min-height: 28px;
    border-radius: 999px;
    padding: 4px 10px;
    background: var(--search-muted-bg);
    color: var(--desc-color);
    font-size: 12px;
  }

  .tag-chip.active {
    background: color-mix(in srgb, var(--resource-tag-color) 16%, transparent);
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
    border: 1px solid color-mix(in srgb, var(--card-border-color) 78%, #7f8aa8 22%);
    background: color-mix(in srgb, var(--background-color) 96%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, #ffffff 8%, transparent),
      0 8px 20px color-mix(in srgb, #000000 18%, transparent);
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
  @media (min-width: 901px) {
    .search-page {
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow: hidden;
      padding: 16px 24px 20px;
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
      min-height: 76px;
      box-sizing: border-box;
      padding: 13px 16px;
      flex-direction: row;
      align-items: center;
      gap: 18px;
      border-radius: 16px;
      box-shadow: 0 8px 24px color-mix(in srgb, var(--search-card-shadow) 42%, transparent);
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
      flex: 1 1 560px;
      min-width: 360px;
      display: grid;
      grid-template-columns: minmax(260px, 1fr) auto auto;
      gap: 8px;
    }

    :deep(.search-header-input .b-input) {
      border-radius: 12px;
    }

    .refresh-btn,
    .graph-entry {
      height: 42px;
      min-width: 72px;
      padding: 0 13px;
      border-radius: 11px;
      font-weight: 600;
    }

    .refresh-btn {
      color: var(--text-color);
      background: var(--search-muted-bg);
    }

    .graph-entry {
      min-width: 112px;
      gap: 6px;
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--background-color));
    }

    .search-layout {
      flex: 1 1 auto;
      min-height: 0;
      margin-top: 0;
      grid-template-columns: 188px minmax(0, 1fr);
      gap: 14px;
      align-items: stretch;
    }

    .type-filter {
      position: static;
      align-self: stretch;
      padding: 10px;
      border-radius: 16px;
      overflow: auto;
    }

    .filter-item {
      height: auto;
      min-height: 42px;
      line-height: 1.2;
      padding: 10px;
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
      padding: 14px 14px 0;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .result-toolbar--summary {
      flex: 0 0 auto;
      min-height: 42px;
      padding: 0 2px 10px;
    }

    .result-heading {
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    .result-title {
      flex: 0 0 auto;
      font-size: 18px;
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

    .advanced-filters {
      flex: 0 0 auto;
      margin-top: 10px;
      padding: 9px 10px;
      gap: 8px;
      border: 0;
      border-radius: 12px;
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
      min-width: 124px;
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
      margin-left: auto;
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 9%, var(--background-color));
    }

    .tag-filter-wrap {
      grid-template-columns: 64px minmax(0, 1fr);
      gap: 8px;
    }

    .tag-filter-label {
      line-height: 26px;
    }

    .tag-filter-list {
      gap: 6px;
    }

    .tag-filter-list--collapsed {
      max-height: 28px;
    }

    .tag-chip {
      min-height: 26px;
      height: 26px;
      line-height: 1;
      padding: 0 9px;
      background: color-mix(in srgb, var(--background-color) 74%, transparent);
    }

    .tag-toggle-btn {
      height: 22px;
      min-height: 22px;
      padding: 0;
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
      padding: 0 6px 28px 2px;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 calc(100% - 18px), transparent 100%);
    }

    .result-group:first-child,
    .result-skeleton {
      margin-top: 12px;
    }

    .result-group:last-child {
      margin-bottom: 6px;
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

  @media (min-width: 901px) and (max-width: 1180px) {
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
  }

  @media (max-width: 900px) {
    .search-page {
      padding: 12px;
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

    .type-filter {
      position: static;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
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
  }
</style>
