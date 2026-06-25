<template>
  <div v-if="isSearchAvailable" class="global-search" :class="{ 'global-search--mobile': bookmark.isMobile }">
    <div
      v-if="!bookmark.isMobile"
      class="global-search-box"
      :class="{ 'global-search-box--open': suggestVisible }"
      ref="searchBoxRef"
      @mousedown="handleSearchBoxMouseDown"
    >
      <b-input
        id="global-search-input"
        v-model:value="keyword"
        :placeholder="placeholder"
        height="36px"
        @focus="openSuggest"
        @input="handleInput"
        @enter="goSearch"
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
              @mousedown.prevent="openItem(item)"
              v-click-log="{ module: '全局搜索', operation: `打开搜索建议【${item.type}:${item.title}】` }"
            >
              <span class="type-dot" :class="`type-dot--${item.type}`"></span>
              <span class="item-main">
                <span class="item-title">{{ item.title }}</span>
                <span class="item-desc">{{ item.description || item.extra }}</span>
              </span>
              <span class="item-extra">{{ item.extra }}</span>
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
                  <span class="item-title">{{ item.title }}</span>
                  <span class="item-desc">{{ item.description || item.extra }}</span>
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
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { bookmarkStore } from '@/store';
  import { fetchGlobalSearch, SearchGroup, SearchResultItem, SearchType } from '@/api/search.ts';
  import { getSearchTypeLabel } from '@/components/searchCenter/searchMeta.ts';
  import { useI18n } from 'vue-i18n';
  import { GLOBAL_SEARCH_HIDDEN_ROUTE_NAMES } from '@/config/navigation.ts';
  import { recordOperation } from '@/api/commonApi.ts';

  const router = useRouter();
  const route = useRoute();
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
      const res = await fetchGlobalSearch(keyword.value, 3, force);
      if (seq === requestSeq) {
        suggestGroups.value = res.groups;
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
    ensureData(true);
  }

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
      const hasProtocol = /^https?:\/\//i.test(item.url);
      window.open(hasProtocol ? item.url : `https://${item.url}`, '_blank');
      return;
    }
    if (item.type === 'file') {
      router.push({ path: '/cloudSpace', query: { fileName: item.title } });
      return;
    }
    if (item.route) router.push(item.route);
  }

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
  });

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleDocumentMouseDown);
    document.removeEventListener('keydown', handleShortcut);
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
