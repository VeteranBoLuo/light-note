<template>
  <div v-if="isSearchAvailable" class="global-search" :class="{ 'global-search--mobile': bookmark.isMobile }">
    <div
      v-if="!bookmark.isMobile"
      class="global-search-box"
      :class="{ 'global-search-box--open': suggestVisible }"
      ref="searchBoxRef"
      @mousedown="handleSearchBoxMouseDown"
      @keydown="onKeydown"
    >
      <b-input
        id="global-search-input"
        v-model:value="keyword"
        :placeholder="placeholder"
        height="36px"
        @focus="openSuggest"
        @input="handleInput"
        @enter="onEnter"
      >
        <template #prefix>
          <svg-icon :src="icon.navigation.search" size="16" />
        </template>
        <template #suffix>
          <button v-if="keyword" class="clear-btn" :title="t('resourceCenter.clear')" @mousedown.prevent="clearKeyword"
            >×</button
          >
          <span v-else class="shortcut">/</span>
        </template>
      </b-input>

      <div v-if="suggestVisible" class="suggest-panel">
        <div class="suggest-head">
          <div>
            <div class="suggest-title">{{ t('resourceCenter.title') }}</div>
            <div class="suggest-subtitle">{{ t('resourceCenter.suggestSubtitle') }}</div>
          </div>
        </div>

        <div v-if="loading" class="suggest-loading">
          <div v-for="n in 4" :key="n" class="sk-line"></div>
        </div>

        <template v-else-if="suggestGroups.length">
          <div v-for="group in suggestGroups" :key="group.type" class="suggest-group">
            <div class="group-label">{{ getGroupLabel(group.type) }}</div>
            <button
              v-for="item in group.items"
              :key="`${item.type}-${item.id}`"
              class="suggest-item"
              :class="{ 'suggest-item--active': isActiveItem(item) }"
              @mousedown.prevent="openItem(item)"
              v-click-log="{ module: '全局搜索', operation: `打开搜索建议【${item.type}:${item.title}】` }"
            >
              <span class="type-dot" :class="`type-dot--${item.type}`"></span>
              <span class="item-main">
                <span class="item-title-row">
                  <span class="item-title" v-html="highlightText(item.title, keyword)"></span>
                  <span v-if="item.tags && item.tags.length" class="item-tags">
                    <span
                      v-for="tg in item.tags"
                      :key="tg.id"
                      class="item-tag"
                      :class="{ 'item-tag--hit': isTagHit(tg.name) }"
                      >#{{ tg.name }}</span
                    >
                  </span>
                </span>
                <span class="item-desc" v-html="highlightText(item.description || item.extra, keyword)"></span>
              </span>
              <span class="item-extra">
                <span
                  v-if="item.type === 'bookmark'"
                  class="locate-btn"
                  :title="t('resourceCenter.locate')"
                  @mousedown.prevent.stop="locateItem(item)"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7" /><path d="M12 1.5v3.5M12 19v3.5M1.5 12h3.5M19 12h3.5" /></svg>
                </span>
                {{ item.extra }}
              </span>
            </button>
          </div>
          <button class="view-all" @mousedown.prevent="goSearch">{{ t('resourceCenter.viewAll') }}</button>
        </template>

        <div v-else class="suggest-empty">
          <div class="empty-title">{{ keyword ? t('resourceCenter.noMatch') : t('resourceCenter.startSearch') }}</div>
          <div class="empty-desc">{{ t('resourceCenter.emptyDesc') }}</div>
        </div>
      </div>
    </div>

    <button
      v-else
      class="mobile-search-trigger"
      @click="openMobileSearch"
      v-click-log="{ module: '全局搜索', operation: '打开移动端搜索' }"
    >
      <svg-icon size="16" :src="icon.navigation.search" />
      <span class="mobile-search-placeholder">{{ t('resourceCenter.mobileTrigger') }}</span>
    </button>

    <Teleport v-if="bookmark.isMobile" to="body">
      <div v-if="mobileVisible" class="mobile-search-layer">
        <div class="mobile-search-header">
          <b-input
            id="global-mobile-search-input"
            v-model:value="keyword"
            :placeholder="t('resourceCenter.searchPlaceholder')"
            height="40px"
            @input="handleInput"
            @enter="goSearch"
          >
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
          <button class="mobile-cancel" @click="mobileVisible = false">{{ t('resourceCenter.cancel') }}</button>
        </div>

        <div class="mobile-search-body">
          <div v-if="loading" class="suggest-loading">
            <div v-for="n in 5" :key="n" class="sk-line"></div>
          </div>
          <template v-else-if="suggestGroups.length">
            <div v-for="group in suggestGroups" :key="group.type" class="suggest-group">
              <div class="group-label">{{ getGroupLabel(group.type) }}</div>
              <button
                v-for="item in group.items"
                :key="`${item.type}-${item.id}`"
                class="suggest-item"
                @click="openItem(item)"
                v-click-log="{ module: '全局搜索', operation: `打开搜索建议【${item.type}:${item.title}】` }"
              >
                <span class="type-dot" :class="`type-dot--${item.type}`"></span>
                <span class="item-main">
                  <span class="item-title-row">
                    <span class="item-title" v-html="highlightText(item.title, keyword)"></span>
                    <span v-if="item.tags && item.tags.length" class="item-tags">
                      <span
                        v-for="tg in item.tags"
                        :key="tg.id"
                        class="item-tag"
                        :class="{ 'item-tag--hit': isTagHit(tg.name) }"
                        >#{{ tg.name }}</span
                      >
                    </span>
                  </span>
                  <span class="item-desc" v-html="highlightText(item.description || item.extra, keyword)"></span>
                </span>
              </button>
            </div>
            <button class="view-all" @click="goSearch">{{ t('resourceCenter.viewAll') }}</button>
          </template>
          <div v-else class="suggest-empty">
            <div class="empty-title">{{
              keyword ? t('resourceCenter.noMatch') : t('resourceCenter.mobileEmptyTitle')
            }}</div>
            <div class="empty-desc">{{ t('resourceCenter.mobileEmptyDesc') }}</div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { bookmarkStore } from '@/store';
  import { fetchGlobalSearch, SearchGroup, SearchResultItem, SearchType } from '@/api/search.ts';
  import { getSearchTypeLabel } from '@/components/searchCenter/searchMeta.ts';
  import { rankByRelevance } from '@/components/searchCenter/searchUtils.ts';
  import { useI18n } from 'vue-i18n';
  import { GLOBAL_SEARCH_HIDDEN_ROUTE_NAMES } from '@/config/navigation.ts';
  import { recordOperation } from '@/api/commonApi.ts';

  const router = useRouter();
  const route = useRoute();

  // 命中词高亮:先转义防 XSS,再把命中词包 <mark>
  function escapeHtml(input: string): string {
    return String(input ?? '').replace(
      /[&<>"']/g,
      (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<string, string>)[c],
    );
  }
  function highlightText(text: string, kw: string): string {
    const safe = escapeHtml(text);
    const k = String(kw || '').trim();
    if (!k) return safe;
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="gs-hl">$1</mark>');
  }
  function isTagHit(name: string): boolean {
    const k = String(keyword.value || '')
      .trim()
      .toLowerCase();
    return !!k && String(name || '').toLowerCase().includes(k);
  }
  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const keyword = ref('');
  const loading = ref(false);
  const suggestVisible = ref(false);
  const mobileVisible = ref(false);
  const searchBoxRef = ref<HTMLElement | null>(null);
  const suggestGroups = ref<SearchGroup[]>([]);
  const searchTimer = ref<number | null>(null);
  let requestSeq = 0;

  const routeName = computed(() => String(route.name || ''));
  const isSearchAvailable = computed(() => !GLOBAL_SEARCH_HIDDEN_ROUTE_NAMES.includes(routeName.value));
  const placeholder = computed(() =>
    route.path.includes('/search') ? t('resourceCenter.continueSearch') : t('resourceCenter.searchPlaceholder'),
  );

  function getGroupLabel(type: string) {
    if (['bookmark', 'note', 'file', 'tag'].includes(type)) {
      return getSearchTypeLabel(t, type as SearchType);
    }
    return getSearchTypeLabel(t, 'all');
  }

  async function ensureData(force = false) {
    const seq = ++requestSeq;
    loading.value = true;
    try {
      // 每类多取 10 条,前端按匹配度重排后切前 3——精确/前缀匹配才能稳定进前排
      // (后端按 sort/时间排,只取 3 条会把精确匹配挤掉)
      const res = await fetchGlobalSearch(keyword.value, 10, force);
      if (seq === requestSeq) {
        suggestGroups.value = res.groups.map((group) => ({
          ...group,
          items: rankByRelevance(group.items, keyword.value).slice(0, 3),
        }));
      }
    } finally {
      if (seq === requestSeq) {
        loading.value = false;
      }
    }
  }

  function scheduleSearch() {
    if (searchTimer.value) clearTimeout(searchTimer.value);
    searchTimer.value = window.setTimeout(() => ensureData(), 220);
  }

  function openSuggest() {
    if (suggestVisible.value) return;
    suggestVisible.value = true;
    window.dispatchEvent(new CustomEvent('light-note:close-ai')); // 与 AI 助手互斥:展开搜索下拉即收起 AI 面板
    ensureData(true);
  }

  // 打开 AI 助手时收起本搜索下拉(双向互斥,避免两个大浮层重叠遮挡)
  const handleCloseSearch = () => {
    suggestVisible.value = false;
    blurDesktopInput();
  };

  function blurDesktopInput() {
    (document.getElementById('global-search-input') as HTMLInputElement | null)?.blur();
  }

  function closeDesktopSuggest() {
    suggestVisible.value = false;
    blurDesktopInput();
  }

  function handleSearchBoxMouseDown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('.suggest-panel')) return;
    if (!suggestVisible.value) openSuggest();
  }

  function openMobileSearch() {
    mobileVisible.value = true;
    ensureData(true);
    nextTick(() => document.getElementById('global-mobile-search-input')?.focus());
  }

  function handleInput() {
    if (!suggestVisible.value) suggestVisible.value = true;
    scheduleSearch();
  }

  function clearKeyword() {
    keyword.value = '';
    nextTick(() => document.getElementById('global-search-input')?.focus());
  }

  function goSearch() {
    const q = keyword.value.trim();
    recordOperation({ module: '全局搜索', operation: q ? `进入资源中心搜索【${q}】` : '进入资源中心' });
    closeDesktopSuggest();
    mobileVisible.value = false;
    router.push({ path: '/search', query: q ? { q } : {} });
  }

  function openItem(item: SearchResultItem) {
    closeDesktopSuggest();
    mobileVisible.value = false;
    if (item.type === 'bookmark' && item.url) {
      openBookmarkUrl(item.url);
      return;
    }
    if (item.type === 'file') {
      router.push({ path: '/cloudSpace', query: { fileName: item.title } });
      return;
    }
    if (item.route) router.push(item.route);
  }

  // 定位:不打开资源本身,而是跳到对应模块并高亮出来(书签模块本无搜索,借此补上"找到它在哪")
  function locateItem(item: SearchResultItem) {
    closeDesktopSuggest();
    mobileVisible.value = false;
    if (item.type === 'bookmark') {
      recordOperation({ module: '全局搜索', operation: `定位书签【${item.title}】` });
      router.push({ path: '/home', query: { locate: item.id } });
    }
  }

  // ── 下拉键盘操作:↑↓ 选中候选、回车打开选中项(未选中则进资源中心)、Esc 收起 ──
  const activeIndex = ref(-1);
  const flatItems = computed(() => suggestGroups.value.flatMap((g) => g.items));
  function isActiveItem(item: SearchResultItem) {
    return activeIndex.value >= 0 && flatItems.value[activeIndex.value] === item;
  }
  function moveActive(delta: number) {
    const len = flatItems.value.length;
    if (!len) return;
    activeIndex.value = (activeIndex.value + delta + len) % len;
  }
  function onKeydown(e: KeyboardEvent) {
    if (!suggestVisible.value) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === 'Escape') {
      closeDesktopSuggest();
    }
  }
  function onEnter() {
    const list = flatItems.value;
    if (activeIndex.value >= 0 && list[activeIndex.value]) openItem(list[activeIndex.value]);
    else goSearch();
  }
  // 结果刷新即重置高亮,避免指向错位
  watch(suggestGroups, () => {
    activeIndex.value = -1;
  });

  function handleDocumentMouseDown(event: MouseEvent) {
    if (!searchBoxRef.value) return;
    if (!searchBoxRef.value.contains(event.target as Node)) {
      suggestVisible.value = false;
    }
  }

  function handleShortcut(event: KeyboardEvent) {
    if (event.key !== '/' || bookmark.isMobile) return;
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
    if (!isSearchAvailable.value) return;
    event.preventDefault();
    recordOperation({ module: '全局搜索', operation: '使用快捷键唤起搜索' });
    document.getElementById('global-search-input')?.focus();
    openSuggest();
  }

  function syncNavigationLayer(visible: boolean) {
    document.querySelector('.navigation')?.classList.toggle('navigation--search-open', visible);
  }

  watch(
    () => route.query.q,
    (val) => {
      if (route.path.includes('/search')) {
        keyword.value = Array.isArray(val) ? String(val[0] || '') : String(val || '');
      }
    },
    { immediate: true },
  );

  watch(
    () => suggestVisible.value || mobileVisible.value,
    (visible) => {
      syncNavigationLayer(visible);
    },
  );

  onMounted(() => {
    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleShortcut);
    window.addEventListener('light-note:close-search', handleCloseSearch);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleDocumentMouseDown);
    document.removeEventListener('keydown', handleShortcut);
    window.removeEventListener('light-note:close-search', handleCloseSearch);
    syncNavigationLayer(false);
    if (searchTimer.value) clearTimeout(searchTimer.value);
  });
