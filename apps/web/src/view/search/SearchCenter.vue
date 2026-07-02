<template>
  <div class="search-page" :class="{ 'search-page--night': user.currentTheme === 'night' }">
    <section class="hero-card">
      <div class="hero-copy">
        <div class="eyebrow">{{ t('resourceCenter.eyebrow') }}</div>
        <h1>{{ t('resourceCenter.title') }}</h1>
        <p>{{ t('resourceCenter.subtitle') }}</p>
        <button
          style="
            margin-top: 12px;
            border: 0;
            cursor: pointer;
            color: #fff;
            background: #615ced;
            font-size: 14px;
            padding: 8px 16px;
            border-radius: 8px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          "
          @click="$router.push('/graph')"
          v-click-log="{ module: '资源中心', operation: '进入知识图谱' }"
        >
          🌐 知识图谱
        </button>
      </div>
      <div class="hero-stats">
        <div v-for="stat in stats" :key="stat.type" class="stat-card">
          <span class="stat-value">{{ stat.count }}</span>
          <span class="stat-label">{{ stat.label }}</span>
        </div>
      </div>
    </section>

    <section class="search-layout">
      <aside class="type-filter">
        <button
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
        </button>
      </aside>

      <main class="result-panel">
        <div class="result-toolbar">
          <div>
            <div class="result-title">{{ t('resourceCenter.results') }}</div>
            <div class="result-subtitle">{{ resultSubtitle }}</div>
          </div>
          <div class="toolbar-actions">
            <button
              class="clear-btn"
              :disabled="!queryState.keyword"
              @click="clearKeyword"
              v-click-log="{ module: '资源中心', operation: '清空搜索关键词' }"
            >
              {{ t('resourceCenter.clear') }}
            </button>
            <button
              class="clear-btn"
              @click="clearAdvancedFilters"
              v-click-log="{ module: '资源中心', operation: '清空筛选条件' }"
            >
              {{ t('resourceCenter.clearFilters') }}
            </button>
          </div>
        </div>

        <section class="query-filter-bar">
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
          <button
            class="refresh-btn refresh-btn--inline"
            @click="refreshData"
            v-click-log="{ module: '资源中心', operation: '刷新搜索结果' }"
          >
            {{ t('resourceCenter.refresh') }}
          </button>
        </section>

        <section class="advanced-filters">
          <div class="filter-row">
            <label class="select-wrap">
              <span>{{ t('resourceCenter.sort.label') }}</span>
              <select v-model="queryState.sort" @change="applyQueryState('切换排序')">
                <option value="relevance">{{ t('resourceCenter.sort.relevance') }}</option>
                <option value="updated">{{ t('resourceCenter.sort.updated') }}</option>
                <option value="name">{{ t('resourceCenter.sort.name') }}</option>
              </select>
            </label>

            <label class="select-wrap">
              <span>{{ t('resourceCenter.date.label') }}</span>
              <select v-model="queryState.date" @change="applyQueryState('筛选时间范围')">
                <option value="all">{{ t('resourceCenter.date.all') }}</option>
                <option value="7d">{{ t('resourceCenter.date.day7') }}</option>
                <option value="30d">{{ t('resourceCenter.date.day30') }}</option>
                <option value="365d">{{ t('resourceCenter.date.day365') }}</option>
              </select>
            </label>

            <div class="view-switch">
              <button class="view-btn" :class="{ active: queryState.view === 'card' }" @click="setView('card')">
                {{ t('resourceCenter.view.card') }}
              </button>
              <button class="view-btn" :class="{ active: queryState.view === 'list' }" @click="setView('list')">
                {{ t('resourceCenter.view.list') }}
              </button>
            </div>

            <button class="tagless-btn" :class="{ active: queryState.untagged }" @click="toggleUntagged">
              {{ t('resourceCenter.untagged') }}
            </button>
          </div>

          <div class="tag-filter-wrap">
            <div class="tag-filter-label">{{ t('resourceCenter.tagFilter') }}</div>
            <div class="tag-filter-list">
              <button
                v-for="tag in tagOptions"
                :key="tag"
                class="tag-chip"
                :class="{ active: queryState.tags.includes(tag) }"
                @click="toggleTagFilter(tag)"
              >
                {{ tag }}
              </button>
            </div>
          </div>
        </section>

        <section class="batch-toolbar">
          <div class="batch-left">
            <b-button class="batch-btn" @click="toggleSelectAllVisible">
              {{ allVisibleSelected ? t('resourceCenter.batch.unselectAll') : t('resourceCenter.batch.selectAll') }}
            </b-button>
            <span>{{ t('resourceCenter.batch.selectedCount', { count: selectedIds.length }) }}</span>
          </div>
          <div class="batch-actions">
            <b-button type="primary" @click="batchAddTag">{{ t('resourceCenter.batch.addTag') }}</b-button>
            <b-button type="primary" @click="batchRemoveTag">{{ t('resourceCenter.batch.removeTag') }}</b-button>
            <b-button type="danger" @click="batchDelete">{{ t('resourceCenter.batch.delete') }}</b-button>
          </div>
        </section>

        <div v-if="viewState.loading" class="result-skeleton" :class="{ 'result-skeleton--list': queryState.view === 'list' }">
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
            <div class="result-grid" :class="{ 'result-grid--list': queryState.view === 'list' }">
              <RightMenu :menu="[deleteMenuLabel]" @select="handleItemMenu($event, item)" v-for="item in group.items" :key="`${item.type}-${item.id}`">
                <SearchResultItem
                  :item="item"
                  :type-label="getSearchTypeLabel(t, item.type)"
                  :keyword="queryState.keyword"
                  :selected="selectedIds.includes(getItemSelectionKey(item))"
                  :selectable="true"
                  :view="queryState.view"
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
            <button
              class="empty-action-btn"
              @click="router.push('/manage/editBookmark/add')"
              v-click-log="{ module: '资源中心', operation: '空状态创建书签' }"
            >
              {{ t('resourceCenter.emptyActionBookmark') }}
            </button>
            <button
              class="empty-action-btn"
              @click="router.push('/noteLibrary/add')"
              v-click-log="{ module: '资源中心', operation: '空状态创建笔记' }"
            >
              {{ t('resourceCenter.emptyActionNote') }}
            </button>
            <button
              class="empty-action-btn"
              @click="router.push('/cloudSpace')"
              v-click-log="{ module: '资源中心', operation: '空状态上传文件' }"
            >
              {{ t('resourceCenter.emptyActionFile') }}
            </button>
            <button
              class="empty-action-btn"
              @click="router.push('/manage/tagMg')"
              v-click-log="{ module: '资源中心', operation: '空状态进入标签管理' }"
            >
              {{ t('resourceCenter.emptyActionTag') }}
            </button>
          </div>
        </div>
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
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
  import { useUserStore } from '@/store';
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

  const SearchResultItem = SearchResultItemComp;
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
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
    sort: 'relevance',
    view: (localStorage.getItem(SEARCH_VIEW_STORAGE_KEY) as ResourceView) || 'card',
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

  const stats = computed(() =>
    SEARCH_TYPE_LIST.map((type) => ({
      type,
      label: getSearchTypeLabel(t, type),
      count: Number(summaryTotals.value[type] || 0),
    })),
  );

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

  function parseType(value: unknown): SearchType | 'all' {
    const raw = String(value || 'all');
    return SEARCH_TYPE_LIST.includes(raw as SearchType) ? (raw as SearchType) : 'all';
  }

  function parseSort(value: unknown): ResourceSort {
    const raw = String(value || 'relevance');
    return ['relevance', 'updated', 'name'].includes(raw) ? (raw as ResourceSort) : 'relevance';
  }

  function parseView(value: unknown): ResourceView {
    const raw = String(value || localStorage.getItem(SEARCH_VIEW_STORAGE_KEY) || 'card');
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
    queryState.sort = 'relevance';
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
      const hasProtocol = /^https?:\/\//i.test(item.url);
      window.open(hasProtocol ? item.url : `https://${item.url}`, '_blank');
      return;
    }
    if (item.route) {
      router.push(item.route);
      return;
    }
    if (item.type === 'file') {
      router.push({ path: '/cloudSpace', query: { fileName: item.title } });
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
    if (menu !== deleteMenuLabel.value) return;
    const typeLabel = getSearchTypeLabel(t, item.type);
    const name = item.title || '-';
    Alert.alert({
      title: t('resourceCenter.batch.deleteConfirmTitle'),
      content:
        item.type === 'tag'
          ? `请确认是否要删除${typeLabel}【${name}】？删除后会解除与资源的绑定。`
          : `请确认是否要删除${typeLabel}【${name}】？删除后会移入回收站。`,
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
    overflow: auto;
    padding: 24px;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .search-page--night {
    --search-hero-bg: linear-gradient(135deg, #25272d, #303033);
    --search-stat-bg: #30333b;
    --search-panel-bg: #262629;
    --search-card-bg: #303033;
    --search-card-shadow: rgba(0, 0, 0, 0.36);
    --search-muted-bg: #35363d;
  }

  .hero-card {
    position: relative;
    overflow: hidden;
    border-radius: 24px;
    padding: 24px;
    background:
      radial-gradient(
        circle at 12% 18%,
        color-mix(in srgb, var(--resource-file-color) 22%, transparent),
        transparent 28%
      ),
      radial-gradient(
        circle at 86% 14%,
        color-mix(in srgb, var(--resource-bookmark-color) 22%, transparent),
        transparent 30%
      ),
      var(--search-hero-bg);
    border: 1px solid var(--card-border-color);
    box-shadow: var(--ant-table-boxShadow);
  }

  .hero-copy,
  .hero-stats {
    position: relative;
    z-index: 1;
  }

  .eyebrow {
    color: var(--resource-bookmark-color);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 8px 0 10px;
    font-size: 38px;
    line-height: 1;
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

  .hero-stats {
    margin-top: 20px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    max-width: 760px;
  }

  .stat-card {
    padding: 14px;
    border-radius: 16px;
    background: var(--search-stat-bg);
    border: 1px solid var(--card-border-color);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 800;
  }

  .stat-label,
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

  .query-filter-bar {
    margin-top: 12px;
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 110px;
    gap: 10px;
    align-items: center;
  }

  .refresh-btn--inline {
    height: 42px;
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

  .tag-filter-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-height: 96px;
    overflow: auto;
    padding-right: 2px;
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
    grid-template-columns: 1fr;
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

  .result-skeleton--list .result-sk-card {
    min-height: 132px;
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

  @media (max-width: 900px) {
    .search-page {
      padding: 12px;
    }

    .hero-card {
      padding: 18px;
      border-radius: 16px;
    }

    h1 {
      font-size: 28px;
    }

    .search-layout {
      grid-template-columns: 1fr;
    }

    .query-filter-bar {
      grid-template-columns: 1fr;
    }

    .hero-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
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
  }
</style>
