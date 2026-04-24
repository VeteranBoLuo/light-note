<template>
  <div v-if="isSearchAvailable" class="global-search" :class="{ 'global-search--mobile': bookmark.isMobile }">
    <div v-if="!bookmark.isMobile" class="global-search-box" ref="searchBoxRef">
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
          <button v-if="keyword" class="clear-btn" @mousedown.prevent="clearKeyword">清空</button>
          <span v-else class="shortcut">/</span>
        </template>
      </b-input>

      <div v-if="suggestVisible" class="suggest-panel">
        <div class="suggest-head">
          <div>
            <div class="suggest-title">统一搜索</div>
            <div class="suggest-subtitle">从书签、笔记、文件和标签里一起找</div>
          </div>
          <button class="refresh-btn" @mousedown.prevent="refreshData">刷新</button>
        </div>

        <div v-if="loading" class="suggest-loading">
          <div v-for="n in 4" :key="n" class="sk-line"></div>
        </div>

        <template v-else-if="suggestGroups.length">
          <div v-for="group in suggestGroups" :key="group.type" class="suggest-group">
            <div class="group-label">{{ group.label }}</div>
            <button v-for="item in group.items" :key="`${item.type}-${item.id}`" class="suggest-item" @mousedown.prevent="openItem(item)">
              <span class="type-dot" :class="`type-dot--${item.type}`"></span>
              <span class="item-main">
                <span class="item-title">{{ item.title }}</span>
                <span class="item-desc">{{ item.description || item.extra }}</span>
              </span>
              <span class="item-extra">{{ item.extra }}</span>
            </button>
          </div>
          <button class="view-all" @mousedown.prevent="goSearch">查看全部搜索结果</button>
        </template>

        <div v-else class="suggest-empty">
          <div class="empty-title">{{ keyword ? '没有匹配结果' : '输入关键词开始搜索' }}</div>
          <div class="empty-desc">可以试试标签名、笔记标题、文件名或者网址关键词。</div>
        </div>
      </div>
    </div>

    <button v-else class="mobile-search-trigger" @click="openMobileSearch">
      <svg-icon size="16" :src="icon.navigation.search" />
      <span class="mobile-search-placeholder">搜索书签 / 笔记 / 文件</span>
    </button>

    <Teleport v-if="bookmark.isMobile" to="body">
      <div v-if="mobileVisible" class="mobile-search-layer">
        <div class="mobile-search-header">
          <b-input
            id="global-mobile-search-input"
            v-model:value="keyword"
            placeholder="搜索书签 / 笔记 / 文件 / 标签"
            height="40px"
            @input="handleInput"
            @enter="goSearch"
          >
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
          <button class="mobile-cancel" @click="mobileVisible = false">取消</button>
        </div>

        <div class="mobile-search-body">
          <div v-if="loading" class="suggest-loading">
            <div v-for="n in 5" :key="n" class="sk-line"></div>
          </div>
          <template v-else-if="suggestGroups.length">
            <div v-for="group in suggestGroups" :key="group.type" class="suggest-group">
              <div class="group-label">{{ group.label }}</div>
              <button v-for="item in group.items" :key="`${item.type}-${item.id}`" class="suggest-item" @click="openItem(item)">
                <span class="type-dot" :class="`type-dot--${item.type}`"></span>
                <span class="item-main">
                  <span class="item-title">{{ item.title }}</span>
                  <span class="item-desc">{{ item.description || item.extra }}</span>
                </span>
              </button>
            </div>
            <button class="view-all" @click="goSearch">查看全部搜索结果</button>
          </template>
          <div v-else class="suggest-empty">
            <div class="empty-title">{{ keyword ? '没有匹配结果' : '搜索你的轻笺知识库' }}</div>
            <div class="empty-desc">把零散内容聚在一起找，少翻几个抽屉。</div>
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
  import { fetchGlobalSearch, SearchGroup, SearchResultItem } from '@/api/search.ts';

  const router = useRouter();
  const route = useRoute();
  const bookmark = bookmarkStore();
  const keyword = ref('');
  const loading = ref(false);
  const suggestVisible = ref(false);
  const mobileVisible = ref(false);
  const searchBoxRef = ref<HTMLElement | null>(null);
  const suggestGroups = ref<SearchGroup[]>([]);
  const searchTimer = ref<number | null>(null);
  let requestSeq = 0;

  const visibleRoutes = ['workbenches', 'home', 'noteLibrary', 'cloudSpace', 'search'];
  const isSearchAvailable = computed(() => visibleRoutes.some((item) => route.path.includes(item)));
  const placeholder = computed(() => (route.path.includes('/search') ? '继续搜索...' : '搜索书签 / 笔记 / 文件 / 标签'));

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
    suggestVisible.value = true;
    ensureData();
  }

  function openMobileSearch() {
    mobileVisible.value = true;
    ensureData();
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

  async function refreshData() {
    await ensureData(true);
  }

  function goSearch() {
    const q = keyword.value.trim();
    suggestVisible.value = false;
    mobileVisible.value = false;
    router.push({ path: '/search', query: q ? { q } : {} });
  }

  function openItem(item: SearchResultItem) {
    suggestVisible.value = false;
    mobileVisible.value = false;
    if (item.type === 'bookmark' && item.url) {
      const hasProtocol = /^https?:\/\//i.test(item.url);
      window.open(hasProtocol ? item.url : `https://${item.url}`, '_blank');
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
    document.getElementById('global-search-input')?.focus();
    openSuggest();
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

  onMounted(() => {
    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleShortcut);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleDocumentMouseDown);
    document.removeEventListener('keydown', handleShortcut);
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
    z-index: 100001;
  }

  :deep(.b-input) {
    border-radius: 18px;
    height: 36px;
  }

  .shortcut,
  .clear-btn {
    color: var(--desc-color);
    font-size: 12px;
  }

  .clear-btn,
  .refresh-btn,
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
    z-index: 100002;
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

  .refresh-btn {
    color: #615ced;
    white-space: nowrap;
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
    transition: background-color 0.2s, transform 0.2s;
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

  .type-dot--bookmark { background: #615ced; }
  .type-dot--note { background: #00a884; }
  .type-dot--file { background: #ff8a00; }
  .type-dot--tag { background: #ec4899; }

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
    color: #615ced;
    background: rgba(97, 92, 237, 0.08);
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
    background: linear-gradient(90deg, var(--bl-input-noBorder-bg-color), var(--background-color), var(--bl-input-noBorder-bg-color));
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
    z-index: 100002;
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
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @media (max-width: 1200px) {
    .global-search {
      width: 300px;
    }
  }
</style>
