<template>
  <div class="card-panel-wrap">
    <div v-if="bookmark.bookmarkLoading" class="card-panel skeleton-panel">
      <div v-for="n in skeletonCount" :key="n" class="card-skeleton">
        <div class="skeleton-title">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-line short"></div>
        </div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-tags">
          <div class="skeleton-chip"></div>
          <div class="skeleton-chip"></div>
        </div>
      </div>
    </div>
    <div
      v-else-if="!getBookList.length"
      style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 64px 20px; text-align: center; color: var(--text-second-color, #888)"
    >
      <div style="font-size: 44px; opacity: 0.7">🔖</div>
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-color)">这里还没有书签</p>
      <p style="margin: 0; font-size: 13px">把常用网站收进来，一处收纳、随处可开</p>
      <button
        @click="goAddBookmark"
        style="margin-top: 6px; border: 0; cursor: pointer; color: #fff; background: #615ced; font-size: 14px; padding: 8px 18px; border-radius: 8px"
      >
        + 添加书签
      </button>
    </div>
    <VueDraggable
      v-else
      :animation="200"
      :disabled="bookmark.isMobile"
      ref="el"
      v-model="bookmark.bookmarkList"
      class="card-panel"
      id="card-panel"
      @start="onDragStart"
      @end="onEnd"
      :scroll-sensitivity="50"
      :forceFallback="true"
      :delay="50"
    >
      <div
        v-for="item in getBookList"
        :key="item.id"
        :data-bookmark-id="item.id"
        :class="{ 'card-locate-hl': locateId === item.id }"
      >
        <RightMenu :menu="menuFor(item)" @select="rightMenuClick($event, item)">
          <TagCard :cardInfo="item" />
        </RightMenu>
      </div>
    </VueDraggable>
    <div class="beian-wrap">
      <span class="beian-copy">© 2024轻笺</span>
      <span class="beian-separator">|</span>
      <a class="icp-beian-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
        网站备案号：蜀ICP备2026017699号-1
      </a>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { VueDraggable } from 'vue-draggable-plus';
  import TagCard from '@/components/home/TagCard.vue';
  import { bookmarkStore } from '@/store';
  import { computed, nextTick, watch } from 'vue';
  import RightMenu from '@/components/base/RightMenu.vue';
  import router from '@/router';
  import { useRoute } from 'vue-router';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { copyTextToClipboard } from '@/utils/common.ts';
  import { useI18n } from 'vue-i18n';
  const bookmark = bookmarkStore();
  const { t } = useI18n();

  const getBookList = computed(() => {
    return bookmark.bookmarkList;
  });
  const skeletonCount = computed(() => (bookmark.isMobile ? 8 : 24));

  // 首屏空状态引导:书签为空(含 seed 失败兜底)时引导添加第一个,而非一片空白
  function goAddBookmark() {
    router.push('/manage/editBookmark/add');
  }

  function menuFor(item: any) {
    return [item.isTop ? t('common.unpin') : t('common.pin'), t('common.edit'), t('common.copyLink'), t('common.delete')];
  }

  function rightMenuClick(type, item) {
    recordOperation({ module: '首页', operation: `右键${type}书签【${item.name}】` });
    if (type === t('common.pin') || type === t('common.unpin')) {
      apiBasePost('/api/bookmark/toggleBookmarkTop', { id: item.id }).then((res) => {
        if (res.status === 200) {
          message.success(res.data?.isTop ? t('common.pinned') : t('common.unpinned'));
          bookmark.refreshData();
        }
      });
      return;
    }
    if (type === t('common.copyLink')) {
      copyTextToClipboard(item.url);
      message.success(t('common.linkCopied'));
      return;
    }
    if (type === t('common.edit')) {
      router.push({ path: `/manage/editBookmark/${item.id}` });
    } else {
      Alert.alert({
        title: '提示',
        content: `请确认是否要删除书签【${item.name}】？`,
        onOk() {
          apiBasePost('/api/bookmark/delBookmark', {
            id: item.id,
          }).then((res) => {
            if (res.status == 200) {
              message.success('删除成功');
              bookmark.refreshData();
            }
          });
        },
      });
    }
  }
  const onDragStart = () => {
    document.body.classList.add('drag-active');
  };

  async function onEnd() {
    document.body.classList.remove('drag-active');
    try {
      // 拖拽即时归位:置顶书签始终浮回顶部(按 isTop 稳定排序,组内保持拖拽后的顺序),再持久化 sort
      const reordered = [...bookmark.bookmarkList].sort((a: any, b: any) => (b.isTop ? 1 : 0) - (a.isTop ? 1 : 0));
      bookmark.bookmarkList = reordered;
      const sortedTags = reordered.map((bm: any, index: number) => ({ sort: index, id: bm.id }));
      await apiBasePost('/api/bookmark/updateBookmarkSort', { bookmarks: sortedTags });
    } catch (error) {
      console.error('Error updating bookmark sort:', error);
    }
  }

  // ── 全局搜索「定位」:目标书签进入列表后滚动到它并短暂高亮,随后 3.5s 或点击任意处消除(清 url query) ──
  const route = useRoute();
  const locateId = computed(() => String(route.query.locate || ''));
  watch(
    [() => bookmark.bookmarkList, locateId],
    async () => {
      const id = locateId.value;
      if (!id || !bookmark.bookmarkList?.some((b: any) => b.id === id)) return;
      await nextTick();
      const el = document.querySelector(`[data-bookmark-id="${id}"]`) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      let timer = 0;
      const clear = () => {
        if (String(route.query.locate || '') === id) router.replace({ path: '/home', query: {} });
        document.removeEventListener('click', clear, true);
        window.clearTimeout(timer);
      };
      timer = window.setTimeout(clear, 3500);
      // 稍后再挂点击监听,避免被本次跳转残留的点击立即清掉
      window.setTimeout(() => document.addEventListener('click', clear, true), 150);
    },
    { immediate: true },
  );
