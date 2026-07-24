<template>
  <b-loading :loading="loading">
    <ResourcePageShell
      :title="$t('bookmarkMg.title')"
      :subtitle="$t('bookmarkMg.subtitle')"
      accent="bookmark"
      layout="workspace"
      show-back
      @back="handleToBack"
    >
      <template #actions>
        <BButton v-if="viewMode === 'table' && selectedRows.length > 0" @click="openSelectedBookmarksInAi">
          <SvgIcon :src="icon.ai.ask" color="currentColor" size="16" aria-hidden="true" />
          {{ $t('bookmarkMg.aiUseSelected') }}
        </BButton>
        <BButton v-if="viewMode === 'table' && selectedRows.length > 0" type="danger" @click="handleBatchDelete">
          {{ $t('bookmarkMg.batchDelete') }}
        </BButton>
        <BButton
          class="resource-action resource-action--utility"
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
                  <BButton
                    class="view-toggle-btn"
                    :class="{ active: viewMode === 'table' }"
                    @click="viewMode = 'table'"
                  >
                    <svg-icon :src="icon.navigation.menu" size="14" />
                    <span>{{ $t('bookmarkMg.tableView') }}</span>
                  </BButton>
                </div>
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
              </div>
            </div>

            <!-- 卡片视图 -->
            <div v-if="viewMode === 'card' && filteredBookmarks.length" class="bookmark-grid">
              <BCard
                v-for="bookmarkItem in filteredBookmarks"
                :key="bookmarkItem.id"
                as="article"
                variant="card"
                padding="18px"
                class="bookmark-card"
              >
                <div class="bookmark-card__head">
                  <div class="bookmark-identity">
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
              v-if="viewMode === 'table'"
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

            <!-- 空状态 -->
            <div v-if="viewMode === 'card' && !filteredBookmarks.length" class="empty-state">
              <div class="empty-orbit"></div>
              <h3>{{ $t('bookmarkMg.emptyTitle') }}</h3>
              <p>{{ $t('bookmarkMg.emptyDesc') }}</p>
            </div>
          </BCard>
        </section>

        <BUpload
          ref="importFileInput"
          class="hidden-upload"
          accept=".xlsx"
          :multiple="false"
          raw-file
          @change="handleExcelFiles"
        />
        <BUpload
          ref="importHTMLFileInput"
          class="hidden-upload"
          accept=".html,.htm"
          :multiple="false"
          raw-file
          @change="handleHtmlFiles"
        />

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
  </b-loading>
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, defineAsyncComponent, ref } from 'vue';
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
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BActionButton from '@/components/base/BasicComponents/BActionButton.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import { useI18n } from 'vue-i18n';
  import { BookmarkInterface } from '@/config/bookmarkCfg.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useBookmarkManage } from '@/composables/useBookmarkManage.ts';
  import { exportExcelFile, readFirstExcelSheet } from '@/utils/excel';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { resolveBookmarkUrlInput } from '@lightnote/shared';
  import { openAiAssistant } from '@/utils/aiEntry';
  import { buildNetscapeBookmarkHtml } from '@/utils/bookmarkHtml';

  const ActionCardModal = defineAsyncComponent(() => import('@/components/base/ActionCardModal.vue'));

  const user = useUserStore();
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const { loading, bookmarks: tableData, reloadBookmarks: init, confirmDeleteBookmark } = useBookmarkManage();
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
  const tableSearchValue = ref('');

  type FilterValue = 'all' | string;
  const activeFilter = ref<FilterValue>('all');

  const handleSelectionChange = (selected: string[]) => {
    selectedRows.value = selected;
  };

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
    return [
      {
        key: 'bookmark',
        label: t('bookmarkMg.statTotal'),
        value: tableData.value.length,
        desc: t('bookmarkMg.statTotalDesc'),
      },
      {
        key: 'tag',
        label: t('bookmarkMg.statTagTotal'),
        value: uniqueTagIds.size,
        desc: t('bookmarkMg.statTagTotalDesc'),
      },
      { key: 'note', label: t('bookmarkMg.statWithTag'), value: withTags, desc: t('bookmarkMg.statWithTagDesc') },
      {
        key: 'file',
        label: t('bookmarkMg.statNoTag'),
        value: tableData.value.length - withTags,
        desc: t('bookmarkMg.statNoTagDesc'),
      },
    ];
  });

  const resultSubtitle = computed(() => {
    const keyword = tableSearchValue.value.trim();
    if (keyword) {
      return t('bookmarkMg.resultSubtitleKeyword', { keyword, count: filteredBookmarks.value.length });
    }
    return t('bookmarkMg.resultSubtitle', { count: filteredBookmarks.value.length });
  });

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
  const tagColumns = ref([
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
    if (bookmark.isMobile) {
      router.push('/personCenter');
    } else {
      router.back();
    }
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
    importFileInput.value?.open();
    importExportModalVisible.value = false;
  };

  const importHTMLFileInput = ref<BUploadExpose | null>(null);
  const handleImportHTML = () => {
    if (blockGuestWrite('import-bookmark')) return;
    importHTMLFileInput.value?.open();
    importExportModalVisible.value = false;
  };

  const handleExcelFiles = (files: File[]) => {
    const file = files?.[0];
    if (file) handleFileChange(file);
  };

  const handleFileChange = async (file: File) => {
    if (!file) return;
    try {
      loading.value = true;
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
      const res = await apiBasePost(
        '/api/bookmark/importBookmarksExcel',
        { items: bookmarksToImport },
        { silent: true },
      );
      if (Number(res?.status) !== 200) {
        message.error(res?.msg || t('bookmarkMg.excelImportFailed'));
        return;
      }

      const { parsedTotal, createdTags, createdBookmarks, boundRelations, skippedInvalidUrls } = res.data || {};
      const summary = t('bookmarkMg.excelImportSummary', {
        parsed: parsedTotal || 0,
        tags: createdTags || 0,
        bookmarks: createdBookmarks || 0,
        relations: boundRelations || 0,
      });
      message.success(
        skippedInvalidUrls
          ? `${summary}${t('bookmarkMg.excelImportInvalidUrls', { count: skippedInvalidUrls })}`
          : summary,
      );
      if (Number(createdBookmarks || 0) > 0 || Number(boundRelations || 0) > 0) {
        recordOperation({
          module: '书签管理',
          operation: `导入 Excel 书签完成【解析${parsedTotal || 0}条/新增书签${createdBookmarks || 0}个/新增标签${createdTags || 0}个/关联${boundRelations || 0}条】`,
        });
      }
      await init();
    } catch (err: any) {
      message.error(err?.message || t('bookmarkMg.excelImportFailed'));
    } finally {
      loading.value = false;
    }
  };

  const handleHtmlFiles = (files: File[]) => {
    const file = files?.[0];
    if (file) handleHTMLFileChange(file);
  };

  const handleHTMLFileChange = async (file: File) => {
    if (!file) return;
    try {
      loading.value = true;
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiBasePost('/api/bookmark/importBookmarksHtml', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.status === 200) {
        const { parsedTotal, createdTags, createdBookmarks, boundRelations, skippedInvalidUrls } = res.data || {};
        message.success(
          `导入完成：解析 ${parsedTotal || 0}，新标签 ${createdTags || 0}，新书签 ${createdBookmarks || 0}，建立关联 ${boundRelations || 0}${skippedInvalidUrls ? `，跳过无效地址 ${skippedInvalidUrls}` : ''}`,
        );
        recordOperation({
          module: '书签管理',
          operation: `导入 HTML 书签成功【新增书签${createdBookmarks || 0}个/标签${createdTags || 0}个】`,
        });
        await init();
      } else {
        message.error(res.msg || '导入失败');
      }
      loading.value = false;
    } catch (err: any) {
      message.error('文件处理失败: ' + (err?.message || err));
      loading.value = false;
    }
  };

  init();
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

  // ── Stats ──
  .hero-stats {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .stat-card {
    --stat-accent: var(--resource-bookmark-color);
    --b-card-background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--stat-accent) 5%, var(--card-background)),
      var(--card-background)
    );
    --b-card-border-color: color-mix(in srgb, var(--stat-accent) 20%, var(--surface-border-color));
    --b-card-shadow: 0 10px 26px -24px color-mix(in srgb, var(--stat-accent) 76%, transparent);

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

  .bookmark-meta {
    min-width: 0;
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
    flex-wrap: wrap;
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

  // ── 空状态 ──
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 320px;
    border: 2px dashed var(--card-border-color);
    border-radius: @radius-card;
    background: linear-gradient(135deg, transparent 0%, var(--bm-muted-bg) 100%);
    h3 {
      margin: 16px 0 8px;
      font-size: 18px;
      opacity: @opacity-primary;
    }
    p {
      margin: 0;
      font-size: 13px;
      opacity: @opacity-secondary;
    }
  }

  .empty-orbit {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 3px solid color-mix(in srgb, var(--resource-bookmark-color) 14%, transparent);
    border-top-color: var(--resource-bookmark-color);
    animation: bm-orbit 1.2s linear infinite;
  }

  @keyframes bm-orbit {
    to {
      transform: rotate(360deg);
    }
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
