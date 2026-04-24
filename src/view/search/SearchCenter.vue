<template>
  <div class="search-page" :class="{ 'search-page--night': user.currentTheme === 'night' }">
    <section class="hero-card">
      <div class="hero-copy">
        <div class="eyebrow">Global Search</div>
        <h1>统一搜索中心</h1>
        <p
          >把书签、笔记、云文件和标签放进同一个入口里找。当前已接入后端聚合查询，后续可以继续升级全文检索或 AI
          语义搜索。</p
        >
      </div>
      <div class="hero-search">
        <b-input
          id="search-center-input"
          v-model:value="keyword"
          placeholder="搜索书签 / 笔记 / 文件 / 标签"
          height="46px"
          @input="syncQuery"
          @enter="syncQueryNow"
        >
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="18" />
          </template>
        </b-input>
        <button class="refresh-btn" @click="refreshData">刷新索引</button>
      </div>
      <div class="hero-stats">
        <div v-for="stat in stats" :key="stat.type" class="stat-card">
          <span class="stat-value">{{ stat.count }}</span>
          <span class="stat-label">{{ stat.label }}</span>
        </div>
      </div>
    </section>

    <section class="search-layout">
      <aside class="type-filter">
        <button
          v-for="item in typeFilters"
          :key="item.value"
          class="filter-item"
          :class="{ active: activeType === item.value }"
          @click="activeType = item.value"
        >
          <span class="filter-dot" :class="`filter-dot--${item.value}`"></span>
          <span>{{ item.label }}</span>
          <span class="filter-count">{{ item.count }}</span>
        </button>
      </aside>

      <main class="result-panel">
        <div class="result-toolbar">
          <div>
            <div class="result-title">搜索结果</div>
            <div class="result-subtitle">
              {{ keyword.trim() ? `关键词「${keyword.trim()}」` : '展示当前可检索内容' }} · 共
              {{ flatResults.length }} 条
            </div>
          </div>
          <button class="clear-btn" :disabled="!keyword" @click="clearKeyword">清空搜索</button>
        </div>

        <div v-if="loading" class="result-skeleton">
          <div v-for="n in 8" :key="n" class="result-sk-card"></div>
        </div>

        <template v-else-if="visibleGroups.length">
          <section v-for="group in visibleGroups" :key="group.type" class="result-group">
            <div class="group-header">
              <span>{{ group.label }}</span>
              <span>{{ group.items.length }} 条</span>
            </div>
            <div class="result-grid">
              <button
                v-for="item in group.items"
                :key="`${item.type}-${item.id}`"
                class="result-card"
                @click="openItem(item)"
              >
                <div class="card-top">
                  <span class="type-pill" :class="`type-pill--${item.type}`">{{ group.label }}</span>
                  <span class="card-extra">{{ item.extra }}</span>
                </div>
                <div class="card-title">{{ item.title }}</div>
                <div class="card-desc">{{ item.description }}</div>
                <div class="card-action">{{ item.type === 'bookmark' ? '打开网页' : '进入查看' }}</div>
              </button>
            </div>
          </section>
        </template>

        <div v-else class="empty-state">
          <div class="empty-orbit"></div>
          <h3>没有找到匹配内容</h3>
          <p>换一个关键词试试，比如标签名、笔记标题、文件名或者网址里的关键字。</p>
        </div>
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { fetchGlobalSearch, SearchGroup, SearchResultItem, SearchType } from '@/api/search.ts';
  import { useUserStore } from '@/store';

  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const keyword = ref('');
  const activeType = ref<SearchType | 'all'>('all');
  const loading = ref(false);
  const sourceItems = ref<SearchResultItem[]>([]);
  const groups = ref<SearchGroup[]>([]);
  const queryTimer = ref<number | null>(null);

  const labels: Record<SearchType | 'all', string> = {
    all: '全部',
    bookmark: '书签',
    note: '笔记',
    file: '文件',
    tag: '标签',
  };

  const visibleGroups = computed(() => {
    if (activeType.value === 'all') return groups.value;
    return groups.value.filter((group) => group.type === activeType.value);
  });
  const flatResults = computed(() => visibleGroups.value.flatMap((group) => group.items));
  const stats = computed(() =>
    (['bookmark', 'note', 'file', 'tag'] as SearchType[]).map((type) => ({
      type,
      label: labels[type],
      count: sourceItems.value.filter((item) => item.type === type).length,
    })),
  );
  const typeFilters = computed(() => [
    {
      value: 'all' as const,
      label: '全部结果',
      count: groups.value.reduce((sum, group) => sum + group.items.length, 0),
    },
    ...(['bookmark', 'note', 'file', 'tag'] as SearchType[]).map((type) => ({
      value: type,
      label: labels[type],
      count: groups.value.find((group) => group.type === type)?.items.length || 0,
    })),
  ]);

  async function loadData(force = false) {
    loading.value = true;
    try {
      const res = await fetchGlobalSearch(keyword.value, 50, force);
      sourceItems.value = res.items;
      groups.value = res.groups;
    } finally {
      loading.value = false;
    }
  }

  function syncQuery() {
    if (queryTimer.value) clearTimeout(queryTimer.value);
    queryTimer.value = window.setTimeout(syncQueryNow, 250);
  }

  function syncQueryNow() {
    const q = keyword.value.trim();
    router.replace({ path: '/search', query: q ? { q } : {} });
  }

  function clearKeyword() {
    keyword.value = '';
    syncQueryNow();
  }

  async function refreshData() {
    await loadData(true);
  }

  function openItem(item: SearchResultItem) {
    if (item.type === 'bookmark' && item.url) {
      const hasProtocol = /^https?:\/\//i.test(item.url);
      window.open(hasProtocol ? item.url : `https://${item.url}`, '_blank');
      return;
    }
    if (item.route) router.push(item.route);
  }

  watch(
    () => route.query.q,
    (val) => {
      keyword.value = Array.isArray(val) ? String(val[0] || '') : String(val || '');
      loadData();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (queryTimer.value) clearTimeout(queryTimer.value);
  });
