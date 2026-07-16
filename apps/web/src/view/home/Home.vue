<template>
  <div class="bookmark-page">
    <ResourcePageShell
      :title="$t('navigation.bookmark')"
      :subtitle="pageSubtitle"
      accent="bookmark"
      layout="workspace"
      :title-actionable="!bookmark.isMobile"
      @title-click="resetBookmarkView"
    >
      <template #actions>
        <div class="bookmark-search-action">
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
        <BButton data-guide="bookmark-mg" class="bookmark-manage-action" @click="openBookmarkManagement">
          <SvgIcon :src="icon.manage_categoryBtn_bookmark" size="16" />
          {{ $t('navigation.bookmarkManagement') }}
        </BButton>
        <BButton v-if="bookmark.isMobile" class="bookmark-filter-action" @click="bookmark.isFold = false">
          <SvgIcon :src="icon.cloudSpace.filter" size="16" />
          {{ $t('home.filterTags') }}
        </BButton>
        <BButton type="primary" class="bookmark-add-action" @click="openAddBookmark">
          <SvgIcon :src="icon.common.add" size="16" />
          {{ $t('navigation.newBookmark') }}
        </BButton>
      </template>

      <div class="bookmark-workspace">
        <aside v-if="!bookmark.isMobile" class="bookmark-side-panel">
          <FilterPanel />
        </aside>
        <main class="bookmark-main-panel">
          <ViewPanel />
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

  const bookmark = bookmarkStore();
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
        bookmarks: tagData.bookmarkList?.length || bookmark.bookmarkList.length,
        tags: tagData.relatedTagList?.length || 0,
      });
    }
    if (bookmark.type === 'search') {
      return t('home.searchSummary', {
        keyword: bookmark.bookmarkSearch,
        count: bookmark.bookmarkList.length,
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

  // 处理滚动条滚动到顶部
  const scrollToTop = () => {
    const dom = document.getElementById('view-panel');
    dom?.scrollTo(0, 0);
  };

  // 获取书签列表
  const fetchBookmarkList = async (type: string, params?: Record<string, any>) => {
    const user = useUserStore();
    const res = await apiQueryPost('/api/bookmark/getBookmarkList', {
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
    };
  };

  // 缓存图片:抓取无图标书签的 favicon 落库,并把返回的新图标当次回填到列表,
  // 不必等下次进页面(否则这一屏一直用 TagCard 里 ico.kucat.cn 的临时兜底图)
  const cacheImages = async () => {
    if (!bookmark.bookmarkList?.length) return;
    const currentItems = bookmark.bookmarkList as any[];
    // 只有首次缺图标时显示加载占位；已有图标过期检查时继续展示旧图，后台成功后无感替换。
    const pendingItems = currentItems.filter((item) => item?.id && item?.url && !item.iconUrl);
    pendingItems.forEach((item) => (item.iconLoading = true));
    // 渐进式:只抓无图标的,限并发逐个请求,抓到即回填(不再整批等最慢站一起返回)
    try {
      await loadBookmarkIconsProgressively(currentItems, (id, icon) => {
        const item = currentItems.find((candidate) => candidate.id === id);
        if (item) {
          item.iconUrl = icon;
          item.iconLoading = false;
        }
      });
    } finally {
      pendingItems.forEach((item) => (item.iconLoading = false));
    }
  };

  const watchedRefreshKey = computed(() => bookmark.refreshKey);
  watch(
    () => watchedRefreshKey.value,
    async () => {
      const requestSequence = ++bookmarkRequestSequence;
      const requestType = bookmark.type;
      bookmark.bookmarkList = [];
      if (requestType === 'all') {
        // 请求成功前保持 false，避免把刷新时的临时空数组误判成「新用户没有书签」。
        bookmark.bookmarkAllLoaded = false;
      }
      bookmark.bookmarkLoading = true;
      const loadingStart = Date.now();
      try {
        let result: Awaited<ReturnType<typeof fetchBookmarkList>> = null;
        if (requestType === 'normal') {
          const tag = bookmark.tagList?.find((item) => item.id === route.params?.id);
          bookmark.tagData = tag;
          if (tag) {
            result = await fetchBookmarkList('normal', { tagId: tag.id });
            if (isHomeDrawerLayout.value) {
              bookmark.isFold = true;
            }
          }
        } else if (requestType === 'all') {
          bookmark.tagData = null;
          result = await fetchBookmarkList('all');
        } else if (requestType === 'search' && bookmark.bookmarkSearch) {
          bookmark.tagData = null;
          result = await fetchBookmarkList('search', { value: bookmark.bookmarkSearch });
        } else {
          bookmark.tagData = null;
          bookmark.type = 'all';
          bookmark.refreshData();
          return;
        }

        if (requestSequence !== bookmarkRequestSequence) return;
        if (result) {
          bookmark.bookmarkList = result.items;
          if (requestType === 'all') {
            user.bookmarkTotal = result.total;
            bookmark.bookmarkAllLoaded = true;
          }
        }
        scrollToTop();
        void cacheImages();
      } finally {
        const elapsed = Date.now() - loadingStart;
        if (elapsed < MIN_SKELETON_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_SKELETON_MS - elapsed));
        }
        if (requestSequence === bookmarkRequestSequence) {
          bookmark.bookmarkLoading = false;
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
  function queryTagList(silent = false) {
    if (!silent) bookmark.tagLoading = true;
    const user = useUserStore();
    if (!silent && bookmark.type !== 'normal') {
      bookmark.refreshData();
    }
    apiQueryPost('/api/bookmark/queryTagList', {
      filters: { userId: user.id },
    })
      .then((res) => {
        if (res.status === 200) {
          bookmark.tagList = res.data;
          user.tagTotal = res.data.length;
          if (!silent && bookmark.type === 'normal') {
            bookmark.refreshData();
          }
        }
      })
      .finally(() => {
        if (!silent) bookmark.tagLoading = false;
      });
  }

  const user = useUserStore();
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
    .bookmark-search-action,
    .bookmark-manage-action {
      display: none;
    }

    .bookmark-filter-action,
    .bookmark-add-action {
      flex: 1 1 0;
      width: auto;
    }

    .bookmark-workspace {
      display: block;
    }

    .bookmark-main-panel {
      width: 100%;
      height: 100%;
      overflow: visible;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }

    .bookmark-mobile-filter :deep(.filter-panel),
    .bookmark-mobile-filter :deep(.header-input) {
      width: 100%;
      min-width: 0;
      height: 100%;
    }
  }
</style>
