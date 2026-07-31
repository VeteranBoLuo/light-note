<template>
  <div class="bookmark-page">
    <ResourcePageShell
      :title="$t('navigation.bookmark')"
      :subtitle="pageSubtitle"
      accent="bookmark"
      layout="workspace"
      compact-mobile-heading
      :title-actionable="!bookmark.isMobile"
      @title-click="resetBookmarkView"
    >
      <template #actions>
        <div v-if="!bookmark.isMobile" class="bookmark-search-action">
          <BInput
            v-model:value="bookmarkSearchInput"
            :placeholder="$t('home.searchBookmark')"
            clearable
            @enter="handleBookmarkSearch"
            @input="handleBookmarkSearchInput"
          >
            <template #prefix>
              <SvgIcon :src="icon.navigation.search" size="16" />
            </template>
          </BInput>
        </div>
        <BButton v-if="bookmark.isMobile" class="bookmark-filter-action" @click="bookmark.isFold = false">
          <SvgIcon :src="icon.cloudSpace.filter" size="16" />
          {{ $t('home.filterTags') }}
        </BButton>
        <BButton class="bookmark-manage-action" @click="openBookmarkManagement">
          <SvgIcon :src="icon.manage_categoryBtn_bookmark" size="16" />
          {{ $t('navigation.bookmarkManagement') }}
        </BButton>
        <BButton v-if="!bookmark.isMobile" type="primary" class="bookmark-add-action" @click="openAddBookmark">
          <SvgIcon :src="icon.common.add" size="16" />
          {{ $t('navigation.newBookmark') }}
        </BButton>
      </template>

      <div class="bookmark-workspace">
        <aside v-if="!bookmark.isMobile" class="bookmark-side-panel">
          <FilterPanel />
        </aside>
        <main class="bookmark-main-panel">
          <ViewPanel @load-more="loadMoreBookmarks" />
        </main>
      </div>
    </ResourcePageShell>

    <BDrawer
      v-if="bookmark.isMobile"
      :open="!bookmark.isFold"
      :title="$t('home.filterTags')"
      width="min(88vw, 360px)"
      @close="bookmark.isFold = true"
    >
      <FilterPanel class="bookmark-mobile-filter" />
    </BDrawer>
    <GuestBrowseNudge />
  </div>
</template>