</script>

<style scoped lang="less">
  .global-search {
    width: 360px;
  }

  .global-search--mobile {
    width: auto;
    display: flex;
    align-items: center;
  }

  .global-search-box {
    position: relative;
    z-index: 1;
  }

  .global-search-box--open {
    z-index: 300000;
  }

  :deep(.b-input) {
    border-radius: 18px;
    height: 36px;
  }

  .shortcut {
    color: var(--desc-color);
    font-size: 12px;
  }

  .clear-btn,
  .view-all,
  .mobile-search-trigger,
  .mobile-cancel,
  .suggest-item {
    border: 0;
    background: transparent;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }

  .clear-btn {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: 50%;
    color: var(--desc-color);
    font-size: 14px;
    line-height: 1;
    font-weight: 500;
    background: color-mix(in srgb, var(--text-color) 8%, transparent);
  }

  .clear-btn:hover {
    color: var(--text-color);
    background: color-mix(in srgb, var(--text-color) 14%, transparent);
  }

  .suggest-panel {
    position: absolute;
    right: 0;
    top: 46px;
    width: min(560px, calc(100vw - 80px));
    max-height: 70vh;
    overflow: auto;
    padding: 14px;
    border-radius: 18px;
    background: var(--menu-body-bg-color);
    box-shadow: 0 20px 60px rgba(20, 20, 43, 0.22);
    border: 1px solid var(--card-border-color);
    z-index: 300001;
  }

  .suggest-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 4px 12px;
    border-bottom: 1px solid var(--card-border-color);
  }

  .suggest-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-color);
  }

  .suggest-subtitle,
  .empty-desc,
  .item-desc,
  .item-extra {
    color: var(--desc-color);
    font-size: 12px;
  }

  .suggest-group {
    margin-top: 12px;
  }

  .group-label {
    margin: 0 4px 6px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 700;
  }

  .suggest-item {
    width: 100%;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) max-content;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 12px;
    text-align: left;
    transition:
      background-color 0.2s,
      transform 0.2s;
  }

  .suggest-item--active {
    background: rgba(97, 92, 237, 0.12);
  }
  .suggest-item:hover {
    background: var(--bl-input-noBorder-bg-color);
    transform: translateY(-1px);
  }

  .type-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .type-dot--bookmark {
    background: var(--resource-bookmark-color);
  }
  .type-dot--note {
    background: var(--resource-note-color);
  }
  .type-dot--file {
    background: var(--resource-file-color);
  }
  .type-dot--tag {
    background: var(--resource-tag-color);
  }

  .item-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .item-title,
  .item-desc {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-title {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 650;
  }

  .item-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .item-title-row .item-title {
    flex: 0 1 auto;
    min-width: 0;
  }
  .item-tags {
    display: flex;
    gap: 4px;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    flex-wrap: nowrap;
  }
  .item-tag {
    flex: 0 0 auto;
    font-size: 11px;
    line-height: 1.5;
    padding: 0 6px;
    border-radius: 999px;
    color: var(--sub-text-color, #888);
    background: color-mix(in srgb, var(--text-color) 8%, transparent);
    white-space: nowrap;
  }
  .item-tag--hit {
    color: #fff;
    background: #615ced;
    font-weight: 600;
  }
  /* 描述改 2 行,配合"命中处摘要"能露出命中词而不被一行省略号切掉 */
  .item-desc {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  mark.gs-hl {
    background: color-mix(in srgb, #615ced 26%, transparent);
    color: inherit;
    border-radius: 3px;
    padding: 0 1px;
  }

  .locate-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
    margin-right: 4px;
    border-radius: 6px;
    color: var(--desc-color);
    cursor: pointer;
    vertical-align: middle;
  }
  .locate-btn:hover {
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 14%, transparent);
  }

  .view-all {
    width: 100%;
    margin-top: 12px;
    padding: 10px;
    border-radius: 12px;
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 8%, transparent);
    font-weight: 700;
  }

  .suggest-empty {
    padding: 28px 12px;
    text-align: center;
  }

  .empty-title {
    color: var(--text-color);
    font-weight: 700;
    margin-bottom: 6px;
  }

  .suggest-loading {
    padding: 16px 6px;
  }

  .sk-line {
    height: 34px;
    border-radius: 10px;
    margin-bottom: 10px;
    background: linear-gradient(
      90deg,
      var(--bl-input-noBorder-bg-color),
      var(--background-color),
      var(--bl-input-noBorder-bg-color)
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }

  .mobile-search-trigger {
    display: flex;
    align-items: center;
    width: 100%;
    height: 34px;
    gap: 8px;
    padding: 0 12px;
    border-radius: 17px;
    background: var(--bl-input-noBorder-bg-color);
    color: var(--desc-color);
    text-align: left;
    box-sizing: border-box;
    min-width: 0;
  }

  .mobile-search-placeholder {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .mobile-search-layer {
    position: fixed;
    inset: 0;
    z-index: 300001;
    background: var(--background-color);
    padding: 14px;
    box-sizing: border-box;
  }

  .mobile-search-header {
    display: grid;
    grid-template-columns: 1fr 48px;
    align-items: center;
    gap: 10px;
  }

  .mobile-cancel {
    color: #ff9800;
  }

  .mobile-search-body {
    height: calc(100vh - 78px);
    overflow: auto;
    padding-top: 16px;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (max-width: 1200px) {
    .global-search {
      width: 300px;
    }
  }
</style>
