<template>
  <div ref="pageRef" class="co-build-page" :class="{ 'is-mobile': bookmark.isMobile }" v-auto-scrollbar>
    <header v-if="bookmark.isMobile" class="mobile-heading">
      <BButton icon-only class="mobile-back" :aria-label="t('common.back')" @click="goBack">
        <SvgIcon :src="icon.arrow_left" size="20" />
      </BButton>
      <h1>{{ t('coBuild.mobileTitle') }}</h1>
      <div class="mobile-actions">
        <BButton type="primary" :aria-label="submitLabel" @click="startSubmit">
          {{ t(isVisitor ? 'coBuild.loginShort' : 'coBuild.submitShort') }}
        </BButton>
        <BActionMenu
          v-if="isRoot"
          :items="officialActions"
          placement="bottom-right"
          :aria-label="t('coBuild.moreActions')"
          @select="openSubmit(true)"
        >
          <BButton icon-only class="mobile-more" :aria-label="t('coBuild.moreActions')">
            <SvgIcon :src="icon.common.more" size="20" />
          </BButton>
        </BActionMenu>
      </div>
    </header>

    <main class="co-build-shell">
      <header class="page-heading">
        <span v-if="!bookmark.isMobile" class="heading-icon"><SvgIcon :src="icon.coBuild.board" size="24" /></span>
        <div class="heading-copy">
          <h1 v-if="!bookmark.isMobile">{{ t('coBuild.title') }}</h1>
          <p>{{ t('coBuild.boardSubtitle') }}</p>
          <p v-if="isVisitor" class="visitor-hint">{{ t('coBuild.visitorHint') }}</p>
        </div>
        <div v-if="!bookmark.isMobile" class="heading-actions">
          <BButton type="primary" size="large" @click="startSubmit">
            <SvgIcon :src="icon.common.plus" size="17" />{{ submitLabel }}
          </BButton>
          <BButton v-if="isRoot" size="large" class="official-button" @click="openSubmit(true)">
            <SvgIcon :src="icon.coBuild.official" size="17" />{{ t('coBuild.submitOfficial') }}
          </BButton>
        </div>
      </header>

      <section class="board-section" :aria-label="t('coBuild.publicTab')">
        <div class="board-navigation">
          <BTabs v-model:active-tab="activeTab" variant="line" :options="tabOptions" @change="changeTab" />
        </div>
        <p v-if="activeTab === 'mine'" class="mine-hint">{{ t('coBuild.myPendingHint') }}</p>

        <div v-if="activeTab === 'public' && !bookmark.isMobile" class="progress-filters">
          <BTabs
            v-model:active-tab="filters.progressStatus"
            variant="pill"
            :options="progressTabs"
            :aria-label="t('coBuild.allProgress')"
            @change="applyFilters"
          >
            <template #label="{ tab }">
              <span class="progress-filter-label">
                <span class="filter-dot" :class="`is-${tab.key || 'all'}`" aria-hidden="true" />{{ tab.label }}
              </span>
            </template>
          </BTabs>
        </div>

        <div v-if="activeTab !== 'mine'" class="filter-row" :class="{ 'is-admin': activeTab === 'admin' }">
          <BInput
            v-model:value="filters.keyword"
            class="filter-search"
            clearable
            :aria-label="t('coBuild.boardSearchPlaceholder')"
            :placeholder="t('coBuild.boardSearchPlaceholder')"
            @input="scheduleSearch"
            @enter="applyFilters"
          >
            <template #prefix><SvgIcon :src="icon.navigation.search" size="16" /></template>
          </BInput>
          <BSelect
            v-if="activeTab === 'public'"
            v-model:value="filters.category"
            :options="categoryFilterOptions"
            :placeholder="t('coBuild.allCategory')"
            :aria-label="t('coBuild.categoryLabel')"
            @change="applyFilters"
          />
          <BSelect
            v-else
            v-model:value="filters.moderationStatus"
            :options="moderationFilterOptions"
            :placeholder="t('coBuild.allModeration')"
            :aria-label="t('coBuild.allModeration')"
            @change="applyFilters"
          />
          <BSelect
            v-if="bookmark.isMobile || activeTab === 'admin'"
            v-model:value="filters.progressStatus"
            :options="progressFilterOptions"
            :placeholder="t('coBuild.allProgress')"
            :aria-label="t('coBuild.allProgress')"
            @change="applyFilters"
          />
          <BSelect
            v-if="activeTab === 'public'"
            v-model:value="filters.sort"
            :options="sortOptions"
            :aria-label="t('coBuild.sortLabel')"
            @change="applyFilters"
          />
        </div>

        <div v-if="activeTab === 'public' && bookmark.isMobile" class="mobile-summary">
          <span v-for="metric in mobileSummary" :key="metric.key">
            <i class="filter-dot" :class="`is-${metric.key}`" aria-hidden="true" />{{ metric.label }}
            <b>{{ metric.value }}</b>
          </span>
        </div>

        <div v-if="loadError" class="load-error" role="alert">
          <span>{{ t('coBuild.loadFailed') }}</span>
          <BButton type="text" :loading="loading" @click="loadData()">{{ t('coBuild.retry') }}</BButton>
        </div>

        <div class="board-content" :aria-busy="loading">
          <div v-if="loading && !items.length" class="board-loading" role="status" :aria-label="t('common.loading')">
            <div v-for="index in 4" :key="index" class="loading-row" aria-hidden="true"><i /><span /><span /></div>
          </div>
          <div v-else-if="items.length" class="request-list">
            <article
              v-for="item in items"
              :key="item.id"
              class="request-row"
              :class="{ 'has-vote': item.moderationStatus === 'published' }"
            >
              <BButton
                v-if="item.moderationStatus === 'published'"
                icon-only
                class="vote-button"
                :class="{ 'is-voted': Boolean(item.viewerVoted) }"
                :loading="votingIds.has(item.id)"
                :disabled="loading"
                :aria-pressed="Boolean(item.viewerVoted)"
                :aria-label="
                  t(item.viewerVoted ? 'coBuild.unvoteRequest' : 'coBuild.voteRequest', {
                    title: item.title,
                    count: item.voteCount || 0,
                  })
                "
                @click="toggleVote(item)"
              >
                <span class="vote-content">
                  <SvgIcon :src="item.viewerVoted ? icon.coBuild.vote : icon.coBuild.voteOutline" size="18" />
                  <span v-if="bookmark.isMobile">{{ t(item.viewerVoted ? 'coBuild.voted' : 'coBuild.vote') }}</span>
                  <b>{{ item.voteCount || 0 }}</b>
                </span>
              </BButton>
              <div class="request-body">
                <div class="request-meta">
                  <span class="co-build-source" :class="{ 'is-official': item.sourceType === 'official' }">
                    <SvgIcon v-if="item.sourceType === 'official'" :src="icon.coBuild.official" size="13" />
                    {{ t(item.sourceType === 'official' ? 'coBuild.sourceOfficial' : 'coBuild.sourceUser') }}
                  </span>
                  <span class="co-build-category" :data-category="item.category">{{
                    t(`coBuild.category.${item.category}`)
                  }}</span>
                  <span v-if="activeTab !== 'public'" class="co-build-moderation">{{
                    t(`coBuild.moderation.${item.moderationStatus}`)
                  }}</span>
                  <time v-if="!bookmark.isMobile" class="updated-time" :datetime="item.updateTime">{{
                    t('coBuild.updatedAt', { time: formatTime(item.updateTime) })
                  }}</time>
                  <span v-if="bookmark.isMobile" class="co-build-status" :class="`is-${item.progressStatus}`">{{
                    t(`coBuild.progress.${item.progressStatus}`)
                  }}</span>
                </div>
                <h2
                  ><RouterLink class="request-link" :to="`/co-build/${item.id}`">{{ item.title }}</RouterLink></h2
                >
                <p class="request-content">{{ item.content }}</p>
                <p v-if="item.developerReply" class="reply-preview">
                  <SvgIcon :src="icon.coBuild.official" size="14" /><strong>{{ t('coBuild.developerReply') }}</strong>
                  <span>{{ item.developerReply }}</span>
                </p>
              </div>
              <div v-if="!bookmark.isMobile" class="row-status">
                <span class="co-build-status" :class="`is-${item.progressStatus}`">{{
                  t(`coBuild.progress.${item.progressStatus}`)
                }}</span>
                <SvgIcon :src="icon.arrow_right" size="14" />
              </div>
              <time v-if="bookmark.isMobile" class="updated-time mobile-time" :datetime="item.updateTime">{{
                t('coBuild.updatedAt', { time: formatTime(item.updateTime) })
              }}</time>
            </article>
          </div>
          <div v-else-if="!loadError" class="board-empty">
            <span class="empty-icon"><SvgIcon :src="icon.coBuild.board" size="32" /></span>
            <h2>{{ emptyTitle }}</h2>
            <p>{{ emptyDescription }}</p>
            <BButton v-if="hasFilters" type="text" @click="clearFilters">{{ t('coBuild.clearFilters') }}</BButton>
            <BButton v-else type="text" @click="startSubmit"
              >{{ submitLabel }}<SvgIcon :src="icon.arrow_right" size="14"
            /></BButton>
          </div>
        </div>

        <footer v-if="(!loading && !loadError) || items.length" class="board-footer">
          <span>{{ t('coBuild.resultCount', { count: total }) }}</span>
          <BPagination
            v-if="total > pageSize"
            :current="currentPage"
            :page-size="pageSize"
            :total="total"
            @page-change="changePage"
            @size-change="changePageSize"
          />
        </footer>
      </section>
    </main>
    <FeatureRequestFormModal v-model:visible="submitVisible" :official="submitOfficial" @saved="handleSaved" />
  </div>
