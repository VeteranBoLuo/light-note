<template>
  <div class="main-page">
    <FilterPanel id="phone-filter-panel" class="phone-filter-panel" />
    <ViewPanel />
    <GuestBrowseNudge />
    <HomeDefaultHint />
  </div>
</template>

<script lang="ts" setup>
  import FilterPanel from '@/view/home/FilterPanel.vue';
  import ViewPanel from '@/view/home/ViewPanel.vue';
  import GuestBrowseNudge from '@/components/home/GuestBrowseNudge.vue';
  import HomeDefaultHint from '@/components/home/HomeDefaultHint.vue';
  import { computed, nextTick, onMounted, watch } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { loadBookmarkIconsProgressively } from '@/api/commonApi.ts';
  import { useRoute, useRouter } from 'vue-router';

  const bookmark = bookmarkStore();
  const router = useRouter();
  const route = useRoute();
  const MIN_SKELETON_MS = 100;
  const isHomeDrawerLayout = computed(() => bookmark.isMobile);

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
    if (res.status === 200) {
      bookmark.bookmarkList = res.data.items;
      if (type === 'all') {
        user.bookmarkTotal = res.data.total;
      }
    }
  };

  // 缓存图片:抓取无图标书签的 favicon 落库,并把返回的新图标当次回填到列表,
  // 不必等下次进页面(否则这一屏一直用 TagCard 里 ico.kucat.cn 的临时兜底图)
  const cacheImages = async () => {
    if (!bookmark.bookmarkList?.length) return;
    // 渐进式:只抓无图标的,限并发逐个请求,抓到即回填(不再整批等最慢站一起返回)
    await loadBookmarkIconsProgressively(bookmark.bookmarkList as any, (id, icon) => {
      const b: any = bookmark.bookmarkList.find((x: any) => x.id === id);
      if (b) b.iconUrl = icon;
    });
  };

  const watchedRefreshKey = computed(() => bookmark.refreshKey);
  watch(
    () => watchedRefreshKey.value,
    async () => {
      bookmark.bookmarkList = [];
      bookmark.bookmarkLoading = true;
      const loadingStart = Date.now();
      try {
        if (bookmark.type === 'normal') {
          const tag = bookmark.tagList?.find((item) => item.id === route.params?.id);
          bookmark.tagData = tag;
          if (tag) {
            await fetchBookmarkList('normal', { tagId: tag.id });
            if (isHomeDrawerLayout.value) {
              bookmark.isFold = true;
            }
          }
        } else if (bookmark.type === 'all') {
          bookmark.tagData = null;
          await fetchBookmarkList('all');
        } else if (bookmark.type === 'search' && bookmark.bookmarkSearch) {
          bookmark.tagData = null;
          await fetchBookmarkList('search', { value: bookmark.bookmarkSearch });
        } else {
          bookmark.tagData = null;
          bookmark.type = 'all';
          bookmark.refreshData();
        }
        scrollToTop();
        cacheImages();
      } finally {
        const elapsed = Date.now() - loadingStart;
        if (elapsed < MIN_SKELETON_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_SKELETON_MS - elapsed));
        }
        bookmark.bookmarkLoading = false;
      }
    },
  );

  watch(() => bookmark.refreshTagKey, queryTagList);

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

  // 查询标签列表
  function queryTagList() {
    bookmark.tagLoading = true;
    const user = useUserStore();
    if (bookmark.type !== 'normal') {
      bookmark.refreshData();
    }
    apiQueryPost('/api/bookmark/queryTagList', {
      filters: { userId: user.id },
    })
      .then((res) => {
        if (res.status === 200) {
          bookmark.tagList = res.data;
          user.tagTotal = res.data.length;
          if (bookmark.type === 'normal') {
            bookmark.refreshData();
          }
        }
      })
      .finally(() => {
        bookmark.tagLoading = false;
      });
  }

  watch(
    () => bookmark.isFold,
    (val) => {
      const filter: any = document.getElementById('phone-filter-panel');
      if (isHomeDrawerLayout.value) {
        filter.style.transition = 'all 0.3s';
        if (val) {
          filter.style.transform = 'translateX(-100%)';
        } else {
          filter.style.transform = 'translateX(0)';
        }
      }
    },
  );

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
    }
    if (bookmark.tagList.length) {
      bookmark.refreshData();
    } else {
      queryTagList();
    }
  });
</script>

<style lang="less">
  .main-page {
    width: 100%;
    padding: 20px;
    box-sizing: border-box;
    display: flex;
  }

  @media (max-width: 767px) {
    .main-page {
      padding: 20px 0;
      display: flex;
    }

    .phone-filter-panel {
      box-sizing: border-box;
      width: 100%;
      background-color: var(--background-color);
      z-index: 10;
      position: absolute;
      transform: translateX(-100%);
    }
  }
</style>