<script lang="ts" setup>
  import FilterPanel from '@/view/home/FilterPanel.vue';
  import ViewPanel from '@/view/home/ViewPanel.vue';
  import GuestBrowseNudge from '@/components/home/GuestBrowseNudge.vue';
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { apiQueryPost } from '@/http/request.ts';
  import { loadBookmarkIconsProgressively } from '@/api/commonApi.ts';
  import { useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { RESOURCE_LIST_PAGE_SIZE, mergeResourcePage } from '@/utils/resourcePagination';

  const bookmark = bookmarkStore();
  const user = useUserStore();
  const router = useRouter();
  const route = useRoute();
  const { t } = useI18n();
  const MIN_SKELETON_MS = 100;
  const BOOKMARK_SEARCH_DEBOUNCE_MS = 280;
  const isHomeDrawerLayout = computed(() => bookmark.isMobile);
  const bookmarkSearchInput = ref('');
  let bookmarkSearchTimer = 0;
  let bookmarkRequestSequence = 0;

  const pageSubtitle = computed(() => {
    const tagData = bookmark.tagData as any;
    if (bookmark.type === 'normal' && tagData) {
      return t('home.relatedInfo', {
        bookmarks: bookmark.bookmarkTotal,
        tags: tagData.relatedTagList?.length || 0,
      });
    }
    if (bookmark.type === 'search') {
      return t('home.searchSummary', {
        keyword: bookmark.bookmarkSearch,
        count: bookmark.bookmarkTotal,
      });
    }
    return t('home.subtitle');
  });

  function openBookmarkManagement() {
    router.push('/manage/bookmarkMg');
  }

  function openAddBookmark() {
    router.push('/manage/editBookmark/add');
  }

  function resetBookmarkView() {
    window.clearTimeout(bookmarkSearchTimer);
    bookmarkSearchInput.value = '';
    bookmark.bookmarkSearch = '';
    bookmark.tagData = null;
    bookmark.type = 'all';
    bookmark.isFold = true;
    router.replace('/home').then(() => bookmark.refreshData());
  }

  function handleBookmarkSearchInput(value: string) {
    window.clearTimeout(bookmarkSearchTimer);
    if (!value.trim()) {
      if (bookmark.type === 'search') {
        resetBookmarkView();
      }
      return;
    }
    bookmarkSearchTimer = window.setTimeout(() => {
      handleBookmarkSearch();
    }, BOOKMARK_SEARCH_DEBOUNCE_MS);
  }

  function handleBookmarkSearch() {
    window.clearTimeout(bookmarkSearchTimer);
    const value = bookmarkSearchInput.value.trim();
    if (!value) {
      resetBookmarkView();
      return;
    }
    bookmark.bookmarkSearch = value;
    bookmark.type = 'search';
    router.replace({ name: 'home:search', params: { value } }).then(() => bookmark.refreshData());
  }

  useMobileTopBar(['home', 'home:id', 'home:search'], {
    getSearchValue: () => bookmarkSearchInput.value,
    setSearchValue: (value) => {
      bookmarkSearchInput.value = value;
    },
    onSearchInput: handleBookmarkSearchInput,
    onSearchEnter: handleBookmarkSearch,
    searchPlaceholder: () => t('home.searchBookmark'),
    onAdd: openAddBookmark,
    addLabel: () => t('navigation.newBookmark'),
  });

  // 处理滚动条滚动到顶部
  const scrollToTop = () => {
    const dom =
      document.querySelector<HTMLElement>('.bookmark-page [data-mobile-resource-scroll]') ||
      document.getElementById('view-panel');
    dom?.scrollTo(0, 0);
  };

  // 获取书签列表
  // 相关标签由后端按共同资源推导;失败或越权时保持空列表,不打断书签列表渲染。
  let relatedTagsRequestId = 0;
  const loadRelatedTagsForCurrent = async (tagId: string) => {
    const requestId = ++relatedTagsRequestId;
    try {
      const res = await apiQueryPost('/api/bookmark/getRelatedTag', { filters: { id: tagId } });
      if (requestId !== relatedTagsRequestId) return;
      const current = bookmark.tagData as any;
      if (!current || String(current.id) !== String(tagId)) return;
      current.relatedTagList = res.status === 200 && Array.isArray(res.data) ? res.data : [];
    } catch {
      if (requestId !== relatedTagsRequestId) return;
      const current = bookmark.tagData as any;
      if (current && String(current.id) === String(tagId)) current.relatedTagList = [];
    }
  };

  const fetchBookmarkList = async (type: string, params: Record<string, any> = {}, page = 1) => {
    const user = useUserStore();
    const res = await apiQueryPost('/api/bookmark/getBookmarkList', {
      pageSize: RESOURCE_LIST_PAGE_SIZE,
      currentPage: page,
      filters: {
        userId: user.id,
        type,
        ...params,
      },
    });
    if (res.status !== 200) return null;
    return {
      items: Array.isArray(res.data?.items) ? res.data.items : [],
      total: Number(res.data?.total || 0),
      page: Number(res.data?.page || page),
      hasMore: Boolean(res.data?.hasMore),
    };
  };

  // 缓存图片:抓取无图标书签的 favicon 落库,并把返回的新图标当次回填到列表,
  // 不必等下次进页面(否则这一屏一直用 TagCard 里 ico.kucat.cn 的临时兜底图)
  const cacheImages = async (items: any[] = bookmark.bookmarkList as any[]) => {
    if (!items?.length) return;
    const currentItems = items;
    // 只有首次缺图标时显示加载占位；已有图标过期检查时继续展示旧图，后台成功后无感替换。
    const pendingItems = currentItems.filter((item) => item?.id && item?.url && !item.iconUrl);
    pendingItems.forEach((item) => (item.iconLoading = true));
    // 渐进式:只抓无图标的,限并发逐个请求,抓到即回填(不再整批等最慢站一起返回)
    try {
      await loadBookmarkIconsProgressively(currentItems, (id, icon) => {
        const item = bookmark.bookmarkList.find((candidate: any) => candidate.id === id);
        if (item) {
          item.iconUrl = icon;
          item.iconLoading = false;
        }
      });
    } finally {
      pendingItems.forEach((item) => (item.iconLoading = false));
    }
  };

  function getBookmarkRequestParams(type = bookmark.type) {
    if (type === 'normal') {
      const tagId = (bookmark.tagData as any)?.id || route.params?.id;
      return tagId ? { tagId } : null;
    }
    if (type === 'search') {
      return bookmark.bookmarkSearch ? { value: bookmark.bookmarkSearch } : null;
    }
    return {};
  }

  async function loadMoreBookmarks() {
    if (bookmark.bookmarkLoading || bookmark.bookmarkLoadingMore || !bookmark.bookmarkHasMore) return false;
    const requestSequence = bookmarkRequestSequence;
    const requestType = bookmark.type;
    const params = getBookmarkRequestParams(requestType);
    if (!params) return false;

    bookmark.bookmarkLoadingMore = true;
    try {
      const result = await fetchBookmarkList(requestType, params, bookmark.bookmarkPage + 1);
      if (requestSequence !== bookmarkRequestSequence || requestType !== bookmark.type || !result) return false;
      const previousLength = bookmark.bookmarkList.length;
      bookmark.bookmarkList = mergeResourcePage(bookmark.bookmarkList, result.items);
      bookmark.bookmarkPage = result.page;
      bookmark.bookmarkTotal = result.total;
      bookmark.bookmarkHasMore = result.hasMore;
      if (requestType === 'all') {
        user.bookmarkTotal = result.total;
        bookmark.bookmarkAllLoaded = !result.hasMore;
      }
      void cacheImages(result.items);
      return bookmark.bookmarkList.length > previousLength;
    } catch (error) {
      console.warn('加载更多书签失败:', error);
      return false;
    } finally {
      if (requestSequence === bookmarkRequestSequence) {
        bookmark.bookmarkLoadingMore = false;
      }
    }
  }

  async function ensureLocatedBookmark(requestSequence: number) {
    const rawLocate = route.query.locate;
    const locateId = String(Array.isArray(rawLocate) ? rawLocate[0] || '' : rawLocate || '');
    if (!locateId) return;
    while (
      requestSequence === bookmarkRequestSequence &&
      !bookmark.bookmarkList.some((item: any) => String(item.id) === locateId) &&
      bookmark.bookmarkHasMore
    ) {
      const progressed = await loadMoreBookmarks();
      if (!progressed) break;
    }
  }

  const watchedRefreshKey = computed(() => bookmark.refreshKey);
  watch(
    () => watchedRefreshKey.value,
    async () => {
      const requestSequence = ++bookmarkRequestSequence;
      const requestType = bookmark.type;
      bookmark.bookmarkList = [];
      bookmark.bookmarkPage = 0;
      bookmark.bookmarkTotal = 0;
      bookmark.bookmarkHasMore = false;
      bookmark.bookmarkLoadingMore = false;
      // 请求成功且全部页完成前保持 false，避免把刷新时的临时空数组误判成「新用户没有书签」。
      bookmark.bookmarkAllLoaded = false;
      bookmark.bookmarkLoading = true;
      const loadingStart = Date.now();
      try {
        let result: Awaited<ReturnType<typeof fetchBookmarkList>> = null;
        if (requestType === 'normal') {
          const tag = bookmark.tagList?.find((item) => item.id === route.params?.id);
          bookmark.tagData = tag;
          // 相关标签不再随列表接口下发(已改为按共同资源推导),仅为当前选中标签单独拉取一次
          if (tag?.id) void loadRelatedTagsForCurrent(tag.id);
          if (tag) {
            result = await fetchBookmarkList('normal', { tagId: tag.id }, 1);
            if (isHomeDrawerLayout.value) {
              bookmark.isFold = true;
            }
          }
        } else if (requestType === 'all') {
          bookmark.tagData = null;
          result = await fetchBookmarkList('all', {}, 1);
        } else if (requestType === 'search' && bookmark.bookmarkSearch) {
          bookmark.tagData = null;
          result = await fetchBookmarkList('search', { value: bookmark.bookmarkSearch }, 1);
        } else {
          bookmark.tagData = null;
          bookmark.type = 'all';
          bookmark.refreshData();
          return;
        }

        if (requestSequence !== bookmarkRequestSequence) return;
        if (result) {
          bookmark.bookmarkList = result.items;
          bookmark.bookmarkPage = result.page;
          bookmark.bookmarkTotal = result.total;
          bookmark.bookmarkHasMore = result.hasMore;
          if (requestType === 'all') {
            user.bookmarkTotal = result.total;
            bookmark.bookmarkAllLoaded = !result.hasMore;
          }
        }
        scrollToTop();
        void cacheImages(result?.items || []);
      } finally {
        const elapsed = Date.now() - loadingStart;
        if (elapsed < MIN_SKELETON_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_SKELETON_MS - elapsed));
        }
        if (requestSequence === bookmarkRequestSequence) {
          bookmark.bookmarkLoading = false;
          void ensureLocatedBookmark(requestSequence);
        }
      }
    },
    { flush: 'sync' },
  );

  watch(
    () => bookmark.refreshTagKey,
    () => queryTagList(),
  );

  watch(
    () => bookmark.type,
    (type) => {
      if (type !== 'search') bookmarkSearchInput.value = '';
    },
  );

  // 全局搜索「定位」跳转:目标已在当前「全部」列表 → 不重载(避免骨架屏,秒滚动);
  // 否则(处在标签过滤视图 / 目标不在当前列表)才切「全部」加载
  watch(
    () => route.query.locate,
    (locate) => {
      if (!locate) return;
      const id = String(Array.isArray(locate) ? locate[0] : locate);
      const inCurrentList = bookmark.bookmarkList?.some((b: any) => b.id === id);
      if (bookmark.type === 'all' && inCurrentList) return; // 数据已全且含目标,交 CardPanel 直接滚动高亮
      if (bookmark.type !== 'all') {
        bookmark.type = 'all';
        bookmark.tagData = null;
      }
      bookmark.refreshData();
    },
    { immediate: true },
  );

  // 查询标签列表。silent=true:已有缓存时的后台刷新——不显示骨架、不重复刷书签,仅把别处新增/删除的标签同步过来。
  async function queryTagList(silent = false) {
    const user = useUserStore();
    const requestedUserId = String(user.id || '');
    if (!silent && bookmark.type !== 'normal') {
      bookmark.refreshData();
    }
    const tags = await bookmark.loadTagList(requestedUserId, { showLoading: !silent });
    if (!tags || String(user.id || '') !== requestedUserId) return;

    user.tagTotal = tags.length;
    if (!silent && bookmark.type === 'normal') {
      bookmark.refreshData();
    }
  }

  onMounted(() => {
    bookmark.bookmarkList = [];
    if (!user.id) {
      user.role = 'visitor';
    }
    bookmark.type = 'all';
    // 带有tagId刷新页面时
    if (route.params?.id) {
      bookmark.type = 'normal';
    } else if (route.params?.value) {
      // 带有search刷新页面时
      bookmark.type = 'search';
      bookmark.bookmarkSearch = Array.isArray(route.params.value) ? route.params.value[0] : route.params.value;
      bookmarkSearchInput.value = bookmark.bookmarkSearch;
    }
    if (bookmark.tagList.length) {
      bookmark.refreshData(); // 有缓存:先用缓存的标签+书签立即渲染,避免每次进页面闪骨架屏
      queryTagList(true); // 再后台静默刷新标签列表:别处新增/删除的标签,回到书签页即同步(修「回页面标签不刷新」)
    } else {
      queryTagList();
    }
  });

  onBeforeUnmount(() => {
    window.clearTimeout(bookmarkSearchTimer);
    bookmarkRequestSequence += 1;
  });
