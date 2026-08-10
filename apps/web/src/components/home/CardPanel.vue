<template>
  <div class="card-panel-wrap" :data-mobile-resource-scroll="bookmark.isMobile ? '' : null">
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
    <div v-else-if="!getBookList.length" class="bookmark-empty-state">
      <span class="bookmark-empty-icon">
        <SvgIcon :src="icon.resource.bookmark" size="28" />
      </span>
      <!-- 区分「搜索无命中」与「新用户没数据」:搜索场景显示"新用户空态+添加书签"会造成数据丢失错觉 -->
      <template v-if="searchKeyword">
        <strong>{{ $t('home.noSearchMatch', { kw: searchKeyword }) }}</strong>
        <BButton type="primary" class="empty-add-button" @click="router.push('/home')">
          {{ $t('home.clearSearch') }}
        </BButton>
      </template>
      <template v-else>
        <strong>{{ $t('home.noBookmarks') }}</strong>
        <p>{{ $t('home.noBookmarksHint') }}</p>
        <BButton type="primary" class="empty-add-button" @click="goAddBookmark">
          {{ $t('home.addBookmark') }}
        </BButton>
      </template>
    </div>
    <VueDraggable
      v-else
      :animation="200"
      :disabled="
        bookmark.isMobile ||
        bookmark.type !== 'all' ||
        bookmark.bookmarkLoading ||
        bookmark.bookmarkLoadingMore ||
        bookmark.bookmarkList.length < 2
      "
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
        class="bookmark-card-wrap"
        :class="{
          'card-locate-hl': locateId === item.id,
          'bookmark-card-wrap--selected': batchMode && selectedIds.includes(String(item.id)),
        }"
      >
        <BCheckbox
          v-if="batchMode"
          class="bookmark-card-checkbox"
          :checked="selectedIds.includes(String(item.id))"
          :aria-label="item.name"
          @update:checked="emit('toggle-selection', String(item.id))"
        />
        <RightMenu v-if="!batchMode" :menu="menuFor(item)" @select="rightMenuClick($event, item)">
          <TagCard :cardInfo="item" />
        </RightMenu>
        <TagCard
          v-else
          :cardInfo="item"
          selection-mode
          :selected="selectedIds.includes(String(item.id))"
          @select="emit('toggle-selection', String(item.id))"
        />
      </div>
    </VueDraggable>
    <div
      v-show="bookmark.bookmarkHasMore || bookmark.bookmarkLoadingMore"
      ref="loadMoreSentinel"
      class="bookmark-load-sentinel"
      aria-live="polite"
    >
      <BLoading v-if="bookmark.bookmarkLoadingMore" inline loading :title="$t('common.loading')" />
      <BButton v-else size="small" @click="emit('load-more')">{{ $t('common.loadMore') }}</BButton>
    </div>
    <div class="beian-wrap">
      <span class="beian-copy">{{ $t('landing.copyright') }}</span>
      <span class="beian-separator">|</span>
      <span>{{ $t('landing.websiteFilingName', { name: WEBSITE_FILING_NAME }) }}</span>
      <span class="beian-separator">|</span>
      <a class="icp-beian-link" :href="MIIT_QUERY_URL" target="_blank" rel="noopener noreferrer">
        {{ $t('landing.websiteIcpNumber', { number: WEBSITE_ICP_NUMBER }) }}
      </a>
      <template v-if="hasPublicSecurityFiling">
        <span class="beian-separator">|</span>
        <a class="icp-beian-link" :href="PUBLIC_SECURITY_QUERY_URL" target="_blank" rel="noopener noreferrer">
          {{ PUBLIC_SECURITY_FILING_NUMBER }}
        </a>
      </template>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { VueDraggable } from 'vue-draggable-plus';
  import TagCard from '@/components/home/TagCard.vue';
  import { bookmarkStore } from '@/store';
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import RightMenu from '@/components/base/RightMenu.vue';
  import router from '@/router';
  import { useRoute } from 'vue-router';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import {
    MIIT_QUERY_URL,
    PUBLIC_SECURITY_FILING_NUMBER,
    PUBLIC_SECURITY_QUERY_URL,
    WEBSITE_FILING_NAME,
    WEBSITE_ICP_NUMBER,
    hasPublicSecurityFiling,
  } from '@/config/siteCompliance.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { copyTextToClipboard } from '@/utils/common.ts';
  import { useI18n } from 'vue-i18n';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { useInboxEnqueue } from '@/composables/useInboxEnqueue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import { buildResourceSortMove, hasResourceOrderChanged } from '@/utils/resourcePagination';
  import { openAiAssistant } from '@/utils/aiEntry';
  const bookmark = bookmarkStore();
  const route = useRoute();
  const { t } = useI18n();
  const { addResourcesToInbox, removeResourcesFromInbox } = useInboxEnqueue();
  withDefaults(
    defineProps<{
      batchMode?: boolean;
      selectedIds?: string[];
    }>(),
    {
      batchMode: false,
      selectedIds: () => [],
    },
  );
  const emit = defineEmits<{
    'load-more': [];
    'toggle-selection': [id: string];
  }>();
  const loadMoreSentinel = ref<HTMLElement | null>(null);
  const isDragging = ref(false);
  let loadMoreObserver: IntersectionObserver | null = null;

  function requestNextPageIfVisible() {
    if (isDragging.value || !bookmark.bookmarkHasMore || bookmark.bookmarkLoading || bookmark.bookmarkLoadingMore) {
      return;
    }
    const sentinel = loadMoreSentinel.value;
    const root = sentinel?.closest<HTMLElement>('[data-mobile-resource-scroll]');
    if (!sentinel || !root) return;
    const sentinelRect = sentinel.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    if (sentinelRect.top <= rootRect.bottom + 360) emit('load-more');
  }

  async function setupLoadMoreObserver() {
    loadMoreObserver?.disconnect();
    await nextTick();
    const sentinel = loadMoreSentinel.value;
    const root = sentinel?.closest<HTMLElement>('[data-mobile-resource-scroll]');
    if (!sentinel || !root) return;
    loadMoreObserver = new IntersectionObserver(
      (entries) => {
        if (!isDragging.value && entries.some((entry) => entry.isIntersecting)) emit('load-more');
      },
      { root, rootMargin: '0px 0px 360px', threshold: 0 },
    );
    loadMoreObserver.observe(sentinel);
    requestNextPageIfVisible();
  }

  onMounted(setupLoadMoreObserver);
  watch(
    () => [bookmark.isMobile, bookmark.bookmarkList.length, bookmark.bookmarkHasMore],
    () => {
      void setupLoadMoreObserver();
    },
  );
  watch(
    () => bookmark.bookmarkLoading,
    (loading) => {
      if (!loading) requestNextPageIfVisible();
    },
  );
  onBeforeUnmount(() => loadMoreObserver?.disconnect());

  const getBookList = computed(() => {
    return bookmark.bookmarkList;
  });
  // 书签搜索路由 /home/search/:value —— 用于空态区分"搜索无命中"与"真没有书签"
  const searchKeyword = computed(() => String(route.params.value || '').trim());

  // 「已加载过」标记:首次进入时 loading 还是 false、列表为空,若直接显示空状态会闪一下"暂无书签";
  // 未加载过时统一显示骨架,只有真加载完(loading 由 true→false)且仍为空才显示空状态。
  const hasLoaded = ref((bookmark.bookmarkList?.length ?? 0) > 0);
  watch(
    () => bookmark.bookmarkLoading,
    (loading, prev) => {
      if (prev && !loading) {
        hasLoaded.value = true;
      }
    },
  );
  const skeletonCount = computed(() => (bookmark.isMobile ? 8 : 24));

  // 首屏空状态引导:书签为空(含 seed 失败兜底)时引导添加第一个,而非一片空白
  function goAddBookmark() {
    router.push('/manage/editBookmark/add');
  }

  function menuFor(item: any) {
    return [
      {
        key: 'toggleTop',
        label: item.isTop ? t('common.unpin') : t('common.pin'),
        icon: item.isTop ? icon.contextMenu.unpin : icon.contextMenu.pin,
      },
      { key: 'edit', label: t('common.edit'), icon: icon.table_edit },
      { key: 'copyLink', label: t('common.copyLink'), icon: icon.cloudSpace.preview.copy },
      { key: 'generateNote', label: t('ai.generateNoteFromBookmark'), icon: icon.ai.ask },
      {
        key: 'toggleInbox',
        label: item.isPending ? t('inbox.removeExisting') : t('inbox.addExisting'),
        icon: icon.contextMenu.inbox,
      },
      { key: 'bookmark-actions-divider', divider: true },
      { key: 'delete', label: t('common.delete'), icon: icon.table_delete, danger: true },
    ];
  }

  function rightMenuClick(action: string, item: any) {
    const actionLabel = menuFor(item).find((menuItem: any) => menuItem.key === action)?.label || action;
    recordOperation({ module: '首页', operation: `右键${actionLabel}书签【${item.name}】` });
    if (action === 'toggleTop') {
      apiBasePost('/api/bookmark/toggleBookmarkTop', { id: item.id }).then((res) => {
        if (res.status === 200) {
          message.success(res.data?.isTop ? t('common.pinned') : t('common.unpinned'));
          bookmark.refreshData();
        }
      });
      return;
    }
    if (action === 'copyLink') {
      copyTextToClipboard(item.url);
      message.success(t('common.linkCopied'));
      return;
    }
    if (action === 'generateNote') {
      openAiAssistant({
        contextRefs: [{ type: 'bookmark', id: String(item.id), title: String(item.name || item.url || '') }],
        suggestedIntent: 'create_note',
        surface: 'bookmark_manage',
      });
      return;
    }
    if (action === 'toggleInbox') {
      const resource = [{ resourceType: 'bookmark' as const, resourceId: String(item.id) }];
      const operation = item.isPending
        ? removeResourcesFromInbox(resource, '书签')
        : addResourcesToInbox(resource, '书签');
      void operation.then((ok) => {
        if (ok) item.isPending = !item.isPending;
      });
      return;
    }
    if (action === 'edit') {
      router.push({ path: `/manage/editBookmark/${item.id}` });
      return;
    }
    if (action === 'delete') {
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
  let dragSnapshot: any[] = [];
  let draggedBookmarkId = '';

  const sortPinnedFirst = (items: any[]) =>
    [...items].sort((left: any, right: any) => Number(Boolean(right.isTop)) - Number(Boolean(left.isTop)));

  const onDragStart = (event?: { oldIndex?: number }) => {
    document.body.classList.add('drag-active');
    isDragging.value = true;
    dragSnapshot = [...bookmark.bookmarkList];
    const oldIndex = Number(event?.oldIndex);
    draggedBookmarkId = Number.isInteger(oldIndex) ? String(dragSnapshot[oldIndex]?.id || '') : '';
  };

  async function onEnd() {
    document.body.classList.remove('drag-active');
    const source = dragSnapshot.length ? dragSnapshot : [...bookmark.bookmarkList];
    try {
      // 游客:拖拽库已把本地顺序改了,这里拦截并回滚、弹撞墙引导、不发写请求。
      if (blockGuestWrite('bookmark-sort')) {
        bookmark.bookmarkList = source;
        bookmark.refreshData();
        return;
      }

      // 置顶书签始终在普通书签之前；组内保留本次拖拽结果。
      const reordered = sortPinnedFirst(bookmark.bookmarkList);
      bookmark.bookmarkList = reordered;
      const moved = reordered.find((item: any) => String(item.id) === draggedBookmarkId);
      if (!moved) {
        bookmark.bookmarkList = source;
        return;
      }

      const sameGroup = (item: any) => Boolean(item.isTop) === Boolean(moved.isTop);
      const beforeGroup = sortPinnedFirst(source).filter(sameGroup);
      const afterGroup = reordered.filter(sameGroup);
      if (!hasResourceOrderChanged(beforeGroup, afterGroup)) return;

      const move = buildResourceSortMove(
        reordered,
        draggedBookmarkId,
        (candidate: any, target: any) => Boolean(candidate.isTop) === Boolean(target.isTop),
      );
      if (!move) {
        bookmark.bookmarkList = source;
        return;
      }

      const res = await apiBasePost('/api/bookmark/updateBookmarkSort', { move });
      if (res.status !== 200) {
        bookmark.bookmarkList = source;
        bookmark.refreshData();
      }
    } catch (error) {
      bookmark.bookmarkList = source;
      bookmark.refreshData();
      console.error('Error updating bookmark sort:', error);
    } finally {
      isDragging.value = false;
      dragSnapshot = [];
      draggedBookmarkId = '';
      requestNextPageIfVisible();
    }
  }

  // ── 全局搜索「定位」:轮询等目标卡片真渲染出来(切「全部」+加载有延迟,骨架屏期间卡片还不在 DOM),再滚动到它并脉冲高亮,随后 3.5s 或点击任意处消除 ──
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
  watch(
    () => (locateId.value ? bookmark.bookmarkList.some((item: any) => String(item.id) === locateId.value) : false),
    (isPresent) => {
      if (!isPresent || !locateId.value) return;
      window.clearTimeout(retryTimer);
      runLocate(locateId.value);
    },
  );
</script>

<style lang="less" scoped>
  .card-panel-wrap {
    --bookmark-card-min-width: 260px;

    min-height: 100%;
    display: flex;
    flex-direction: column;
    container-type: inline-size;

    @supports (width: 1cqi) {
      --bookmark-card-min-width: clamp(260px, 15cqi, 360px);
    }
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
    margin-top: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--bookmark-card-min-width), 1fr));
    padding: 16px;
    gap: 14px;
    align-content: start;
  }
  .bookmark-card-wrap {
    position: relative;
    min-width: 0;
  }
  .bookmark-card-checkbox {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 4;
  }
  .bookmark-card-wrap--selected :deep(.card-body) {
    border-color: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 64%, var(--card-border-color));
    background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 6%, var(--card-background));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--resource-bookmark-color, #615ced) 18%, transparent);
  }

  .bookmark-load-sentinel {
    min-height: 24px;
    padding: 8px 16px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bookmark-empty-state {
    min-height: 300px;
    padding: 48px 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--desc-color);
    text-align: center;
  }

  .bookmark-empty-icon {
    width: 54px;
    height: 54px;
    margin-bottom: 4px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--resource-bookmark-color, #615ced);
    background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 10%, var(--menu-body-bg-color));
  }

  .bookmark-empty-state strong {
    color: var(--text-color);
    font-size: 16px;
  }

  .bookmark-empty-state p {
    margin: 0;
    font-size: 13px;
  }

  .empty-add-button {
    margin-top: 6px;
  }
  .skeleton-panel {
    margin-top: 0;
  }
  .card-skeleton {
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    height: 150px;
    border-radius: 1rem;
    padding: 14px;
    box-sizing: border-box;
    background: var(--card-background);
    position: relative;
    overflow: hidden;
    box-shadow: none;
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
    content-visibility: auto;
    contain-intrinsic-size: 164px;
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
      gap: 12px;
      padding: 0 12px;
    }
  }
  @media (max-width: 1000px) {
    .card-panel {
      justify-content: center;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
      padding: 12px;
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
    .card-panel-wrap {
      height: 0;
      min-height: 0;
      flex: 1 1 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior-y: contain;
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
    }

    .card-panel {
      grid-template-columns: minmax(0, 1fr);
      padding: 2px 2px 12px;
      gap: 12px;
    }

    .beian-wrap {
      padding: 14px 12px 10px;
      font-size: 11px;
      gap: 6px;
    }
  }

  @media (min-width: 520px) and (max-width: 767px) {
    .card-panel {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
