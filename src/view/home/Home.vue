<template>
  <div class="main-page">
    <FilterPanel id="phone-filter-panel" class="phone-filter-panel" />
    <ViewPanel />
  </div>
</template>

<script lang="ts" setup>
  import FilterPanel from '@/view/home/FilterPanel.vue';
  import ViewPanel from '@/view/home/ViewPanel.vue';
  import { computed, nextTick, onMounted, watch } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { useRoute, useRouter } from 'vue-router';

  const bookmark = bookmarkStore();
  const router = useRouter();
  const route = useRoute();
  const MIN_SKELETON_MS = 100;

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

  // 缓存图片
  const cacheImages = async () => {
    if (bookmark.bookmarkList) {
      await apiBasePost(
        '/api/common/analyzeImgUrl',
        bookmark.bookmarkList?.map((data: any) => ({
          url: data.url,
          id: data.id,
          noCache: !data.iconUrl,
        })),
      );
    }
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
            if (bookmark.isMobile) {
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
        await cacheImages();
      } finally {
        const elapsed = Date.now() - loadingStart;
        if (elapsed < MIN_SKELETON_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_SKELETON_MS - elapsed));
        }
        bookmark.bookmarkLoading = false;
      }
    },
    {
      deep: true,
    },
  );

  watch(() => bookmark.refreshTagKey, queryTagList);

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
      if (bookmark.isMobile) {
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
    queryTagList();
  });
</script>

<style lang="less">
  .main-page {
    width: 100%;
    padding: 20px;
    box-sizing: border-box;
    display: flex;
  }
  @media (max-width: 1024px) {
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
