<template>
  <div class="card-panel-wrap">
    <div v-if="bookmark.bookmarkLoading || (!hasLoaded && !getBookList.length)" class="card-panel skeleton-panel">
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
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-color)">{{ $t('home.noBookmarks') }}</p>
      <p style="margin: 0; font-size: 13px">{{ $t('home.noBookmarksHint') }}</p>
      <button
        data-guide="add-bookmark"
        @click="goAddBookmark"
        style="margin-top: 6px; border: 0; cursor: pointer; color: #fff; background: #615ced; font-size: 14px; padding: 8px 18px; border-radius: 8px"
      >
        {{ $t('home.addBookmark') }}
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
      <span class="beian-copy">{{ $t('landing.copyright') }}</span>
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
  import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
  import RightMenu from '@/components/base/RightMenu.vue';
  import router from '@/router';
  import { useRoute } from 'vue-router';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { copyTextToClipboard } from '@/utils/common.ts';
  import { useI18n } from 'vue-i18n';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { startGuide, guideDone, type GuideStep } from '@/composables/useGuide';
  const bookmark = bookmarkStore();
  const { t } = useI18n();

  const getBookList = computed(() => {
    return bookmark.bookmarkList;
  });

  // 「已加载过」标记:首次进入时 loading 还是 false、列表为空,若直接显示空状态会闪一下"暂无书签";
  // 未加载过时统一显示骨架,只有真加载完(loading 由 true→false)且仍为空才显示空状态。
  const hasLoaded = ref((bookmark.bookmarkList?.length ?? 0) > 0);
  watch(
    () => bookmark.bookmarkLoading,
    (loading, prev) => {
      if (prev && !loading) {
        hasLoaded.value = true;
        maybeStartCreateBookmarkGuide();
      }
    },
  );
  const skeletonCount = computed(() => (bookmark.isMobile ? 8 : 24));

  // 新手引导:桌面 + 书签为空 + 没引导过 → 教用户建第一个书签(跨页面:首页添加按钮 → 编辑页填网址 → 保存)
  const CREATE_BOOKMARK_STEPS: GuideStep[] = [
    { target: '[data-guide="bookmark-mg"]', title: t('guide.cbMgTitle'), content: t('guide.cbMgDesc') },
    { target: '[data-guide="add-bookmark"]', title: t('guide.cbAddTitle'), content: t('guide.cbAddDesc') },
    { target: '[data-guide="bookmark-url"]', title: t('guide.cbUrlTitle'), content: t('guide.cbUrlDesc'), route: '/manage/editBookmark/add' },
    { target: '[data-guide="bookmark-tags"]', title: t('guide.cbTagTitle'), content: t('guide.cbTagDesc'), route: '/manage/editBookmark/add' },
    { target: '[data-guide="bookmark-save"]', title: t('guide.cbSaveTitle'), content: t('guide.cbSaveDesc'), route: '/manage/editBookmark/add' },
    { target: '#nav-tag-entry', title: t('guide.cbNavTitle'), content: t('guide.cbNavDesc') },
  ];
  function maybeStartCreateBookmarkGuide() {
    if (bookmark.isMobile) return; // 移动端入口不同,暂不引导
    if (getBookList.value.length) return; // 有书签不引导
    if (guideDone('create-bookmark')) return; // 一次性,引导过不再弹
    // 与「选默认首页」提示串行:注册后该标记还在(HomeDefaultHint 待处理/正显示)时先不启动,
    // 等它关闭派发 ln:home-default-done 事件后再触发,避免两个引导同时出现、遮罩挡住选择条
    try {
      if (localStorage.getItem('ln_just_registered') === '1') return;
    } catch {
      /* 隐私模式忽略 */
    }
    nextTick(() => startGuide('create-bookmark', CREATE_BOOKMARK_STEPS));
  }
  // 「选默认首页」提示关闭后,轮到建书签引导启动(串行,不与其重叠)
  function onHomeDefaultDone() {
    maybeStartCreateBookmarkGuide();
  }
  onMounted(() => window.addEventListener('ln:home-default-done', onHomeDefaultDone));
  onBeforeUnmount(() => window.removeEventListener('ln:home-default-done', onHomeDefaultDone));

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
        title: t('common.defaultTitle'),
        content: t('home.delBookmarkConfirm', { name: item.name }),
        onOk() {
          apiBasePost('/api/bookmark/delBookmark', {
            id: item.id,
          }).then((res) => {
            if (res.status == 200) {
              message.success(t('common.deleteSuccess'));
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
    // 游客:拖拽库已把本地顺序改了,这里拦截并回滚(重新拉取恢复原序)、弹撞墙引导、不发写请求
    if (blockGuestWrite('bookmark-sort')) {
      bookmark.refreshData();
      return;
    }
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

  // ── 全局搜索「定位」:轮询等目标卡片真渲染出来(切「全部」+加载有延迟,骨架屏期间卡片还不在 DOM),再滚动到它并脉冲高亮,随后 3.5s 或点击任意处消除 ──
  const route = useRoute();
  const locateId = computed(() => String(route.query.locate || ''));
  let retryTimer = 0;
  function runLocate(id: string, attempt = 0) {
    if (locateId.value !== id) return; // 目标已变更/取消
    const el = document.querySelector(`[data-bookmark-id="${id}"]`) as HTMLElement | null;
    // 列表仍加载中 或 卡片尚未渲染 → 重试(最多 ~5s),否则会 scroll 不动
    if (bookmark.bookmarkLoading || !el) {
      if (attempt < 25) retryTimer = window.setTimeout(() => runLocate(id, attempt + 1), 200);
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    let hlTimer = 0;
    const clear = () => {
      if (String(route.query.locate || '') === id) router.replace({ path: '/home', query: {} });
      document.removeEventListener('click', clear, true);
      window.clearTimeout(hlTimer);
    };
    hlTimer = window.setTimeout(clear, 4000);
    // 稍后再挂点击监听,避免被本次跳转残留的点击立即清掉
    window.setTimeout(() => document.addEventListener('click', clear, true), 400);
  }
  watch(
    locateId,
    (id) => {
      window.clearTimeout(retryTimer);
      if (id) runLocate(id);
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
    animation: card-locate-pulse 0.7s ease-in-out 5;
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