</script>

<style lang="less" scoped>
  .bookmark-page {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }

  .bookmark-search-action {
    width: 230px;
  }

  .bookmark-search-action :deep(.b-input) {
    height: 36px;
    border-radius: 10px;
  }

  .bookmark-manage-action,
  .bookmark-add-action,
  .bookmark-filter-action {
    height: 36px;
    gap: 7px;
    border-radius: 10px;
  }

  .bookmark-workspace {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: 228px minmax(0, 1fr);
    gap: 14px;
  }

  .bookmark-side-panel,
  .bookmark-main-panel {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 72%, transparent);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color, var(--menu-body-bg-color));
    box-shadow: 0 12px 30px -28px color-mix(in srgb, var(--text-color) 38%, transparent);
  }

  .bookmark-side-panel {
    padding: 12px;
  }

  .bookmark-main-panel {
    position: relative;
  }

  .bookmark-side-panel :deep(.filter-panel),
  .bookmark-side-panel :deep(.header-input) {
    width: 100%;
    min-width: 0;
  }

  .bookmark-mobile-filter {
    width: 100%;
    height: 100%;
  }

  @media (max-width: 767px) {
    .bookmark-filter-action,
    .bookmark-manage-action {
      flex: 1 1 0;
      width: auto;
    }

    .bookmark-workspace {
      height: 100%;
      min-height: 0;
      display: block;
    }

    .bookmark-main-panel {
      width: 100%;
      height: 100%;
      min-height: 0;
      display: block;
      overflow: hidden;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }

    .bookmark-main-panel :deep(.view-panel) {
      position: absolute;
      inset: 0;
      width: auto;
      height: auto;
      min-height: 0;
      overflow: hidden;
    }

    .bookmark-mobile-filter :deep(.filter-panel),
    .bookmark-mobile-filter :deep(.header-input) {
      width: 100%;
      min-width: 0;
      height: 100%;
    }
  }
</style>
