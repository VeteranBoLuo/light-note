<template>
  <div class="co-build-page">
    <main class="co-build-shell">
      <header class="co-build-hero">
        <div class="hero-copy">
          <div class="hero-kicker">
            <span class="hero-icon"><SvgIcon :src="icon.coBuild.board" size="20" /></span>
            <span>{{ t('coBuild.title') }}</span>
          </div>
          <h1>{{ t('coBuild.title') }}</h1>
          <p>{{ t('coBuild.subtitle') }}</p>
          <div v-if="isVisitor" class="visitor-hint">{{ t('coBuild.visitorHint') }}</div>
        </div>
        <div class="hero-actions">
          <BButton v-if="isVisitor" type="primary" size="large" @click="openRegister">
            {{ t('coBuild.loginToSubmit') }}
          </BButton>
          <BButton v-else type="primary" size="large" @click="openSubmit(false)">
            <SvgIcon :src="icon.common.add" size="17" />
            {{ t('coBuild.submit') }}
          </BButton>
          <BButton v-if="isRoot" size="large" @click="openSubmit(true)">
            <SvgIcon :src="icon.coBuild.official" size="17" />
            {{ t('coBuild.submitOfficial') }}
          </BButton>
        </div>
      </header>

      <section v-if="activeTab === 'public'" class="summary-grid">
        <BCard v-for="summary in summaryCards" :key="summary.key" class="summary-card" padding="15px 18px">
          <span class="summary-value">{{ summary.value }}</span>
          <span class="summary-label">{{ summary.label }}</span>
        </BCard>
      </section>

      <section class="board-section">
        <div class="board-topbar">
          <BTabs v-model:active-tab="activeTab" variant="pill" :options="tabOptions" @change="changeTab" />
          <span v-if="activeTab === 'mine'" class="mine-hint">{{ t('coBuild.myPendingHint') }}</span>
        </div>

        <div v-if="activeTab !== 'mine'" class="filter-row">
          <BInput
            v-model:value="filters.keyword"
            class="filter-search"
            clearable
            :placeholder="t('coBuild.searchPlaceholder')"
            @input="scheduleSearch"
            @enter="applyFilters"
          >
            <template #prefix><SvgIcon :src="icon.navigation.search" size="16" /></template>
          </BInput>
          <BSelect
            v-if="activeTab === 'public'"
            v-model:value="filters.category"
            class="filter-select"
            :options="categoryFilterOptions"
            @change="applyFilters"
          />
          <BSelect
            v-if="activeTab === 'admin'"
            v-model:value="filters.moderationStatus"
            class="filter-select"
            :options="moderationFilterOptions"
            @change="applyFilters"
          />
          <BSelect
            v-model:value="filters.progressStatus"
            class="filter-select"
            :options="progressFilterOptions"
            @change="applyFilters"
          />
          <BSelect
            v-if="activeTab === 'public'"
            v-model:value="filters.sort"
            class="filter-select"
            :options="sortOptions"
            @change="applyFilters"
          />
        </div>

        <div v-if="loading" class="board-loading">
          <span v-for="index in 6" :key="index" class="loading-card" />
        </div>

        <div v-else-if="items.length" class="request-grid">
          <BCard
            v-for="item in items"
            :key="item.id"
            interactive
            class="request-card"
            padding="18px"
            @click="openDetail(item.id)"
          >
            <div class="card-meta">
              <span class="source-pill" :class="`is-${item.sourceType}`">
                <SvgIcon :src="item.sourceType === 'official' ? icon.coBuild.official : icon.coBuild.board" size="13" />
                {{ t(`coBuild.source${item.sourceType === 'official' ? 'Official' : 'User'}`) }}
              </span>
              <span class="category-pill">{{ t(`coBuild.category.${item.category}`) }}</span>
              <span v-if="activeTab !== 'public'" class="moderation-pill">
                {{ t(`coBuild.moderation.${item.moderationStatus}`) }}
              </span>
            </div>

            <h2>{{ item.title }}</h2>
            <p class="request-content">{{ item.content }}</p>

            <div v-if="item.developerReply" class="reply-preview">
              <strong>{{ t('coBuild.developerReply') }}</strong>
              <span>{{ item.developerReply }}</span>
            </div>

            <div class="card-footer">
              <div class="footer-status">
                <span class="progress-pill" :class="`is-${item.progressStatus}`">
                  {{ t(`coBuild.progress.${item.progressStatus}`) }}
                </span>
                <span class="updated-time">{{ t('coBuild.updatedAt', { time: formatTime(item.updateTime) }) }}</span>
              </div>
              <BButton
                v-if="item.moderationStatus === 'published'"
                size="small"
                class="vote-button"
                :class="{ 'is-voted': Boolean(item.viewerVoted) }"
                @click.stop="toggleVote(item)"
              >
                <SvgIcon :src="icon.coBuild.vote" size="14" />
                {{ item.voteCount || 0 }}
              </BButton>
            </div>
          </BCard>
        </div>

        <div v-else class="board-empty">
          <span class="empty-icon"><SvgIcon :src="icon.coBuild.board" size="30" /></span>
          <strong>{{ t('coBuild.empty') }}</strong>
          <p>{{ t('coBuild.emptyDesc') }}</p>
          <BButton v-if="!isVisitor" type="primary" @click="openSubmit(false)">{{ t('coBuild.submit') }}</BButton>
        </div>

        <BPagination
          v-if="total > pageSize"
          :current="currentPage"
          :page-size="pageSize"
          :total="total"
          @page-change="changePage"
          @size-change="changePageSize"
        />
      </section>
    </main>

    <FeatureRequestFormModal v-model:visible="submitVisible" :official="submitOfficial" @saved="handleSaved" />
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import FeatureRequestFormModal from './FeatureRequestFormModal.vue';
  import icon from '@/config/icon';
  import { bookmarkStore, useUserStore } from '@/store';
  import {
    listAdminFeatureRequests,
    listMyFeatureRequests,
    listPublicFeatureRequests,
    normalizeFeatureRequestSummary,
    toggleFeatureRequestVote,
    type FeatureRequestCategory,
    type FeatureRequestItem,
    type FeatureRequestListResult,
    type FeatureRequestModerationStatus,
    type FeatureRequestProgressStatus,
  } from '@/api/featureRequestApi';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi';

  type BoardTab = 'public' | 'mine' | 'admin';

  const { t, locale } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const isVisitor = computed(() => user.role === 'visitor');
  const isRoot = computed(() => user.role === 'root');
  const activeTab = ref<BoardTab>('public');
  const loading = ref(false);
  const items = ref<FeatureRequestItem[]>([]);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(12);
  const summary = ref<Record<FeatureRequestProgressStatus, number>>({
    evaluating: 0,
    planned: 0,
    in_progress: 0,
    released: 0,
    declined: 0,
  });
  const filters = reactive({
    keyword: '',
    category: '',
    progressStatus: '',
    moderationStatus: '',
    sort: 'updated' as 'updated' | 'newest' | 'popular',
  });
  const submitVisible = ref(false);
  const submitOfficial = ref(false);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  const categoryKeys: FeatureRequestCategory[] = ['bookmark', 'note', 'cloud', 'tag', 'ai', 'experience', 'other'];
  const progressKeys: FeatureRequestProgressStatus[] = ['evaluating', 'planned', 'in_progress', 'released', 'declined'];
  const moderationKeys: FeatureRequestModerationStatus[] = [
    'pending_review',
    'published',
    'rejected',
    'merged',
    'hidden',
  ];

  const tabOptions = computed(() => {
    const options = [{ key: 'public', label: t('coBuild.publicTab') }];
    if (!isVisitor.value) options.push({ key: 'mine', label: t('coBuild.mineTab') });
    if (isRoot.value) options.push({ key: 'admin', label: t('coBuild.adminTab') });
    return options;
  });
  const categoryFilterOptions = computed(() => [
    { value: '', label: t('coBuild.allCategory') },
    ...categoryKeys.map((value) => ({ value, label: t(`coBuild.category.${value}`) })),
  ]);
  const progressFilterOptions = computed(() => [
    { value: '', label: t('coBuild.allProgress') },
    ...progressKeys.map((value) => ({ value, label: t(`coBuild.progress.${value}`) })),
  ]);
  const moderationFilterOptions = computed(() => [
    { value: '', label: t('coBuild.allModeration') },
    ...moderationKeys.map((value) => ({ value, label: t(`coBuild.moderation.${value}`) })),
  ]);
  const sortOptions = computed(() => [
    { value: 'updated', label: t('coBuild.sortUpdated') },
    { value: 'newest', label: t('coBuild.sortNewest') },
    { value: 'popular', label: t('coBuild.sortPopular') },
  ]);
  const summaryCards = computed(() => [
    { key: 'total', label: t('coBuild.totalPublic'), value: total.value },
    { key: 'planned', label: t('coBuild.plannedCount'), value: summary.value.planned },
    { key: 'in_progress', label: t('coBuild.progressCount'), value: summary.value.in_progress },
    { key: 'released', label: t('coBuild.releasedCount'), value: summary.value.released },
  ]);

  async function loadData() {
    if (loading.value) return;
    loading.value = true;
    try {
      let res;
      if (activeTab.value === 'mine') {
        res = await listMyFeatureRequests({ currentPage: currentPage.value, pageSize: pageSize.value });
      } else if (activeTab.value === 'admin') {
        res = await listAdminFeatureRequests({
          currentPage: currentPage.value,
          pageSize: pageSize.value,
          filters: {
            keyword: filters.keyword,
            moderationStatus: filters.moderationStatus,
            progressStatus: filters.progressStatus,
          },
        });
      } else {
        res = await listPublicFeatureRequests({
          currentPage: currentPage.value,
          pageSize: pageSize.value,
          filters: {
            keyword: filters.keyword,
            category: filters.category,
            progressStatus: filters.progressStatus,
            sort: filters.sort,
          },
        });
      }
      if (res?.status !== 200) {
        message.warning(t('coBuild.loadFailed'));
        return;
      }
      const data = res.data as FeatureRequestListResult;
      items.value = data.items || [];
      total.value = Number(data.total || 0);
      if (data.summary) summary.value = normalizeFeatureRequestSummary(data.summary);
    } catch (error) {
      console.error('加载共建轻笺失败:', error);
      message.warning(t('coBuild.loadFailed'));
    } finally {
      loading.value = false;
    }
  }

  function resetAndLoad() {
    currentPage.value = 1;
    loadData();
  }
  function changeTab() {
    filters.keyword = '';
    filters.category = '';
    filters.progressStatus = '';
    filters.moderationStatus = '';
    resetAndLoad();
  }
  function scheduleSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(resetAndLoad, 350);
  }
  function applyFilters() {
    if (searchTimer) clearTimeout(searchTimer);
    resetAndLoad();
  }
  function changePage(page: number) {
    currentPage.value = page;
    loadData();
  }
  function changePageSize(size: number) {
    pageSize.value = size;
    resetAndLoad();
  }
  function openDetail(id: string) {
    router.push(`/co-build/${id}`);
  }
  function openRegister() {
    bookmark.openAuthModal('注册', 'co_build');
    recordOperation({ module: '共建轻笺', operation: '游客点击注册后提建议' });
  }
  function openSubmit(official: boolean) {
    submitOfficial.value = official;
    submitVisible.value = true;
  }
  function handleSaved() {
    if (!submitOfficial.value) activeTab.value = 'mine';
    resetAndLoad();
  }
  async function toggleVote(item: FeatureRequestItem) {
    if (isVisitor.value) {
      openRegister();
      return;
    }
    try {
      const res = await toggleFeatureRequestVote(item.id);
      if (res?.status !== 200) return;
      item.viewerVoted = Boolean(res.data?.voted);
      item.voteCount = Number(res.data?.voteCount || 0);
      recordOperation({
        module: '共建轻笺',
        operation: `${item.viewerVoted ? '支持需求' : '取消支持需求'}【${item.title.slice(0, 40)}】`,
      });
    } catch (error) {
      console.error('更新建议投票失败:', error);
    }
  }
  function formatTime(value: string) {
    if (!value) return '--';
    const date = new Date(value.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date);
  }

  watch(
    () => user.role,
    () => {
      if (isVisitor.value && activeTab.value !== 'public') activeTab.value = 'public';
      resetAndLoad();
    },
  );
  onMounted(() => {
    loadData();
    recordOperation({ module: '共建轻笺', operation: '查看需求看板' });
  });
  onBeforeUnmount(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });
</script>

<style scoped lang="less">
  .co-build-page {
    height: 100%;
    overflow: auto;
    color: var(--text-color);
    background: var(--surface-page-bg);
  }
  .co-build-shell {
    width: 100%;
    min-height: 100%;
    box-sizing: border-box;
    padding: 24px clamp(24px, 3.2vw, 76px) 48px;
  }
  .co-build-hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 28px;
    padding: clamp(24px, 3vw, 42px);
    border: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--surface-border-color));
    border-radius: 20px;
    background:
      radial-gradient(circle at 90% 10%, color-mix(in srgb, var(--primary-color) 18%, transparent), transparent 34%),
      var(--surface-raised-background);
    box-shadow: var(--surface-raised-shadow);
  }
  .hero-copy {
    max-width: 860px;
  }
  .hero-kicker {
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--primary-color);
    font-size: 13px;
    font-weight: 700;
  }
  .hero-icon,
  .empty-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background));
  }
  .co-build-hero h1 {
    margin: 14px 0 8px;
    font-size: clamp(30px, 3vw, 48px);
    line-height: 1.1;
    letter-spacing: -0.04em;
  }
  .co-build-hero p {
    margin: 0;
    color: var(--desc-color);
    font-size: 15px;
    line-height: 1.75;
  }
  .visitor-hint {
    margin-top: 18px;
    padding-left: 12px;
    border-left: 3px solid var(--primary-color);
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
  }
  .hero-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .hero-actions :deep(.b_btn) {
    gap: 7px;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-top: 18px;
  }
  .summary-card {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .summary-value {
    color: var(--text-color);
    font-size: 24px;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }
  .summary-label {
    color: var(--desc-color);
    font-size: 13px;
  }
  .board-section {
    margin-top: 18px;
    padding: 20px;
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--surface-panel-bg);
  }
  .board-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .mine-hint {
    color: var(--desc-color);
    font-size: 12px;
  }
  .filter-row {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) repeat(3, minmax(150px, 190px));
    gap: 10px;
    margin: 16px 0;
  }
  .filter-search {
    min-width: 0;
  }
  .filter-select {
    min-width: 0;
  }
  .filter-row :deep(.b-input),
  .filter-row :deep(.select-trigger) {
    height: 40px;
    border: 1px solid var(--surface-border-color) !important;
    background: var(--card-background);
  }
  .request-grid,
  .board-loading {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
    gap: 14px;
    margin-top: 16px;
  }
  .request-card {
    min-height: 260px;
    display: flex;
    flex-direction: column;
    cursor: pointer;
  }
  .request-card:hover {
    border-color: color-mix(in srgb, var(--primary-color) 42%, var(--surface-border-color));
  }
  .card-meta {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }
  .source-pill,
  .category-pill,
  .moderation-pill,
  .progress-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 24px;
    box-sizing: border-box;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1;
  }
  .source-pill.is-official {
    color: #8a5a00;
    background: color-mix(in srgb, #f5a623 15%, var(--card-background));
  }
  .source-pill.is-user {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
  }
  .category-pill,
  .moderation-pill {
    color: var(--desc-color);
    background: var(--surface-panel-bg);
  }
  .request-card h2 {
    margin: 16px 0 9px;
    font-size: 18px;
    line-height: 1.45;
  }
  .request-content {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.7;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .reply-preview {
    display: grid;
    gap: 4px;
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 6%, var(--surface-panel-bg));
    color: var(--desc-color);
    font-size: 12px;
  }
  .reply-preview strong {
    color: var(--primary-color);
  }
  .reply-preview span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-footer {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin-top: auto;
    padding-top: 18px;
  }
  .footer-status {
    display: grid;
    gap: 7px;
  }
  .progress-pill {
    width: max-content;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, var(--card-background));
  }
  .progress-pill.is-released {
    color: #07845d;
    background: color-mix(in srgb, #10b981 12%, var(--card-background));
  }
  .progress-pill.is-declined {
    color: var(--desc-color);
    background: var(--surface-panel-bg);
  }
  .updated-time {
    color: var(--desc-color);
    font-size: 11px;
  }
  .vote-button {
    gap: 5px;
    color: var(--desc-color);
  }
  .vote-button.is-voted {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 11%, var(--card-background));
  }
  .loading-card {
    height: 260px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: linear-gradient(
      100deg,
      var(--card-background) 20%,
      var(--surface-panel-bg) 40%,
      var(--card-background) 60%
    );
    background-size: 200% 100%;
    animation: shimmer 1.3s infinite linear;
  }
  .board-empty {
    min-height: 330px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .board-empty strong {
    margin-top: 16px;
    font-size: 18px;
  }
  .board-empty p {
    max-width: 480px;
    margin: 8px 0 18px;
    color: var(--desc-color);
    line-height: 1.7;
  }
  .board-section :deep(.bpagination) {
    margin-top: 24px;
  }
  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }
  @media (max-width: 1100px) {
    .filter-row {
      grid-template-columns: minmax(220px, 1fr) repeat(2, minmax(140px, 180px));
    }
    .filter-row > :last-child {
      grid-column: auto;
    }
  }
  @media (max-width: 767px) {
    .co-build-shell {
      padding: 14px 12px 34px;
    }
    .co-build-hero {
      align-items: stretch;
      flex-direction: column;
      padding: 20px;
      border-radius: 16px;
    }
    .hero-actions,
    .hero-actions :deep(.b_btn) {
      width: 100%;
    }
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .board-section {
      padding: 14px;
      border-radius: 16px;
    }
    .board-topbar {
      align-items: flex-start;
      flex-direction: column;
    }
    .filter-row {
      grid-template-columns: 1fr 1fr;
    }
    .filter-search {
      grid-column: 1 / -1;
    }
    .request-grid,
    .board-loading {
      grid-template-columns: 1fr;
    }
    .request-card {
      min-height: 230px;
    }
  }
</style>