</script>

<style scoped lang="less">
  .search-page {
    --search-hero-bg: linear-gradient(135deg, var(--background-color), var(--menu-body-bg-color));
    --search-stat-bg: rgba(255, 255, 255, 0.48);
    --search-panel-bg: var(--background-color);
    --search-card-bg: var(--menu-body-bg-color);
    --search-card-shadow: rgba(20, 20, 43, 0.14);
    --search-muted-bg: var(--bl-input-noBorder-bg-color);

    height: 100%;
    overflow: auto;
    padding: 24px;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .search-page--night {
    --search-hero-bg: linear-gradient(135deg, #25272d, #303033);
    --search-stat-bg: #30333b;
    --search-panel-bg: #262629;
    --search-card-bg: #303033;
    --search-card-shadow: rgba(0, 0, 0, 0.36);
    --search-muted-bg: #35363d;
  }

  .hero-card {
    position: relative;
    overflow: hidden;
    border-radius: 28px;
    padding: 30px;
    background:
      radial-gradient(circle at 12% 18%, rgba(255, 153, 102, 0.22), transparent 28%),
      radial-gradient(circle at 86% 14%, rgba(97, 92, 237, 0.22), transparent 30%), var(--search-hero-bg);
    border: 1px solid var(--card-border-color);
    box-shadow: var(--ant-table-boxShadow);
  }

  .hero-card::after {
    content: '';
    position: absolute;
    right: -80px;
    bottom: -120px;
    width: 260px;
    height: 260px;
    border-radius: 50%;
    border: 44px solid rgba(97, 92, 237, 0.08);
  }

  .hero-copy,
  .hero-search,
  .hero-stats {
    position: relative;
    z-index: 1;
  }

  .eyebrow {
    color: #615ced;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 8px 0 10px;
    font-size: clamp(30px, 5vw, 52px);
    line-height: 1;
  }

  p {
    max-width: 720px;
    margin: 0;
    color: var(--desc-color);
    line-height: 1.8;
  }

  .hero-search {
    margin-top: 24px;
    display: grid;
    grid-template-columns: minmax(220px, 560px) 110px;
    gap: 12px;
    align-items: center;
  }

  :deep(.b-input) {
    border-radius: 18px;
  }

  .refresh-btn,
  .clear-btn,
  .filter-item,
  .result-card {
    border: 0;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }

  .refresh-btn {
    height: 46px;
    border-radius: 16px;
    color: #fff;
    background: linear-gradient(135deg, #615ced, #8b5cf6);
    font-weight: 800;
  }

  .hero-stats {
    margin-top: 20px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    max-width: 720px;
  }

  .stat-card {
    padding: 14px;
    border-radius: 18px;
    background: var(--search-stat-bg);
    border: 1px solid var(--card-border-color);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .search-page--night .stat-card {
    border-color: #4d5668;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  }

  .stat-value {
    font-size: 24px;
    font-weight: 850;
    color: var(--text-color);
  }

  .search-page--night .stat-value {
    color: #ffffff;
  }

  .stat-label,
  .result-subtitle,
  .card-desc,
  .card-extra,
  .filter-count {
    color: var(--desc-color);
  }

  .search-layout {
    margin-top: 20px;
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }

  .type-filter,
  .result-panel {
    border-radius: 24px;
    border: 1px solid var(--card-border-color);
    background: var(--search-panel-bg);
    box-shadow: var(--ant-table-boxShadow);
  }

  .type-filter {
    padding: 12px;
    position: sticky;
    top: 0;
  }

  .filter-item {
    width: 100%;
    display: grid;
    grid-template-columns: 10px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border-radius: 14px;
    background: transparent;
    text-align: left;
  }

  .filter-item.active,
  .filter-item:hover {
    background: var(--search-muted-bg);
  }

  .filter-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #94a3b8;
  }

  .filter-dot--bookmark {
    background: #615ced;
  }
  .filter-dot--note {
    background: #00a884;
  }
  .filter-dot--file {
    background: #ff8a00;
  }
  .filter-dot--tag {
    background: #ec4899;
  }

  .result-panel {
    padding: 18px;
    min-height: 420px;
  }

  .result-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--card-border-color);
  }

  .result-title {
    font-size: 20px;
    font-weight: 850;
  }

  .clear-btn {
    padding: 9px 14px;
    border-radius: 14px;
    background: var(--search-muted-bg);
  }

  .clear-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .result-group {
    margin-top: 18px;
  }

  .group-header {
    display: flex;
    justify-content: space-between;
    color: var(--desc-color);
    font-weight: 800;
    font-size: 13px;
    margin-bottom: 10px;
  }

  .result-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }

  .result-card {
    min-height: 156px;
    padding: 16px;
    border-radius: 18px;
    text-align: left;
    background: var(--search-card-bg);
    border: 1px solid var(--card-border-color);
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition:
      transform 0.2s,
      box-shadow 0.2s,
      border-color 0.2s;
  }

  .result-card:hover {
    transform: translateY(-3px);
    border-color: var(--primary-h-color);
    box-shadow: 0 14px 32px var(--search-card-shadow);
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
  }

  .type-pill {
    min-width: max-content;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
    background: rgba(97, 92, 237, 0.1);
    color: #615ced;
  }

  .type-pill--note {
    background: rgba(0, 168, 132, 0.12);
    color: #008f70;
  }
  .type-pill--file {
    background: rgba(255, 138, 0, 0.14);
    color: #d97706;
  }
  .type-pill--tag {
    background: rgba(236, 72, 153, 0.12);
    color: #db2777;
  }

  .card-title {
    font-size: 17px;
    font-weight: 850;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-desc {
    line-height: 1.7;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-action {
    margin-top: auto;
    color: #615ced;
    font-weight: 800;
  }

  .result-skeleton {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .result-sk-card {
    height: 156px;
    border-radius: 18px;
    background: linear-gradient(
      90deg,
      var(--bl-input-noBorder-bg-color),
      var(--background-color),
      var(--bl-input-noBorder-bg-color)
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }

  .empty-state {
    min-height: 300px;
    display: grid;
    place-items: center;
    align-content: center;
    text-align: center;
    color: var(--desc-color);
  }

  .empty-state h3 {
    margin: 16px 0 8px;
    color: var(--text-color);
  }

  .empty-orbit {
    width: 76px;
    height: 76px;
    border-radius: 50%;
    border: 12px solid rgba(97, 92, 237, 0.14);
    border-top-color: #615ced;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (max-width: 900px) {
    .search-page {
      padding: 14px;
    }

    .hero-card {
      padding: 22px;
      border-radius: 22px;
    }

    .hero-search,
    .search-layout {
      grid-template-columns: 1fr;
    }

    .hero-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .type-filter {
      position: static;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