</script>

<style lang="less" scoped>
  .card-panel-wrap {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* 定位高亮:被全局搜索定位到的书签卡片,脉冲描边几下引导视线 */
  .card-locate-hl {
    border-radius: 14px;
    animation: card-locate-pulse 1s ease-in-out 3;
  }
  @keyframes card-locate-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
    50% {
      box-shadow: 0 0 0 3px var(--resource-bookmark-color);
    }
  }

  .card-panel {
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    padding: 0 16px;
    gap: 20px;
    align-content: start;
  }
  .skeleton-panel {
    margin-top: 16px;
  }
  .card-skeleton {
    border: 1px solid var(--card-border-color);
    height: 150px;
    border-radius: 1rem;
    padding: 14px;
    box-sizing: border-box;
    background: var(--background-color);
    position: relative;
    overflow: hidden;
    box-shadow: var(--ant-table-boxShadow);
  }
  .card-skeleton::after {
    content: '';
    position: absolute;
    top: 0;
    left: -60%;
    width: 60%;
    height: 100%;
    background: linear-gradient(90deg, transparent, var(--skeleton-body-bg-color), transparent);
    animation: skeleton-shine 1.2s infinite;
  }
  .skeleton-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .skeleton-avatar {
    width: 24px;
    height: 24px;
    border-radius: 8px;
    background: rgba(120, 120, 120, 0.18);
  }
  .skeleton-line {
    height: 10px;
    border-radius: 6px;
    background: rgba(120, 120, 120, 0.18);
    margin-bottom: 8px;
  }
  .skeleton-line.short {
    width: 120px;
  }
  .skeleton-tags {
    display: flex;
    gap: 8px;
    position: absolute;
    bottom: 14px;
    left: 14px;
  }
  .skeleton-chip {
    width: 50px;
    height: 16px;
    border-radius: 8px;
    background: rgba(120, 120, 120, 0.18);
  }
  :global(body.drag-active) {
    .card-panel {
      cursor: grabbing;
    }
  }
  .card-panel > div {
    min-width: 0;
  }
  @keyframes skeleton-shine {
    0% {
      left: -60%;
    }
    100% {
      left: 120%;
    }
  }
  @media (max-width: 1200px) {
    .card-panel {
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
      padding: 0 12px;
    }
  }
  @media (max-width: 1000px) {
    .card-panel {
      justify-content: center;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 14px;
      padding: 0 20px;
    }
  }
  .panel-loading {
    :deep(.loading) {
      top: 40% !important;
    }
  }

  .beian-wrap {
    margin-top: auto;
    padding: 18px 16px 12px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
    color: var(--text-second-color);
    opacity: 0.58;
    font-size: 12px;
    line-height: 1.3;
  }

  .icp-beian-link {
    color: inherit;
    text-decoration: none;
  }

  .beian-copy,
  .beian-separator {
    color: inherit;
  }

  .icp-beian-link:hover {
    opacity: 0.82;
  }

  @media (max-width: 768px) {
    .beian-wrap {
      padding: 14px 12px 10px;
      font-size: 11px;
      gap: 6px;
    }
  }
</style>
