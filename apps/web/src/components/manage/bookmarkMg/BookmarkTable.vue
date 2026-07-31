<template>
  <ResourcePageShell
    :title="$t('bookmarkMg.title')"
    :subtitle="$t('bookmarkMg.subtitle')"
    accent="bookmark"
    layout="workspace"
    show-back
    @back="handleToBack"
  >
    <template #actions>
      <BButton v-if="selectedRows.length > 0" @click="openSelectedBookmarksInAi">
        <SvgIcon :src="icon.ai.ask" color="currentColor" size="16" aria-hidden="true" />
        {{ $t('bookmarkMg.aiUseSelected') }}
      </BButton>
      <BButton v-if="selectedRows.length > 0" type="danger" @click="handleBatchDelete">
        {{ $t('bookmarkMg.batchDelete') }}
      </BButton>
      <BButton
        class="resource-action resource-action--utility"
        :disabled="isImporting"
        @click="showImportExportModal"
        v-click-log="OPERATION_LOG_MAP.bookmarkMg.importExport"
      >
        <SvgIcon :src="icon.bookmarkManage.importExport" color="currentColor" size="18" />
        {{ $t('bookmarkMg.importExport') }}
      </BButton>
      <BButton
        class="resource-action resource-action--utility"
        @click="healthVisible = true"
        v-click-log="OPERATION_LOG_MAP.bookmarkMg.healthCheck"
      >
        <SvgIcon :src="icon.bookmarkManage.healthCheck" color="currentColor" size="18" />
        {{ $t('bookmarkMg.healthCheck') }}
      </BButton>
      <BButton
        class="resource-action resource-action--ai"
        @click="aiOrgVisible = true"
        v-click-log="OPERATION_LOG_MAP.bookmarkMg.aiOrganize"
      >
        <SvgIcon :src="icon.ai.organize" color="currentColor" size="18" />
        {{ $t('bookmarkMg.aiOrganizeBtn') }}
      </BButton>
      <BButton
        class="resource-action resource-action--primary"
        type="primary"
        @click="router.push({ path: `/manage/editBookmark/add` })"
        v-click-log="OPERATION_LOG_MAP.bookmarkMg.toAddBtn"
      >
        <SvgIcon :src="icon.common.add" color="currentColor" size="17" />
        {{ $t('common.add') }}
      </BButton>
    </template>
    <div class="bookmark-manage-page" :class="{ 'bookmark-manage-page--night': user.currentTheme === 'night' }">
      <!-- 图标补全进度卡 -->
      <BCard v-if="iconBatchState" class="icon-batch-progress-card">
        <div class="icon-batch-progress-content">
          <div class="icon-batch-progress-summary">
            <div class="icon-batch-progress-title">
              {{
                $t('bookmarkMg.iconBatch.title', {
                  completed: iconBatchState.completed,
                  total: iconBatchState.total,
                })
              }}
            </div>
            <div class="icon-batch-progress-hint">
              {{
                iconBatchIsRetryWaiting
                  ? $t('bookmarkMg.iconBatch.waitingHint', { count: iconBatchState.retryWaiting })
                  : $t('bookmarkMg.iconBatch.backgroundHint')
              }}
            </div>
            <div
              class="icon-batch-progress-track"
              role="progressbar"
              :aria-label="$t('bookmarkMg.iconBatch.progressLabel')"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="iconBatchProgressPercent"
            >
              <span
                class="icon-batch-progress-value"
                :class="{ 'icon-batch-progress-value--active': iconBatchIsActive }"
                :style="{ width: `${iconBatchProgressWidth}%` }"
              />
            </div>
          </div>
          <div class="icon-batch-progress-detail">
            <span v-if="iconBatchState.success > 0">
              {{ $t('bookmarkMg.iconBatch.success', { count: iconBatchState.success }) }}
            </span>
            <span v-if="iconBatchState.notFound > 0">
              {{ $t('bookmarkMg.iconBatch.notFound', { count: iconBatchState.notFound }) }}
            </span>
            <span v-if="iconBatchState.failed > 0">
              {{ $t('bookmarkMg.iconBatch.failed', { count: iconBatchState.failed }) }}
            </span>
            <span v-if="iconBatchState.retryWaiting > 0">
              {{ $t('bookmarkMg.iconBatch.retryWaiting', { count: iconBatchState.retryWaiting }) }}
            </span>
            <span v-if="iconBatchIsActive">
              {{ $t('bookmarkMg.iconBatch.processing') }}
            </span>
            <span v-else-if="iconBatchIsRetryWaiting">
              {{ $t('bookmarkMg.iconBatch.waitingBackground') }}
            </span>
            <span v-if="iconBatchState.status === 'completed'">
              {{ $t('bookmarkMg.iconBatch.completed') }}
            </span>
          </div>
          <div class="icon-batch-progress-actions">
            <BButton size="small" @click="dismissIconBatch()">{{ $t('bookmarkMg.iconBatch.hide') }}</BButton>
            <BButton
              v-if="iconBatchState.failed > 0 || iconBatchState.notFound > 0"
              size="small"
              @click="retryIconBatch(iconBatchState.batchId)"
            >
              {{ $t('bookmarkMg.iconBatch.retry') }}
            </BButton>
          </div>
        </div>
      </BCard>
      <section class="hero-stats-section">
        <div class="hero-stats">
          <BCard
            v-for="stat in stats"
            :key="stat.key"
            as="article"
            variant="raised"
            padding="10px 14px"
            class="stat-card"
            :class="`stat-card--${stat.key}`"
          >
            <div class="stat-label">{{ stat.label }}</div>
            <div class="stat-value">{{ stat.value }}</div>
            <div class="stat-desc">{{ stat.desc }}</div>
          </BCard>
        </div>
      </section>

      <!-- 内容区 -->
      <section class="content-layout">
        <BCard as="aside" variant="card" padding="16px" class="filter-panel">
          <div class="filter-title">{{ $t('bookmarkMg.filtersTitle') }}</div>
          <BButton
            v-for="filter in filters"
            :key="filter.value"
            class="filter-item"
            :class="{ active: activeFilter === filter.value }"
            @click="activeFilter = filter.value"
          >
            <span class="filter-left">
              <span class="filter-dot" :class="`filter-dot--${filter.value}`"></span>
              <span>{{ filter.label }}</span>
            </span>
            <span class="filter-count">{{ filter.count }}</span>
          </BButton>
        </BCard>

        <BCard as="main" variant="panel" padding="20px" class="result-panel">
          <div class="result-toolbar">
            <div class="result-toolbar-left">
              <div class="view-toggle">
                <BButton class="view-toggle-btn" :class="{ active: viewMode === 'card' }" @click="viewMode = 'card'">
                  <svg-icon :src="icon.filterPanel.list" size="14" />
                  <span>{{ $t('bookmarkMg.cardView') }}</span>
                </BButton>
                <BButton class="view-toggle-btn" :class="{ active: viewMode === 'table' }" @click="viewMode = 'table'">
                  <svg-icon :src="icon.navigation.menu" size="14" />
                  <span>{{ $t('bookmarkMg.tableView') }}</span>
                </BButton>
              </div>
              <BButton
                v-if="viewMode === 'card'"
                size="small"
                class="card-selection-toggle"
                :class="{ active: cardSelectionMode }"
                :aria-pressed="cardSelectionMode"
                @click="toggleCardSelectionMode"
              >
                {{ $t(cardSelectionMode ? 'bookmarkMg.batchCancel' : 'bookmarkMg.batchSelect') }}
              </BButton>
              <BButton
                v-if="viewMode === 'card' && cardSelectionMode && selectableBookmarkIds.length"
                size="small"
                class="card-selection-toggle"
                @click="toggleSelectAllVisibleBookmarks"
              >
                {{ $t(allVisibleBookmarksSelected ? 'bookmarkMg.batchDeselectAll' : 'bookmarkMg.batchSelectAll') }}
              </BButton>
              <b-input
                v-model:value="tableSearchValue"
                class="result-search"
                :placeholder="$t('bookmarkMg.bookmarkSearch')"
              >
                <template #prefix>
                  <svg-icon :src="icon.navigation.search" size="16" />
                </template>
              </b-input>
            </div>
            <div class="result-toolbar-right">
              <div class="result-title">{{ $t('bookmarkMg.resultTitle') }}</div>
              <div class="result-subtitle">{{ resultSubtitle }}</div>
              <div v-if="cardSelectionMode" class="result-selection-count">
                {{ $t('bookmarkMg.batchSelected', { count: selectedRows.length }) }}
              </div>
            </div>
          </div>

          <!-- 导入状态：与首次加载、列表和空状态互斥，避免多个动画叠加。 -->
          <div v-if="isImporting" class="result-status import-status" role="status" aria-live="polite" aria-busy="true">
            <div class="result-status-icon result-status-icon--import">
              <SvgIcon :src="icon.bookmarkManage.importExport" color="currentColor" size="30" aria-hidden="true" />
            </div>
            <h3>{{ importStatusTitle }}</h3>
            <p>{{ importStatusDescription }}</p>
            <div class="import-progress-track" aria-hidden="true">
              <span class="import-progress-value" />
            </div>
            <div class="import-steps" aria-hidden="true">
              <div
                v-for="(step, index) in importSteps"
                :key="step"
                class="import-step"
                :class="{
                  'import-step--active': importStageIndex === index,
                  'import-step--done': importStageIndex > index,
                }"
              >
                <span class="import-step-dot">{{ index + 1 }}</span>
                <span>{{ step }}</span>
              </div>
            </div>
          </div>

          <!-- 首次请求只展示结构骨架，不提前渲染空状态。 -->
          <div
            v-else-if="initialLoading"
            class="bookmark-skeleton"
            :aria-label="$t('bookmarkMg.loadingState.title')"
            aria-busy="true"
          >
            <div v-if="viewMode === 'card'" class="bookmark-grid bookmark-skeleton-grid">
              <BCard
                v-for="index in 6"
                :key="`bookmark-card-skeleton-${index}`"
                variant="card"
                padding="18px"
                class="bookmark-card bookmark-skeleton-card"
              >
                <div class="skeleton-head">
                  <span class="skeleton-block skeleton-avatar"></span>
                  <span class="skeleton-lines">
                    <span class="skeleton-block skeleton-line skeleton-line--title"></span>
                    <span class="skeleton-block skeleton-line skeleton-line--url"></span>
                  </span>
                </div>
                <span class="skeleton-block skeleton-line skeleton-line--body"></span>
                <span class="skeleton-block skeleton-chip"></span>
              </BCard>
            </div>
            <div v-else class="table-skeleton">
              <div v-for="index in 7" :key="`bookmark-row-skeleton-${index}`" class="table-skeleton-row">
                <span class="skeleton-block table-skeleton-cell table-skeleton-cell--name"></span>
                <span class="skeleton-block table-skeleton-cell"></span>
                <span class="skeleton-block table-skeleton-cell table-skeleton-cell--tag"></span>
                <span class="skeleton-block table-skeleton-cell table-skeleton-cell--action"></span>
              </div>
            </div>
          </div>

          <div v-else-if="showLoadError" class="result-status" role="alert">
            <div class="result-status-icon result-status-icon--error">
              <SvgIcon :src="icon.message.warning" color="currentColor" size="30" aria-hidden="true" />
            </div>
            <h3>{{ $t('bookmarkMg.loadErrorTitle') }}</h3>
            <p>{{ $t('bookmarkMg.loadErrorDesc') }}</p>
            <div class="result-status-actions">
              <BButton type="primary" @click="retryInitialLoad">{{ $t('bookmarkMg.retryLoad') }}</BButton>
            </div>
          </div>

          <!-- 卡片视图 -->
          <div v-else-if="viewMode === 'card' && filteredBookmarks.length" class="bookmark-grid">
            <BCard
              v-for="bookmarkItem in filteredBookmarks"
              :key="bookmarkItem.id"
              as="article"
              variant="card"
              padding="18px"
              class="bookmark-card"
              :class="{ 'is-selected': selectedRows.includes(bookmarkItem.id) }"
            >
              <div class="bookmark-card__head">
                <div class="bookmark-identity">
                  <BCheckbox
                    v-if="cardSelectionMode || selectedRows.length > 0"
                    class="bookmark-selection-checkbox"
                    :checked="selectedRows.includes(bookmarkItem.id)"
                    @click.stop
                    @keydown.stop
                    @change="toggleBookmarkSelection(bookmarkItem.id)"
                  />
                  <BookmarkFavicon
                    :bookmark-id="bookmarkItem.id"
                    :src="bookmarkItem.iconUrl"
                    :size="24"
                    :tile-size="42"
                  />
                  <div class="bookmark-meta">
                    <div class="bookmark-name">{{ bookmarkItem.name }}</div>
                    <div class="bookmark-url" :title="bookmarkItem.url">
                      <a
                        :href="withProtocol(bookmarkItem.url)"
                        target="_blank"
                        rel="noopener noreferrer"
                        @click.stop="handleStoredBookmarkClick($event, bookmarkItem.url)"
                        >{{ bookmarkItem.url }}</a
                      >
                    </div>
                    <div v-if="bookmarkItem.hasSnapshot || bookmarkItem.hasSummary" class="bm-badges">
                      <BookmarkCapabilityBadge
                        v-if="bookmarkItem.hasSnapshot"
                        type="snapshot"
                        :label="$t('bookmarkMg.badgeArchived')"
                        :tooltip="$t('bookmarkMg.badgeArchivedHint')"
                        @click="openSnap(bookmarkItem.id)"
                        v-click-log="OPERATION_LOG_MAP.bookmarkMg.viewSnapshot"
                      />
                      <BookmarkCapabilityBadge
                        v-if="bookmarkItem.hasSummary"
                        type="summary"
                        :label="$t('bookmarkMg.badgeSummary')"
                        :tooltip="$t('bookmarkMg.badgeSummaryHint')"
                        @click="openSnap(bookmarkItem.id)"
                        v-click-log="OPERATION_LOG_MAP.bookmarkMg.viewSummary"
                      />
                    </div>
                  </div>
                </div>

                <div class="bookmark-actions">
                  <BButton
                    class="bookmark-ai-action"
                    :aria-label="$t('bookmarkMg.aiUseBookmark')"
                    :title="$t('bookmarkMg.aiUseBookmark')"
                    @click="openBookmarksInAi([bookmarkItem])"
                  >
                    <SvgIcon :src="icon.ai.ask" color="currentColor" size="16" aria-hidden="true" />
                  </BButton>
                  <BActionButton
                    action="edit"
                    :label="$t('common.edit')"
                    :tooltip="$t('common.edit')"
                    @click="edit(bookmarkItem.id)"
                  />
                  <BActionButton
                    action="delete"
                    :label="$t('common.delete')"
                    :tooltip="$t('common.delete')"
                    @click="handleDeleteTag(bookmarkItem)"
                  />
                </div>
              </div>

              <div v-if="bookmarkItem.description" class="bookmark-desc">
                {{ bookmarkItem.description }}
              </div>

              <div class="section-block">
                <div class="section-title">{{ $t('bookmarkMg.relatedTag') }}</div>
                <div v-if="bookmarkItem.tagList?.length" class="chip-list">
                  <span
                    v-for="t in bookmarkItem.tagList"
                    :key="t.id"
                    class="common-chip common-chip--bookmark"
                    :title="t.name"
                    @click.stop="router.push(`/tag/${t.id}`)"
                  >
                    {{ t.name }}
                  </span>
                </div>
                <div v-else class="empty-inline">{{ $t('bookmarkMg.noTags') }}</div>
              </div>
            </BCard>
          </div>

          <!-- 表格视图 -->
          <BTable
            v-else-if="viewMode === 'table' && filteredBookmarks.length"
            :data="filteredBookmarks"
            :columns="tagColumns"
            style="margin-top: 10px; width: 100%; height: calc(100% - 50px)"
            :selectable="true"
            :selectedRows="selectedRows"
            :rowKey="'id'"
            @selectionChange="handleSelectionChange"
          >
            <template #bodyCell="{ column, text, record }">
              <template v-if="column.key === 'name'">
                <div style="display: flex; align-items: center; gap: 10px" :title="text">
                  <BookmarkFavicon
                    :bookmark-id="(record as BookmarkInterface).id"
                    :src="(record as BookmarkInterface).iconUrl"
                    :size="20"
                    :tile-size="28"
                  />
                  <div class="text-hidden">{{ text }}</div>
                  <BookmarkCapabilityBadge
                    v-if="(record as BookmarkInterface).hasSnapshot"
                    type="snapshot"
                    compact
                    :label="$t('bookmarkMg.badgeArchived')"
                    :tooltip="$t('bookmarkMg.badgeArchivedHint')"
                    @click="openSnap((record as BookmarkInterface).id)"
                    v-click-log="OPERATION_LOG_MAP.bookmarkMg.viewSnapshot"
                  />
                  <BookmarkCapabilityBadge
                    v-if="(record as BookmarkInterface).hasSummary"
                    type="summary"
                    compact
                    :label="$t('bookmarkMg.badgeSummary')"
                    :tooltip="$t('bookmarkMg.badgeSummaryHint')"
                    @click="openSnap((record as BookmarkInterface).id)"
                    v-click-log="OPERATION_LOG_MAP.bookmarkMg.viewSummary"
                  />
                </div>
              </template>
              <template v-else-if="column.key === 'tagList'">
                <div class="flex-align-center-gap">
                  <span
                    :title="t.name"
                    class="common-tag dom-hover"
                    v-for="t in (record as BookmarkInterface).tagList"
                    :key="t.id"
                    @click.stop="router.push(`/tag/${t.id}`)"
                    >{{ t.name }}</span
                  >
                </div>
              </template>
              <template v-else-if="column.key === 'url'">
                <div class="text-hidden">
                  <a
                    :href="withProtocol(text)"
                    target="_blank"
                    rel="noopener noreferrer"
                    @click="handleStoredBookmarkClick($event, text)"
                    >{{ text }}</a
                  >
                </div>
              </template>
              <template v-else-if="column.key === 'operation'">
                <div class="edit-tag-operation">
                  <BActionButton
                    action="edit"
                    :tooltip="$t('common.edit')"
                    @click="edit((record as BookmarkInterface).id)"
                  />
                  <BActionButton
                    action="delete"
                    :tooltip="$t('common.delete')"
                    @click="handleDeleteTag(record as BookmarkInterface)"
                  />
                </div>
              </template>
            </template>
          </BTable>

          <!-- 已完成请求后的静态空状态。 -->
          <div v-else class="result-status empty-state">
            <div class="result-status-icon">
              <SvgIcon
                :src="hasActiveFilters ? icon.navigation.search : icon.resource.bookmark"
                color="currentColor"
                size="30"
                aria-hidden="true"
              />
            </div>
            <h3>
              {{ hasActiveFilters ? $t('bookmarkMg.emptyResultsTitle') : $t('bookmarkMg.emptyLibraryTitle') }}
            </h3>
            <p>
              {{ hasActiveFilters ? $t('bookmarkMg.emptyResultsDesc') : $t('bookmarkMg.emptyLibraryDesc') }}
            </p>
            <div class="result-status-actions">
              <BButton v-if="hasActiveFilters" type="primary" @click="clearFilters">
                {{ $t('bookmarkMg.clearFilters') }}
              </BButton>
              <template v-else>
                <BButton type="primary" @click="showImportExportModal">
                  <SvgIcon :src="icon.bookmarkManage.importExport" color="currentColor" size="16" aria-hidden="true" />
                  {{ $t('bookmarkMg.importBookmarks') }}
                </BButton>
                <BButton @click="router.push({ path: `/manage/editBookmark/add` })">
                  <SvgIcon :src="icon.common.add" color="currentColor" size="16" aria-hidden="true" />
                  {{ $t('common.add') }}
                </BButton>
              </template>
            </div>
          </div>
        </BCard>
      </section>

      <div class="hidden-upload">
        <BUpload
          ref="importFileInput"
          accept=".xlsx"
          :multiple="false"
          raw-file
          @change="handleExcelFiles"
        />
        <BUpload
          ref="importHTMLFileInput"
          accept=".html,.htm"
          :multiple="false"
          raw-file
          @change="handleHtmlFiles"
        />
      </div>

      <ActionCardModal
        v-if="importExportModalVisible"
        v-model:visible="importExportModalVisible"
        :title="$t('bookmarkMg.importExport')"
        :sections="importExportSections"
        :note="$t('bookmarkMg.exportNote')"
      />
      <LinkHealthModal v-model:visible="healthVisible" />
      <BookmarkSnapshotModal v-model:visible="snapVisible" :bookmark-id="snapBookmarkId" />
      <AiOrganizeModal v-model:visible="aiOrgVisible" @applied="init" />
    </div>
  </ResourcePageShell>
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, defineAsyncComponent, ref, onMounted, onUnmounted } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { batchDeleteSearchResources, clearGlobalSearchCache } from '@/api/search.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import router from '@/router';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BookmarkFavicon from '@/components/base/BookmarkFavicon.vue';
  import icon from '@/config/icon.ts';
  import LinkHealthModal from '@/components/manage/bookmarkMg/LinkHealthModal.vue';
  import BookmarkSnapshotModal from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';
  import AiOrganizeModal from '@/components/manage/bookmarkMg/AiOrganizeModal.vue';
  import BookmarkCapabilityBadge from '@/components/manage/bookmarkMg/BookmarkCapabilityBadge.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BActionButton from '@/components/base/BasicComponents/BActionButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import { useI18n } from 'vue-i18n';
  import { BookmarkInterface } from '@/config/bookmarkCfg.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useBookmarkManage } from '@/composables/useBookmarkManage.ts';
  import { refreshAfterBookmarkImport, useBookmarkIconBatchTracking } from '@/composables/useBookmarkIconBatch';
  import { exportExcelFile, readFirstExcelSheet } from '@/utils/excel';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { resolveBookmarkUrlInput } from '@lightnote/shared';
  import { openAiAssistant } from '@/utils/aiEntry';
  import { buildNetscapeBookmarkHtml } from '@/utils/bookmarkHtml';

  const ActionCardModal = defineAsyncComponent(() => import('@/components/base/ActionCardModal.vue'));

  const user = useUserStore();
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const {
    loading,
    initialLoading,
    loadError,
    bookmarks: tableData,
    reloadBookmarks: init,
    confirmDeleteBookmark,
  } = useBookmarkManage();
  const iconBatchStorageKey = computed(() => `icon-batch-pending:${String(user?.id || 'anonymous')}`);
  const iconBatchTracker = useBookmarkIconBatchTracking({
    bookmarks: tableData,
    reloadBookmarks: init,
    storageKey: iconBatchStorageKey,
    requestStatus: (batchId, cursor) =>
      apiBasePost('/api/bookmark/getIconBatchStatus', { batchId, cursor }, { silent: true }),
    requestRetry: (batchId) =>
      apiBasePost('/api/bookmark/retryIconBatchFailures', { batchId, includeNotFound: true }, { silent: true }),
    notifyFallback: () => message.warning(t('bookmarkMg.iconBatch.fallback')),
    notifyRetryQueued: (count) => message.success(t('bookmarkMg.iconBatch.retryQueued', { count })),
    notifyRetryFailed: () => message.error(t('bookmarkMg.iconBatch.retryFailed')),
  });
  const iconBatchState = iconBatchTracker.state;
  const startIconBatchTracking = iconBatchTracker.start;
  const dismissIconBatch = iconBatchTracker.dismiss;
  const retryIconBatch = iconBatchTracker.retryFailures;
  const iconBatchProgressPercent = computed(() => {
    const total = Number(iconBatchState.value?.total || 0);
    if (total <= 0) return 0;
    return Math.min(100, Math.round((Number(iconBatchState.value?.completed || 0) / total) * 100));
  });
  const iconBatchIsActive = computed(
    () => Number(iconBatchState.value?.queued || 0) + Number(iconBatchState.value?.processing || 0) > 0,
  );
  const iconBatchIsRetryWaiting = computed(
    () => !iconBatchIsActive.value && Number(iconBatchState.value?.retryWaiting || 0) > 0,
  );
  const iconBatchProgressWidth = computed(() =>
    iconBatchIsActive.value ? Math.max(3, iconBatchProgressPercent.value) : iconBatchProgressPercent.value,
  );
  const selectedRows = ref<string[]>([]);
  const importExportModalVisible = ref(false);
  const healthVisible = ref(false);
  const aiOrgVisible = ref(false); // AI 智能整理弹框
  // 列表角标点击 → 弹出网页正文存档 / AI 摘要(与编辑页快照同一弹框)
  const snapVisible = ref(false);
  const snapBookmarkId = ref('');
  const openSnap = (id: string) => {
    snapBookmarkId.value = id;
    snapVisible.value = true;
  };
  const viewMode = ref<'card' | 'table'>('card');
  const cardSelectionMode = ref(false);
  const tableSearchValue = ref('');
  type ImportStage = 'idle' | 'reading' | 'importing' | 'refreshing';
  const importStage = ref<ImportStage>('idle');
  const importFileName = ref('');
  const isImporting = computed(() => importStage.value !== 'idle');
  const importStageIndex = computed(() => ['reading', 'importing', 'refreshing'].indexOf(importStage.value));
  const importSteps = computed(() => [
    t('bookmarkMg.importState.steps.reading'),
    t('bookmarkMg.importState.steps.importing'),
    t('bookmarkMg.importState.steps.refreshing'),
  ]);
  const importStatusTitle = computed(() => {
    const stage = importStage.value === 'idle' ? 'importing' : importStage.value;
    return t(`bookmarkMg.importState.${stage}.title`);
  });
  const importStatusDescription = computed(() => {
    const stage = importStage.value === 'idle' ? 'importing' : importStage.value;
    return t(`bookmarkMg.importState.${stage}.desc`, {
      file: importFileName.value || t('bookmarkMg.importState.unknownFile'),
    });
  });

  type FilterValue = 'all' | string;
  const activeFilter = ref<FilterValue>('all');

  const handleSelectionChange = (selected: string[]) => {
    selectedRows.value = selected;
  };

  function toggleCardSelectionMode() {
    if (cardSelectionMode.value) selectedRows.value = [];
    cardSelectionMode.value = !cardSelectionMode.value;
  }

  function toggleBookmarkSelection(id: string) {
    const selected = new Set(selectedRows.value);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    selectedRows.value = Array.from(selected);
  }

  function openBookmarksInAi(items: BookmarkInterface[]) {
    const available = items.filter((item) => String(item?.id || '').trim());
    if (!available.length) return;
    if (available.length > 5) message.info(t('bookmarkMg.aiMaterialLimit', { count: 5 }));
    const contexts = available.slice(0, 5).map((item) => ({
      type: 'bookmark' as const,
      id: String(item.id),
      title: String(item.name || item.url || t('bookmarkMg.untitled')).slice(0, 255),
    }));
    openAiAssistant({
      contextRefs: contexts,
      suggestedIntent: contexts.length > 1 ? 'compare' : 'summarize',
      surface: 'bookmark_manage',
    });
  }

  function openSelectedBookmarksInAi() {
    openBookmarksInAi(filteredBookmarks.value.filter((item) => selectedRows.value.includes(item.id)));
  }
  const showImportExportModal = () => {
    if (isImporting.value) {
      message.info(t('bookmarkMg.importInProgress'));
      return;
    }
    importExportModalVisible.value = true;
  };

  // ── 筛选逻辑 ──
  const allTags = computed(() => {
    const tagMap = new Map<string, { id: string; name: string; count: number }>();
    tableData.value.forEach((item) => {
      item.tagList?.forEach((t) => {
        if (!tagMap.has(t.id)) {
          tagMap.set(t.id, { id: t.id, name: t.name, count: 0 });
        }
        tagMap.get(t.id)!.count++;
      });
    });
    return Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
  });

  const filteredByKeyword = computed(() => {
    const keyword = tableSearchValue.value.trim().toLowerCase();
    if (!keyword) return tableData.value;
    return tableData.value.filter((item) => item.name?.toLowerCase().includes(keyword));
  });

  const filteredBookmarks = computed(() => {
    const data = filteredByKeyword.value;
    if (activeFilter.value === 'all') return data;
    if (activeFilter.value === 'noTag') return data.filter((item) => !item.tagList?.length);
    return data.filter((item) => item.tagList?.some((t) => t.id === activeFilter.value));
  });
  const hasActiveFilters = computed(() => Boolean(tableSearchValue.value.trim()) || activeFilter.value !== 'all');
  const showLoadError = computed(() => loadError.value && tableData.value.length === 0);

  function clearFilters() {
    tableSearchValue.value = '';
    activeFilter.value = 'all';
  }

  async function retryInitialLoad() {
    try {
      await init();
    } catch {
      // 请求层负责统一提示，页面保留可重试错误状态。
    }
  }
  const selectableBookmarkIds = computed(() =>
    filteredBookmarks.value.map((item) => String(item.id || '')).filter((id) => Boolean(id)),
  );
  const allVisibleBookmarksSelected = computed(
    () =>
      selectableBookmarkIds.value.length > 0 &&
      selectableBookmarkIds.value.every((id) => selectedRows.value.includes(id)),
  );

  const filters = computed(() => {
    const base = filteredByKeyword.value;
    const items: { value: string; label: string; count: number }[] = [
      { value: 'all', label: t('bookmarkMg.filterAll'), count: base.length },
    ];
    allTags.value.forEach((t) => {
      items.push({ value: t.id, label: t.name, count: t.count });
    });
    items.push({
      value: 'noTag',
      label: t('bookmarkMg.filterNoTag'),
      count: base.filter((item) => !item.tagList?.length).length,
    });
    return items;
  });

  const stats = computed(() => {
    const uniqueTagIds = new Set<string>();
    tableData.value.forEach((item) => {
      item.tagList?.forEach((t) => uniqueTagIds.add(t.id));
    });
    const withTags = tableData.value.filter((item) => (item.tagList?.length || 0) > 0).length;
    const valueOrPlaceholder = (value: number) => (initialLoading.value ? '—' : value);
    return [
      {
        key: 'bookmark',
        label: t('bookmarkMg.statTotal'),
        value: valueOrPlaceholder(tableData.value.length),
        desc: t('bookmarkMg.statTotalDesc'),
      },
      {
        key: 'tag',
        label: t('bookmarkMg.statTagTotal'),
        value: valueOrPlaceholder(uniqueTagIds.size),
        desc: t('bookmarkMg.statTagTotalDesc'),
      },
      {
        key: 'note',
        label: t('bookmarkMg.statWithTag'),
        value: valueOrPlaceholder(withTags),
        desc: t('bookmarkMg.statWithTagDesc'),
      },
      {
        key: 'file',
        label: t('bookmarkMg.statNoTag'),
        value: valueOrPlaceholder(tableData.value.length - withTags),
        desc: t('bookmarkMg.statNoTagDesc'),
      },
    ];
  });

  const resultSubtitle = computed(() => {
    if (isImporting.value) return importStatusTitle.value;
    if (initialLoading.value) return t('bookmarkMg.loadingState.title');
    const keyword = tableSearchValue.value.trim();
    if (keyword) {
      return t('bookmarkMg.resultSubtitleKeyword', { keyword, count: filteredBookmarks.value.length });
    }
    return t('bookmarkMg.resultSubtitle', { count: filteredBookmarks.value.length });
  });

  function toggleSelectAllVisibleBookmarks() {
    const selected = new Set(selectedRows.value);
    if (allVisibleBookmarksSelected.value) {
      selectableBookmarkIds.value.forEach((id) => selected.delete(id));
    } else {
      selectableBookmarkIds.value.forEach((id) => selected.add(id));
    }
    selectedRows.value = Array.from(selected);
  }

  // ── 导入导出配置 ──
  const importExportSections = computed(() => [
    {
      key: 'export',
      title: t('bookmarkMg.exportSection'),
      actions: [
        {
          key: 'exportExcel',
          label: t('bookmarkMg.exportExcel'),
          description: t('bookmarkMg.exportExcelDesc'),
          onClick: exportBookmark,
        },
        {
          key: 'exportHTML',
          label: t('bookmarkMg.exportHTML'),
          description: t('bookmarkMg.exportHTMLDesc'),
          onClick: exportBookmarksHTML,
        },
      ],
    },
    {
      key: 'import',
      title: t('bookmarkMg.importSection'),
      actions: [
        {
          key: 'importExcel',
          label: t('bookmarkMg.importExcel'),
          description: t('bookmarkMg.importExcelDesc'),
          onClick: handleImport,
        },
        {
          key: 'importHTML',
          label: t('bookmarkMg.importHTML'),
          description: t('bookmarkMg.importHTMLDesc'),
          onClick: handleImportHTML,
        },
      ],
    },
  ]);

  // ── 表格列 ──
  type BookmarkColumn = {
    title: string;
    key: string;
    minWidth?: string;
    width?: string | number;
    ellipsis?: boolean;
  };
  const tagColumns = ref<BookmarkColumn[]>([
    { title: '书签', key: 'name', minWidth: '200px' },
    { title: '网址', key: 'url', minWidth: '200px', ellipsis: true },
    { title: '关联标签', key: 'tagList', minWidth: '180px' },
    { title: '操作', key: 'operation', width: '90px' },
  ]);

  const edit = (id: string) => {
    router.push({ path: `/manage/editBookmark/${id}` });
  };

  function handleDeleteTag(bookmarkItem: BookmarkInterface) {
    confirmDeleteBookmark(bookmarkItem);
  }

  function handleToBack() {
    // 「我的 → 书签管理」入口已随移动端今日改版移除，入口只剩书签页顶部按钮，
    // 因此移动端也必须回到来源页，不能再固定跳个人中心。
    if (window.history.length > 1) {
      router.back();
      return;
    }
    void router.push('/home');
  }

  // ── 批量删除 ──
  const handleBatchDelete = () => {
    if (blockGuestWrite('delete-bookmark')) return;
    if (selectedRows.value.length === 0) {
      message.warning(t('bookmarkMg.batchDeleteNoSelection'));
      return;
    }
    const selectedIds = [...selectedRows.value];
    Alert.alert({
      title: t('bookmarkMg.batchDeleteConfirmTitle'),
      content: t('bookmarkMg.batchDeleteConfirmContent', { count: selectedIds.length }),
      async onOk() {
        loading.value = true;
        try {
          // 统一走集合型删除接口，避免选中上百条书签时瞬间创建上百个单删请求和事务。
          const res = await batchDeleteSearchResources(selectedIds.map((id) => ({ id, type: 'bookmark' })));
          if (Number(res?.status) !== 200) {
            message.error(res?.msg || t('bookmarkMg.batchDeleteFailed'));
            return;
          }

          const successCount = Number(res?.data?.affectedItemCount || 0);
          const skippedCount = Number(res?.data?.invalidItemCount || 0);
          if (successCount === 0) {
            message.warning(t('bookmarkMg.batchDeleteNoChanges'));
            return;
          }

          recordOperation({
            module: '书签管理',
            operation:
              skippedCount > 0
                ? `批量删除书签部分成功【${successCount}成功/${skippedCount}跳过】`
                : `批量删除书签成功【${successCount}个】`,
          });
          message[skippedCount > 0 ? 'warning' : 'success'](
            skippedCount > 0
              ? t('bookmarkMg.batchDeletePartial', { count: successCount, skipped: skippedCount })
              : t('bookmarkMg.batchDeleteSuccess', { count: successCount }),
          );
          selectedRows.value = [];
          cardSelectionMode.value = false;
          clearGlobalSearchCache();
          await init();
        } catch {
          message.error(t('bookmarkMg.batchDeleteFailed'));
        } finally {
          loading.value = false;
        }
      },
    });
  };

  // ── 导入导出 ──
  async function exportBookmark() {
    loading.value = true;
    const bookmarksToExport =
      selectedRows.value.length > 0
        ? filteredBookmarks.value.filter((item) => selectedRows.value.includes(item.id))
        : filteredBookmarks.value;
    if (bookmarksToExport.length === 0) {
      message.warning('请选择要导出的书签');
      loading.value = false;
      return;
    }
    const exportData = bookmarksToExport.map((item: BookmarkInterface) => ({
      书签名: item.name,
      网址: item.url,
      描述: item?.description,
      标签: (item.tagList || [])
        .map((tag) => String(tag?.name || '').trim())
        .filter(Boolean)
        .join(' | '),
    }));
    const maxLen = [
      Math.max(...exportData.map((item) => item.书签名.length)),
      Math.max(...exportData.map((item) => item.网址.length)),
      Math.max(...exportData.map((item) => item.描述?.length || 0)),
      Math.max(...exportData.map((item) => item.标签.length)),
    ];
    try {
      await exportExcelFile(
        exportData,
        [
          { header: '书签名', key: '书签名', width: Math.max(maxLen[0], 12) },
          { header: '网址', key: '网址', width: Math.max(maxLen[1], 20) },
          { header: '描述', key: '描述', width: 50 },
          { header: '标签', key: '标签', width: Math.min(Math.max(maxLen[3], 12), 40) },
        ],
        '书签集合.xlsx',
      );
      importExportModalVisible.value = false;
      message.success('Excel导出成功');
      recordOperation({
        ...OPERATION_LOG_MAP.bookmarkMg.exportToExcel,
        operation: `导出 Excel 书签成功【${bookmarksToExport.length}个】`,
      });
    } catch (error: any) {
      message.error(`Excel导出失败：${error.message || '未知错误'}`);
    } finally {
      loading.value = false;
    }
  }

  function exportBookmarksHTML() {
    loading.value = true;
    const bookmarksToExport =
      selectedRows.value.length > 0
        ? filteredBookmarks.value.filter((item) => selectedRows.value.includes(item.id))
        : filteredBookmarks.value;
    if (bookmarksToExport.length === 0) {
      message.warning('请选择要导出的书签');
      loading.value = false;
      return;
    }
    const groupedBookmarks: Record<string, BookmarkInterface[]> = {};
    bookmarksToExport.forEach((bookmarkItem) => {
      if (bookmarkItem.tagList && bookmarkItem.tagList.length > 0) {
        bookmarkItem.tagList.forEach((tag) => {
          if (!groupedBookmarks[tag.name]) groupedBookmarks[tag.name] = [];
          groupedBookmarks[tag.name].push(bookmarkItem);
        });
      } else {
        if (!groupedBookmarks['未分类']) groupedBookmarks['未分类'] = [];
        groupedBookmarks['未分类'].push(bookmarkItem);
      }
    });
    const html = buildNetscapeBookmarkHtml(
      Object.entries(groupedBookmarks).map(([name, bookmarks]) => ({ name, bookmarks })),
    );
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookmarks.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    importExportModalVisible.value = false;
    message.success('HTML书签导出成功');
    recordOperation({ module: '书签管理', operation: `导出 HTML 书签成功【${bookmarksToExport.length}个】` });
    loading.value = false;
  }

  // 兜底展示层:新增/编辑书签时后端已统一补协议头,但存量数据可能是补全前存的裸域名;
  // <a :href> 遇到裸域名会当相对路径解析,拼出 https://boluo66.top/xxx.com 这种坏链接
  function withProtocol(url: string) {
    return resolveBookmarkUrlInput(url, { allowTextExtraction: false }).canonicalUrl;
  }

  function handleStoredBookmarkClick(event: MouseEvent, url: string) {
    if (withProtocol(url)) return;
    event.preventDefault();
    message.warning(t('bookmarkUrl.invalid'));
  }

  type BUploadExpose = { open: () => void };
  const importFileInput = ref<BUploadExpose | null>(null);
  const handleImport = () => {
    if (blockGuestWrite('import-bookmark')) return;
    if (isImporting.value) {
      message.info(t('bookmarkMg.importInProgress'));
      return;
    }
    importFileInput.value?.open();
    importExportModalVisible.value = false;
  };

  const importHTMLFileInput = ref<BUploadExpose | null>(null);
  const handleImportHTML = () => {
    if (blockGuestWrite('import-bookmark')) return;
    if (isImporting.value) {
      message.info(t('bookmarkMg.importInProgress'));
      return;
    }
    importHTMLFileInput.value?.open();
    importExportModalVisible.value = false;
  };

  const handleExcelFiles = (files: File[]) => {
    const file = files?.[0];
    if (file) handleFileChange(file);
  };

  const handleFileChange = async (file: File) => {
    if (!file || isImporting.value) return;
    importFileName.value = file.name;
    importStage.value = 'reading';
    try {
      const jsonData = await readFirstExcelSheet(file);
      const requiredColumns = ['书签名', '网址', '描述'];
      const hasRequired = requiredColumns.every((col) => jsonData.length > 0 && Object.keys(jsonData[0]).includes(col));
      if (!hasRequired) {
        message.error(t('bookmarkMg.excelImportFormatInvalid'));
        return;
      }
      const bookmarksToImport = jsonData.map((item: any) => ({
        name: String(item['书签名'] ?? '').trim(),
        url: String(item['网址'] ?? '').trim(),
        description: String(item['描述'] ?? '').trim(),
        tagNames: Array.from(
          new Set(
            String(item['标签'] || '')
              .split('|')
              .map((tagName) => tagName.trim())
              .filter(Boolean),
          ),
        ),
      }));
      importStage.value = 'importing';
      const res = await apiBasePost(
        '/api/bookmark/importBookmarksExcel',
        { items: bookmarksToImport },
        { silent: true },
      );
      if (Number(res?.status) !== 200) {
        message.error(res?.msg || t('bookmarkMg.excelImportFailed'));
        return;
      }

      const { parsedTotal, createdTags, createdBookmarks, boundRelations, skippedInvalidUrls, iconBatch } =
        res.data || {};
      const summary = t('bookmarkMg.excelImportSummary', {
        parsed: parsedTotal || 0,
        tags: createdTags || 0,
        bookmarks: createdBookmarks || 0,
        relations: boundRelations || 0,
      });
      if (Number(createdBookmarks || 0) > 0 || Number(boundRelations || 0) > 0) {
        recordOperation({
          module: '书签管理',
          operation: `导入 Excel 书签完成【解析${parsedTotal || 0}条/新增书签${createdBookmarks || 0}个/新增标签${createdTags || 0}个/关联${boundRelations || 0}条】`,
        });
      }
      importStage.value = 'refreshing';
      await refreshAfterBookmarkImport(iconBatch, startIconBatchTracking, init);
      message.success(
        skippedInvalidUrls
          ? `${summary}${t('bookmarkMg.excelImportInvalidUrls', { count: skippedInvalidUrls })}`
          : summary,
      );
    } catch (err: any) {
      message.error(err?.message || t('bookmarkMg.excelImportFailed'));
    } finally {
      importStage.value = 'idle';
      importFileName.value = '';
    }
  };

  const handleHtmlFiles = (files: File[]) => {
    const file = files?.[0];
    if (file) handleHTMLFileChange(file);
  };

  const handleHTMLFileChange = async (file: File) => {
    if (!file || isImporting.value) return;
    importFileName.value = file.name;
    importStage.value = 'importing';
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiBasePost('/api/bookmark/importBookmarksHtml', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.status === 200) {
        const { parsedTotal, createdTags, createdBookmarks, boundRelations, skippedInvalidUrls, iconBatch } =
          res.data || {};
        const summary = t('bookmarkMg.excelImportSummary', {
          parsed: parsedTotal || 0,
          tags: createdTags || 0,
          bookmarks: createdBookmarks || 0,
          relations: boundRelations || 0,
        });
        recordOperation({
          module: '书签管理',
          operation: `导入 HTML 书签成功【新增书签${createdBookmarks || 0}个/标签${createdTags || 0}个】`,
        });
        importStage.value = 'refreshing';
        await refreshAfterBookmarkImport(iconBatch, startIconBatchTracking, init);
        message.success(
          skippedInvalidUrls
            ? `${summary}${t('bookmarkMg.excelImportInvalidUrls', { count: skippedInvalidUrls })}`
            : summary,
        );
      } else {
        message.error(res.msg || '导入失败');
      }
    } catch (err: any) {
      message.error('文件处理失败: ' + (err?.message || err));
    } finally {
      importStage.value = 'idle';
      importFileName.value = '';
    }
  };

  onMounted(async () => {
    const pending = iconBatchTracker.readPendingBatch();
    if (pending) {
      try {
        await init({ refreshIcons: false });
        await startIconBatchTracking(pending, 0);
      } catch {
        // 列表错误状态和批次追踪降级逻辑分别负责反馈。
      }
      return;
    }
    await retryInitialLoad();
  });

  onUnmounted(() => {
    iconBatchTracker.stopForUnmount();
  });