</template>

<script setup lang="ts">
  import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { RouterLink, useRouter } from 'vue-router';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';
  import { returnToPreviousPage } from '@/utils/pageReturn';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
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
  import { recordOperation } from '@/api/commonApi';

  type BoardTab = 'public' | 'mine' | 'admin';
  const { t, locale } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const pageRef = ref<HTMLElement | null>(null);
  useDensityScrollAnchor(pageRef);
  const goBack = () => returnToPreviousPage(router, '/personCenter');
  useMobileTopBar(['coBuild'], {
    title: () => t('coBuild.title'),
    onBack: goBack,
    ownTopBar: true,
    showNotification: false,
  });
  const isVisitor = computed(() => user.role === 'visitor');
  const isRoot = computed(() => user.role === 'root');
  const submitLabel = computed(() => t(isVisitor.value ? 'coBuild.loginToSubmit' : 'coBuild.submit'));
  const officialActions = computed(() => [
    { key: 'official', label: t('coBuild.submitOfficial'), icon: icon.coBuild.official },
  ]);
  const activeTab = ref<BoardTab>('public');
  const loading = ref(false);
  const loadError = ref(false);
  const items = ref<FeatureRequestItem[]>([]);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(12);
  const summary = ref(normalizeFeatureRequestSummary());
  const filters = reactive({
    keyword: '',
    category: '',
    progressStatus: '',
    moderationStatus: '',
    sort: 'updated' as 'updated' | 'newest' | 'popular',
  });
  const submitVisible = ref(false);
  const submitOfficial = ref(false);
  const votingIds = ref(new Set<string>());
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let loadGeneration = 0;
  let pageActive = true;

  const categoryKeys: FeatureRequestCategory[] = ['bookmark', 'note', 'cloud', 'tag', 'ai', 'experience', 'other'];
  const progressKeys: FeatureRequestProgressStatus[] = ['evaluating', 'planned', 'in_progress', 'released', 'declined'];
  const moderationKeys: FeatureRequestModerationStatus[] = [
    'pending_review',
    'published',
    'rejected',
    'merged',
    'hidden',
  ];
  const tabOptions = computed(() => [
    { key: 'public', label: t('coBuild.publicTab') },
    ...(!isVisitor.value ? [{ key: 'mine', label: t('coBuild.mineTab') }] : []),
    ...(isRoot.value ? [{ key: 'admin', label: t('coBuild.adminTab') }] : []),
  ]);
  const publicCount = computed(() => progressKeys.reduce((sum, key) => sum + summary.value[key], 0));
  const progressTabs = computed(() => [
    { key: '', label: t('coBuild.all'), badge: publicCount.value },
    ...progressKeys.map((key) => ({ key, label: t(`coBuild.progress.${key}`), badge: summary.value[key] })),
  ]);
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
  const mobileSummary = computed(() => [
    { key: 'all', label: t('coBuild.totalPublic'), value: publicCount.value },
    { key: 'planned', label: t('coBuild.progress.planned'), value: summary.value.planned },
    { key: 'in_progress', label: t('coBuild.progress.in_progress'), value: summary.value.in_progress },
    { key: 'released', label: t('coBuild.progress.released'), value: summary.value.released },
  ]);
  const hasFilters = computed(() =>
    Boolean(filters.keyword.trim() || filters.category || filters.progressStatus || filters.moderationStatus),
  );
  const emptyTitle = computed(() =>
    t(
      hasFilters.value || activeTab.value === 'admin'
        ? 'coBuild.empty'
        : activeTab.value === 'mine'
          ? 'coBuild.mineEmpty'
          : 'coBuild.publicEmpty',
    ),
  );
  const emptyDescription = computed(() =>
    t(
      hasFilters.value || activeTab.value === 'admin'
        ? 'coBuild.emptyDesc'
        : activeTab.value === 'mine'
          ? 'coBuild.mineEmptyDesc'
          : 'coBuild.publicEmptyDesc',
    ),
  );

  async function loadData() {
    if (!pageActive) return;
    const generation = ++loadGeneration;
    const tab = activeTab.value;
    const account = user.id;
    const role = user.role;
    const query = { currentPage: currentPage.value, pageSize: pageSize.value };
    const filterSnapshot = { ...filters };
    const isCurrent = () => generation === loadGeneration && account === user.id && role === user.role;
    loading.value = true;
    loadError.value = false;
    try {
      const res =
        tab === 'mine'
          ? await listMyFeatureRequests(query)
          : tab === 'admin'
            ? await listAdminFeatureRequests({
                ...query,
                filters: {
                  keyword: filterSnapshot.keyword,
                  moderationStatus: filterSnapshot.moderationStatus,
                  progressStatus: filterSnapshot.progressStatus,
                },
              })
            : await listPublicFeatureRequests({
                ...query,
                filters: {
                  keyword: filterSnapshot.keyword,
                  category: filterSnapshot.category,
                  progressStatus: filterSnapshot.progressStatus,
                  sort: filterSnapshot.sort,
                },
              });
      if (!isCurrent()) return;
      if (res?.status !== 200) {
        loadError.value = true;
        return;
      }
      const data = res.data as FeatureRequestListResult;
      items.value = data.items || [];
      total.value = Number(data.total || 0);
      if (tab === 'public') summary.value = normalizeFeatureRequestSummary(data.summary);
    } catch {
      if (isCurrent()) loadError.value = true;
    } finally {
      if (isCurrent()) loading.value = false;
    }
  }
  function cancelSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = null;
  }
  function resetAndLoad() {
    cancelSearch();
    currentPage.value = 1;
    items.value = [];
    total.value = 0;
    void loadData();
  }
  function changeTab() {
    Object.assign(filters, { keyword: '', category: '', progressStatus: '', moderationStatus: '' });
    resetAndLoad();
  }
  function scheduleSearch() {
    cancelSearch();
    // Invalidate an in-flight query immediately, not only when the debounce expires.
    ++loadGeneration;
    searchTimer = setTimeout(resetAndLoad, 350);
  }
  function applyFilters() {
    resetAndLoad();
  }
  function clearFilters() {
    Object.assign(filters, { keyword: '', category: '', progressStatus: '', moderationStatus: '' });
    resetAndLoad();
  }
  function changePage(page: number) {
    cancelSearch();
    currentPage.value = page;
    items.value = [];
    void loadData();
  }
  function changePageSize(size: number) {
    pageSize.value = size;
    resetAndLoad();
  }
  function openRegister() {
    bookmark.openAuthModal('注册', 'co_build');
    recordOperation({ module: '共建轻笺', operation: '游客点击注册后提建议' });
  }
  function startSubmit() {
    if (isVisitor.value) openRegister();
    else openSubmit(false);
  }
  function openSubmit(official: boolean) {
    if (isVisitor.value) {
      openRegister();
      return;
    }
    if (official && !isRoot.value) return;
    submitOfficial.value = official;
    submitVisible.value = true;
  }
  function handleSaved() {
    if (isVisitor.value || (submitOfficial.value && !isRoot.value)) return;
    if (!submitOfficial.value) activeTab.value = 'mine';
    resetAndLoad();
  }
  async function toggleVote(item: FeatureRequestItem) {
    if (isVisitor.value) {
      openRegister();
      return;
    }
    if (loading.value || votingIds.value.has(item.id)) return;
    const account = user.id;
    const role = user.role;
    const queryGeneration = loadGeneration;
    votingIds.value.add(item.id);
    try {
      const res = await toggleFeatureRequestVote(item.id);
      if (res?.status !== 200 || user.id !== account || user.role !== role) return;
      if (queryGeneration !== loadGeneration && pageActive) {
        if (searchTimer) {
          currentPage.value = 1;
          cancelSearch();
        }
        await loadData();
      } else {
        const current = items.value.find((row) => row.id === item.id);
        if (current) {
          current.viewerVoted = Boolean(res.data?.voted);
          current.voteCount = Number(res.data?.voteCount || 0);
        }
      }
      if (user.id !== account || user.role !== role) return;
      recordOperation({
        module: '共建轻笺',
        operation: `${res.data?.voted ? '支持需求' : '取消支持需求'}【${item.title.slice(0, 40)}】`,
      });
    } catch {
      /* The request layer presents write failures. */
    } finally {
      votingIds.value.delete(item.id);
    }
  }
  function formatTime(value: string) {
    if (!value) return '--';
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date);
  }
  watch(
    () => [user.id, user.role],
    () => {
      if ((activeTab.value === 'admin' && !isRoot.value) || isVisitor.value) activeTab.value = 'public';
      submitVisible.value = false;
      summary.value = normalizeFeatureRequestSummary();
      changeTab();
    },
  );
  onMounted(() => {
    void loadData();
    recordOperation({ module: '共建轻笺', operation: '查看需求看板' });
  });
  onActivated(() => {
    if (!pageActive) {
      pageActive = true;
      void loadData();
    }
  });
  onDeactivated(() => {
    pageActive = false;
    ++loadGeneration;
    loading.value = false;
    cancelSearch();
  });
  onBeforeUnmount(() => {
    pageActive = false;
    ++loadGeneration;
    cancelSearch();
  });
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  @import (reference) './coBuildShared.less';
  .co-build-page {
    .workspace-canvas-surface();
    .co-build-semantics();
    height: 100%;
    overflow: auto;
    color: var(--workspace-text);
  }
  .co-build-shell {
    width: 100%;
    max-width: calc(var(--ui-layout-1280, 1280px) + 2 * var(--ui-space-24, 24px));
    margin: 0 auto;
    padding: var(--ui-space-28, 28px) var(--ui-space-24, 24px) var(--ui-space-48, 48px);
    box-sizing: border-box;
  }
  .page-heading {
    display: flex;
    align-items: center;
    gap: var(--ui-space-16, 16px);
    margin-bottom: var(--ui-space-24, 24px);
  }
  .heading-icon,
  .empty-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }
  .heading-icon {
    width: var(--ui-layout-48, 48px);
    height: var(--ui-layout-48, 48px);
    border-radius: 12px;
  }
  .heading-copy {
    flex: 1;
    min-width: 0;
  }
  .heading-copy h1 {
    margin: 0 0 var(--ui-space-6, 6px);
    font-size: var(--ui-font-28, 28px);
    line-height: 1.3;
  }
  .heading-copy p {
    margin: 0;
    color: var(--workspace-muted);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.65;
  }
  .heading-copy .visitor-hint {
    margin-top: var(--ui-space-6, 6px);
    font-size: var(--ui-font-12, 12px);
  }
  .heading-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--ui-space-10, 10px);
  }
  .heading-actions .b_btn {
    gap: var(--ui-space-6, 6px);
  }
  .official-button {
    border: 1px solid var(--workspace-border);
    background: var(--workspace-content);
  }
  .official-button > :first-child {
    color: var(--warning-color);
  }
  .board-section {
    .workspace-content-surface();
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    padding: 0 var(--ui-space-24, 24px);
  }
  .board-navigation {
    border-bottom: 1px solid var(--workspace-divider);
  }
  .board-navigation :deep(.tab-container.is-line) {
    width: fit-content;
    gap: var(--ui-space-12, 12px);
    border-bottom: 0;
  }
  .board-navigation :deep(.tab) {
    padding: var(--ui-space-16, 16px) var(--ui-space-12, 12px);
    font-size: var(--ui-font-15, 15px);
  }
  .board-navigation :deep(.tab.is-active) {
    color: var(--workspace-purple-text);
  }
  .progress-filters :deep(.tab-badge) {
    padding: 0;
    background: transparent;
    color: inherit;
    opacity: 1;
  }
  .mine-hint {
    margin: var(--ui-space-16, 16px) 0;
    color: var(--workspace-muted);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
  }
  .progress-filters {
    padding: var(--ui-space-16, 16px) 0 0;
    overflow-x: auto;
  }
  .progress-filters :deep(.tab-container) {
    width: max-content;
    background: transparent;
    gap: var(--ui-space-6, 6px);
    padding: 0;
  }
  .progress-filter-label {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
  }
  .filter-dot {
    display: inline-block;
    flex: none;
    width: var(--ui-layout-7, 7px);
    height: var(--ui-layout-7, 7px);
    border-radius: 50%;
    background: var(--desc-color);
  }
  .filter-dot.is-all,
  .filter-dot.is-planned {
    background: var(--workspace-purple-text);
  }
  .filter-dot.is-in_progress {
    background: var(--info-color);
  }
  .filter-dot.is-released {
    background: var(--success-color);
  }
  .filter-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-180, 180px) var(--ui-layout-180, 180px);
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-16, 16px) 0;
  }
  .filter-row > * {
    min-width: 0;
  }
  .filter-row :deep(.b-input),
  .filter-row :deep(.select-trigger) {
    min-height: var(--ui-control-40, 40px);
    box-sizing: border-box;
  }
  .board-content {
    border-top: 1px solid var(--workspace-divider);
  }
  .request-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    column-gap: var(--ui-space-24, 24px);
    padding: var(--ui-space-20, 20px) 0;
  }
  .request-row.has-vote {
    grid-template-columns: var(--ui-layout-54, 54px) minmax(0, 1fr) auto;
  }
  .request-row + .request-row {
    border-top: 1px solid var(--workspace-divider);
  }
  .request-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: var(--ui-space-5, 5px);
  }
  .request-body h2 {
    order: 0;
    margin: 0;
    font-size: var(--ui-font-17, 17px);
    font-weight: 650;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .request-link {
    color: var(--workspace-text);
    text-decoration: none;
  }
  .request-link::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 6px;
  }
  .request-link:focus-visible {
    outline: none;
  }
  .request-link:focus-visible::after {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .request-meta {
    order: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-6, 6px) var(--ui-space-12, 12px);
  }
  .request-content {
    order: 1;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
    margin: 0;
    color: var(--workspace-muted);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.6;
  }
  .reply-preview {
    order: 3;
    display: flex;
    align-items: baseline;
    gap: var(--ui-space-6, 6px);
    margin: var(--ui-space-2, 2px) 0 0;
    min-width: 0;
    font-size: var(--ui-font-13, 13px);
    color: var(--workspace-muted);
    line-height: 1.6;
  }
  .reply-preview > :first-child {
    flex: none;
    color: var(--warning-color);
    align-self: center;
  }
  .reply-preview strong {
    flex: none;
    color: var(--workspace-purple-text);
    font-weight: 550;
  }
  .reply-preview > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-status {
    align-self: center;
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    color: var(--workspace-muted);
  }
  .row-status .co-build-status {
    min-width: var(--ui-layout-80, 80px);
    justify-content: center;
  }
  .updated-time {
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
  }
  .vote-button.b_btn {
    position: relative;
    z-index: 1;
    align-self: start;
    width: var(--ui-layout-54, 54px);
    min-width: 0;
    height: var(--ui-layout-60, 60px);
    padding: var(--ui-space-6, 6px);
    border: 1px solid var(--workspace-border);
    border-radius: 9px;
    color: var(--workspace-muted);
    background: var(--workspace-content);
  }
  .vote-content {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
    line-height: 1.2;
    font-size: var(--ui-font-14, 14px);
  }
  .vote-button.is-voted {
    color: var(--workspace-purple-text);
    border-color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }
  .board-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: var(--ui-space-16, 16px);
    padding: var(--ui-space-16, 16px) 0;
    border-top: 1px solid var(--workspace-divider);
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-muted);
  }
  .board-empty {
    min-height: var(--ui-layout-320, 320px);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: var(--ui-space-24, 24px);
    text-align: center;
    box-sizing: border-box;
  }
  .empty-icon {
    width: var(--ui-layout-64, 64px);
    height: var(--ui-layout-64, 64px);
    border-radius: 50%;
  }
  .board-empty h2 {
    margin: var(--ui-space-20, 20px) 0 var(--ui-space-8, 8px);
    font-size: var(--ui-font-18, 18px);
  }
  .board-empty p {
    margin: 0 0 var(--ui-space-16, 16px);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.7;
    color: var(--workspace-muted);
  }
  .board-empty .b_btn {
    gap: var(--ui-space-6, 6px);
  }
  .load-error {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-20, 20px) 0;
    font-size: var(--ui-font-14, 14px);
    color: var(--danger-color);
  }
  .board-loading {
    display: grid;
  }
  .loading-row {
    display: grid;
    grid-template-columns: var(--ui-layout-54, 54px) minmax(0, 1fr);
    gap: var(--ui-space-12, 12px) var(--ui-space-24, 24px);
    padding: var(--ui-space-24, 24px) 0;
    border-bottom: 1px solid var(--workspace-divider);
  }
  .loading-row i,
  .loading-row span {
    background: var(--workspace-hover);
    border-radius: 6px;
  }
  .loading-row i {
    grid-row: span 2;
    height: var(--ui-layout-60, 60px);
  }
  .loading-row span {
    height: var(--ui-layout-18, 18px);
    width: 80%;
  }
  .loading-row span:last-child {
    width: 60%;
  }
  @media (hover: hover) and (pointer: fine) {
    .request-row:hover .request-link {
      color: var(--workspace-purple-text);
    }
    .vote-button:hover {
      border-color: var(--workspace-purple-text);
    }
  }

  .is-mobile {
    .co-build-shell {
      padding: var(--ui-space-12, 12px) var(--ui-space-12, 12px) var(--ui-space-32, 32px);
    }
    .mobile-heading {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--ui-space-8, 8px);
      min-height: var(--ui-layout-56, 56px);
      padding: 0 var(--ui-space-12, 12px);
      background: var(--workspace-content);
      border-bottom: 1px solid var(--workspace-divider);
      box-sizing: border-box;
    }
    .mobile-heading h1 {
      position: absolute;
      left: 50%;
      width: calc(100% - var(--ui-layout-248, 248px));
      transform: translateX(-50%);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin: 0;
      font-size: var(--ui-font-18, 18px);
      line-height: 1.4;
      text-align: center;
    }
    .mobile-back.b_btn,
    .mobile-more.b_btn {
      flex: none;
      width: var(--ui-layout-44, 44px);
      height: var(--ui-layout-44, 44px);
      padding: 0;
      background: transparent;
    }
    .mobile-actions {
      margin-inline-start: auto;
      display: flex;
      align-items: center;
      gap: var(--ui-space-4, 4px);
    }
    .mobile-actions > .b_btn {
      height: var(--ui-control-32, 32px);
      padding-inline: var(--ui-space-8, 8px);
    }
    .page-heading {
      margin-bottom: var(--ui-space-14, 14px);
    }
    .heading-copy p {
      font-size: var(--ui-font-13, 13px);
    }
    .board-section {
      padding: 0 var(--ui-space-12, 12px);
      border-radius: 12px;
    }
    .board-navigation :deep(.tab-container.is-line) {
      width: 100%;
      gap: 0;
    }
    .board-navigation :deep(.tab) {
      flex: 1;
      justify-content: center;
      padding: var(--ui-space-12, 12px) var(--ui-space-4, 4px);
      font-size: var(--ui-font-14, 14px);
    }
    .filter-row {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--ui-space-8, 8px);
      padding: var(--ui-space-12, 12px) 0;
    }
    .filter-search {
      grid-column: 1 / -1;
    }
    .filter-row.is-admin {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .filter-row :deep(.select-trigger) {
      min-height: var(--ui-control-32, 32px);
      padding: 0 var(--ui-space-24, 24px) 0 var(--ui-space-8, 8px);
      font-size: var(--ui-font-12, 12px);
    }
    .filter-row :deep(.select-suffix) {
      right: var(--ui-space-6, 6px);
    }
    .mobile-summary {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
      padding-bottom: var(--ui-space-12, 12px);
      color: var(--workspace-muted);
      font-size: var(--ui-font-11, 11px);
    }
    .mobile-summary > span {
      display: inline-flex;
      align-items: center;
      gap: var(--ui-space-4, 4px);
      white-space: nowrap;
    }
    .mobile-summary b {
      color: var(--workspace-text);
      font-weight: 550;
    }
    .request-row,
    .request-row.has-vote {
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: var(--ui-space-12, 12px);
      row-gap: var(--ui-space-12, 12px);
      padding: var(--ui-space-18, 18px) 0;
    }
    .request-body {
      grid-column: 1 / -1;
      grid-row: 1;
      gap: var(--ui-space-8, 8px);
    }
    .request-meta {
      order: -1;
      gap: var(--ui-space-6, 6px) var(--ui-space-8, 8px);
    }
    .request-meta .co-build-status {
      margin-inline-start: auto;
    }
    .request-body h2 {
      font-size: var(--ui-font-16, 16px);
    }
    .request-content {
      font-size: var(--ui-font-13, 13px);
    }
    .reply-preview {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      font-size: var(--ui-font-12, 12px);
    }
    .reply-preview > :first-child {
      vertical-align: middle;
      margin-inline-end: var(--ui-space-4, 4px);
    }
    .reply-preview strong {
      margin-inline-end: var(--ui-space-6, 6px);
    }
    .reply-preview > span {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .mobile-time {
      grid-column: 1;
      grid-row: 2;
      align-self: center;
    }
    .vote-button.b_btn {
      grid-column: 2;
      grid-row: 2;
      width: auto;
      height: var(--ui-control-32, 32px);
      padding: 0 var(--ui-space-10, 10px);
    }
    .vote-content {
      flex-direction: row;
      gap: var(--ui-space-5, 5px);
      font-size: var(--ui-font-13, 13px);
    }
    .board-empty {
      min-height: var(--ui-layout-280, 280px);
      padding-inline: var(--ui-space-8, 8px);
    }
    .board-empty p {
      font-size: var(--ui-font-13, 13px);
    }
    .board-footer {
      justify-content: center;
    }
  }
</style>