</script>

<style lang="less" scoped>
  @color-mix-hover: 10%;
  @color-mix-active: 14%;
  @opacity-primary: 0.72;
  @opacity-secondary: 0.54;
  @radius-card: 16px;
  @radius-sm: 10px;

  .bookmark-manage-page {
    --bm-panel-bg: var(--workspace-panel-bg-color);
    --bm-card-bg: var(--card-background);
    --bm-muted-bg: var(--bl-input-noBorder-bg-color);

    height: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .bookmark-manage-page--night {
    --bm-panel-bg: var(--workspace-panel-bg-color);
    --bm-card-bg: var(--card-background);
    --bm-muted-bg: var(--bl-input-noBorder-bg-color);
  }

  .icon-batch-progress-card {
    margin-bottom: 16px;
    border-left: 3px solid var(--resource-bookmark-color);
  }

  .icon-batch-progress-content {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(240px, auto) auto;
    align-items: center;
    gap: 12px 20px;
  }

  .icon-batch-progress-title {
    color: var(--text-color);
    font-size: 14px;
    font-weight: 650;
  }

  .icon-batch-progress-hint {
    margin-top: 4px;
    color: var(--sub-text-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .icon-batch-progress-track {
    position: relative;
    width: min(360px, 100%);
    height: 5px;
    margin-top: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--resource-bookmark-color) 10%, var(--bm-muted-bg));
  }

  .icon-batch-progress-value {
    position: relative;
    display: block;
    height: 100%;
    overflow: hidden;
    border-radius: inherit;
    background: var(--resource-bookmark-color);
    transition: width 0.3s ease;
  }

  .icon-batch-progress-value--active::after {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, white 70%, transparent), transparent);
    content: '';
    transform: translateX(-100%);
    animation: bm-icon-progress-shimmer 1.4s ease-in-out infinite;
  }

  .icon-batch-progress-detail,
  .icon-batch-progress-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
  }

  .icon-batch-progress-detail {
    color: var(--sub-text-color);
    font-size: 12px;
  }

  .icon-batch-progress-actions {
    justify-content: flex-end;
  }

  @media (max-width: 720px) {
    .icon-batch-progress-content {
      grid-template-columns: 1fr;
    }

    .icon-batch-progress-actions {
      justify-content: flex-start;
    }
  }

  :deep(.resource-page-actions .b_btn) {
    gap: 6px;
  }

  :deep(.resource-page-actions .resource-action) {
    height: 36px;
    padding: 0 13px;
    border: 1px solid transparent;
    border-radius: 9px;
    line-height: 36px;
    transition:
      color 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease;
  }

  :deep(.resource-page-actions .resource-action--utility) {
    color: var(--text-color);
    border-color: var(--surface-border-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);

    &:hover {
      color: var(--resource-bookmark-color);
      border-color: color-mix(in srgb, var(--resource-bookmark-color) 24%, var(--surface-border-color));
      background: color-mix(in srgb, var(--resource-bookmark-color) 4%, var(--card-background));
    }
  }

  :deep(.resource-page-actions .resource-action--ai) {
    color: var(--resource-bookmark-color);
    border-color: color-mix(in srgb, var(--resource-bookmark-color) 18%, var(--surface-border-color));
    background: color-mix(in srgb, var(--resource-bookmark-color) 8%, var(--card-background));

    &:hover {
      border-color: color-mix(in srgb, var(--resource-bookmark-color) 34%, var(--surface-border-color));
      background: color-mix(in srgb, var(--resource-bookmark-color) 12%, var(--card-background));
    }
  }

  :deep(.resource-page-actions .resource-action--primary) {
    box-shadow: 0 8px 18px -12px color-mix(in srgb, var(--resource-bookmark-color) 72%, transparent);
  }

  .hidden-upload {
    display: none;
  }

  .hero-stats-section {
    flex: 0 0 auto;
  }

  .result-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    gap: 16px;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .result-toolbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .result-toolbar-right {
    text-align: right;
    flex-shrink: 0;
  }

  .result-selection-count {
    margin-top: 4px;
    color: var(--resource-bookmark-color);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .result-search {
    width: 200px;
  }

  .view-toggle {
    display: flex;
    gap: 4px;
    background: var(--bm-muted-bg);
    border-radius: 8px;
    padding: 3px;
  }

  .view-toggle-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    border: 0;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    cursor: pointer;
    color: var(--desc-color);
    background: transparent;
    transition: all 0.18s ease;
    white-space: nowrap;
    width: auto;
    height: 28px;
    line-height: 28px;
    &.active {
      background: var(--bm-card-bg);
      color: var(--text-color);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    &:hover:not(.active) {
      color: var(--text-color);
    }
  }

  .card-selection-toggle.active {
    color: var(--resource-bookmark-color);
    border-color: color-mix(in srgb, var(--resource-bookmark-color) 38%, var(--surface-border-color));
    background: color-mix(in srgb, var(--resource-bookmark-color) 10%, var(--bm-muted-bg));
  }

  // ── Stats ──
  .hero-stats {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .stat-card {
    --stat-accent: var(--resource-bookmark-color);
    --b-card-background: var(--card-background);
    --b-card-border-color: var(--surface-border-color);
    --b-card-shadow: var(--surface-card-shadow);

    border-radius: 12px;
    position: relative;
    overflow: hidden;
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
    }
  }

  .stat-card--bookmark {
    --stat-accent: var(--resource-bookmark-color);
  }
  .stat-card--tag {
    --stat-accent: var(--resource-tag-color);
  }
  .stat-card--note {
    --stat-accent: var(--resource-note-color);
  }
  .stat-card--file {
    --stat-accent: var(--resource-file-color);
  }

  .stat-card::before {
    background: var(--stat-accent);
  }

  .stat-label {
    font-size: 11px;
    opacity: @opacity-secondary;
  }
  .stat-value {
    margin-top: 4px;
    font-size: 22px;
    font-weight: 700;
  }
  .stat-desc {
    margin-top: 2px;
    font-size: 11px;
    opacity: @opacity-secondary;
  }

  // ── Layout ──
  .content-layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 14px;
    margin-top: 14px;
    flex: 1;
    min-height: 0;
  }

  .filter-panel,
  .result-panel {
    --b-card-border-color: var(--surface-border-color);

    border-radius: @radius-card;
    overflow-y: auto;
  }

  .filter-panel {
    --b-card-shadow: var(--surface-card-shadow);
  }

  .filter-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: @opacity-secondary;
    margin-bottom: 10px;
    padding: 0 4px;
  }

  .filter-item {
    width: 100%;
    border: 0;
    border-radius: @radius-sm;
    background: transparent;
    color: inherit;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    transition: all 0.18s ease;
    height: auto;
    min-height: 40px;
    line-height: 1.3;
    & + & {
      margin-top: 4px;
    }
    &:hover {
      background: color-mix(in srgb, var(--resource-bookmark-color) @color-mix-hover, var(--bm-muted-bg));
    }
    &.active {
      background: color-mix(in srgb, var(--resource-bookmark-color) @color-mix-active, var(--bm-muted-bg));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--resource-bookmark-color) 20%, transparent);
    }
  }

  .filter-left {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .filter-count {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    opacity: @opacity-secondary;
  }

  .filter-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--resource-bookmark-color);
    flex-shrink: 0;
  }
  .filter-dot--noTag {
    background: #94a3b8;
  }

  .result-panel {
    --b-card-background: var(--bm-panel-bg);
  }

  .result-panel :deep(.table-container) {
    border: 1px solid var(--surface-border-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }

  .result-title {
    font-size: 16px;
    font-weight: 600;
  }
  .result-subtitle {
    font-size: 13px;
    opacity: @opacity-secondary;
    margin-top: 4px;
  }

  // ── 卡片视图 ──
  .bookmark-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
    gap: 16px;
  }

  .bookmark-card {
    --b-card-background: var(--bm-card-bg);
    --b-card-border-color: var(--surface-border-color);
    --b-card-shadow: var(--surface-card-shadow);

    border-radius: @radius-card;
    transition:
      box-shadow 0.2s ease,
      border-color 0.2s ease;
    position: relative;
    overflow: hidden;
    &::before {
      content: '';
      position: absolute;
      top: -30px;
      right: -20px;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        color-mix(in srgb, var(--resource-bookmark-color) 5%, transparent) 0%,
        transparent 70%
      );
      pointer-events: none;
    }
    &:hover {
      box-shadow: var(--surface-hover-shadow);
      border-color: color-mix(in srgb, var(--resource-bookmark-color) 28%, var(--surface-border-color));
    }

    &.is-selected {
      border-color: var(--resource-bookmark-color);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--resource-bookmark-color) 18%, transparent);
    }
  }

  .bookmark-card__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .bookmark-identity {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .bookmark-selection-checkbox {
    flex: 0 0 auto;
    margin: -4px 0 0 -4px;
  }

  .bookmark-meta {
    min-width: 0;
    flex: 1;
  }
  .bookmark-name {
    font-size: 15px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bookmark-url {
    margin-top: 4px;
    font-size: 12px;
    opacity: @opacity-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    a {
      color: inherit;
      text-decoration: none;
      &:hover {
        color: var(--resource-bookmark-color);
      }
    }
  }

  // ── 正文存档 / AI 摘要 角标 ──
  .bm-badges {
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    margin-top: 6px;
  }

  .bookmark-desc {
    margin-top: 10px;
    font-size: 13px;
    opacity: @opacity-primary;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .bookmark-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .bookmark-ai-action {
    width: 32px;
    min-width: 32px;
    height: 32px;
    padding: 0;
    color: var(--primary-color);
  }

  // ── 卡片内区块 ──
  .section-block {
    margin-top: 12px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: @opacity-secondary;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    &::before {
      content: '';
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--resource-bookmark-color);
    }
  }

  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .common-chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    border: 1px solid var(--card-border-color);
    cursor: pointer;
    transition: all 0.18s ease;
    &:hover {
      transform: translateY(-1px);
    }
  }

  .common-chip--bookmark:hover {
    border-color: var(--resource-bookmark-color);
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 8%, transparent);
  }

  .empty-inline {
    font-size: 12px;
    opacity: @opacity-secondary;
  }

  // ── 首次加载骨架 ──
  .bookmark-skeleton {
    min-height: 320px;
  }

  .bookmark-skeleton-card {
    min-height: 156px;
    pointer-events: none;
  }

  .skeleton-head,
  .skeleton-lines {
    display: flex;
    align-items: center;
  }

  .skeleton-head {
    gap: 12px;
  }

  .skeleton-lines {
    min-width: 0;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .skeleton-block {
    display: block;
    background: color-mix(in srgb, var(--resource-bookmark-color) 9%, var(--bm-muted-bg));
    animation: bm-skeleton-pulse 1.2s ease-in-out infinite alternate;
  }

  .skeleton-avatar {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    border-radius: 12px;
  }

  .skeleton-line {
    height: 10px;
    border-radius: 999px;
  }

  .skeleton-line--title {
    width: min(180px, 72%);
  }

  .skeleton-line--url {
    width: min(260px, 88%);
  }

  .skeleton-line--body {
    width: 64%;
    margin-top: 22px;
  }

  .skeleton-chip {
    width: 58px;
    height: 24px;
    margin-top: 22px;
    border-radius: 999px;
  }

  .table-skeleton {
    display: grid;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    overflow: hidden;
    background: var(--card-background);
  }

  .table-skeleton-row {
    display: grid;
    grid-template-columns: 1.2fr 1.5fr 1fr 76px;
    align-items: center;
    gap: 24px;
    min-height: 54px;
    padding: 0 18px;
    border-bottom: 1px solid var(--surface-border-color);

    &:last-child {
      border-bottom: 0;
    }
  }

  .table-skeleton-cell {
    width: 100%;
    height: 10px;
    border-radius: 999px;
  }

  .table-skeleton-cell--name {
    width: 78%;
  }

  .table-skeleton-cell--tag {
    width: 62%;
  }

  .table-skeleton-cell--action {
    width: 54px;
    justify-self: end;
  }

  @keyframes bm-skeleton-pulse {
    from {
      opacity: 0.5;
    }
    to {
      opacity: 0.9;
    }
  }

  // ── 导入、错误和空状态 ──
  .result-status {
    display: flex;
    min-height: 320px;
    box-sizing: border-box;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 36px 24px;
    border: 1px dashed var(--surface-border-color);
    border-radius: @radius-card;
    background: linear-gradient(135deg, transparent 0%, var(--bm-muted-bg) 100%);
    text-align: center;

    h3 {
      margin: 16px 0 8px;
      color: var(--text-color);
      font-size: 18px;
      font-weight: 650;
    }

    p {
      max-width: 520px;
      margin: 0;
      color: var(--sub-text-color);
      font-size: 13px;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }
  }

  .result-status-icon {
    display: grid;
    width: 64px;
    height: 64px;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--resource-bookmark-color) 22%, var(--surface-border-color));
    border-radius: 18px;
    background: color-mix(in srgb, var(--resource-bookmark-color) 10%, var(--card-background));
    color: var(--resource-bookmark-color);
    box-shadow: 0 14px 32px -24px color-mix(in srgb, var(--resource-bookmark-color) 82%, transparent);
  }

  .result-status-icon--import {
    background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
    border-color: color-mix(in srgb, var(--primary-color) 24%, var(--surface-border-color));
    color: var(--primary-color);
  }

  .result-status-icon--error {
    background: color-mix(in srgb, var(--warning-color, #f59e0b) 10%, var(--card-background));
    border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 24%, var(--surface-border-color));
    color: var(--warning-color, #f59e0b);
  }

  .result-status-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 22px;
  }

  .import-status {
    border-style: solid;
    border-color: color-mix(in srgb, var(--primary-color) 18%, var(--surface-border-color));
  }

  .import-status .result-status-icon {
    animation: bm-import-icon-breathe 1.5s ease-in-out infinite;
  }

  .import-progress-track {
    width: min(420px, 100%);
    height: 6px;
    margin-top: 22px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 10%, var(--bm-muted-bg));
  }

  .import-progress-value {
    display: block;
    width: 38%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--primary-color) 60%, transparent),
      var(--primary-color),
      color-mix(in srgb, var(--resource-bookmark-color) 70%, var(--primary-color))
    );
    box-shadow: 0 0 12px color-mix(in srgb, var(--primary-color) 28%, transparent);
    animation: bm-import-progress 1.35s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  .import-steps {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px 18px;
    margin-top: 24px;
  }

  .import-step {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--sub-text-color);
    font-size: 12px;
  }

  .import-step-dot {
    display: grid;
    width: 22px;
    height: 22px;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--card-background);
    color: var(--sub-text-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .import-step--active {
    color: var(--primary-color);
    font-weight: 600;

    .import-step-dot {
      border-color: var(--primary-color);
      color: var(--primary-color);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 10%, transparent);
      animation: bm-import-step-pulse 1.2s ease-in-out infinite;
    }
  }

  .import-step--done {
    color: var(--text-color);

    .import-step-dot {
      border-color: color-mix(in srgb, var(--resource-bookmark-color) 40%, var(--surface-border-color));
      background: color-mix(in srgb, var(--resource-bookmark-color) 12%, var(--card-background));
      color: var(--resource-bookmark-color);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-block,
    .import-status .result-status-icon,
    .import-progress-value,
    .import-step--active .import-step-dot,
    .icon-batch-progress-value--active::after {
      animation: none;
    }

    .skeleton-block {
      opacity: 0.72;
    }

    .import-progress-value {
      width: 64%;
      transform: none;
    }
  }

  @keyframes bm-import-progress {
    from {
      transform: translateX(-110%);
    }
    to {
      transform: translateX(275%);
    }
  }

  @keyframes bm-import-icon-breathe {
    0%,
    100% {
      transform: translateY(0);
      box-shadow: 0 14px 32px -24px color-mix(in srgb, var(--primary-color) 82%, transparent);
    }
    50% {
      transform: translateY(-3px);
      box-shadow: 0 18px 38px -20px color-mix(in srgb, var(--primary-color) 92%, transparent);
    }
  }

  @keyframes bm-import-step-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 10%, transparent);
    }
    50% {
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--primary-color) 5%, transparent);
    }
  }

  @keyframes bm-icon-progress-shimmer {
    to {
      transform: translateX(100%);
    }
  }

  .empty-state .result-status-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
  }

  // ── 表格保留样式 ──
  .edit-tag-operation {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  @media (max-width: 1280px) {
    .hero-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .content-layout {
      grid-template-columns: 1fr;
    }
    .filter-panel {
      position: static;
    }
    .bookmark-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
