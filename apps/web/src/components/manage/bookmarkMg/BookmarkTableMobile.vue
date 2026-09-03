<template>
  <PhoneListMg
    class="bookmark-mobile-list"
    :class="{ 'bookmark-mobile-list--batch': batchMode }"
    :loading="initialLoading"
    :error="loadError"
    :list-data="tableData"
    :title="$t('bookmarkMg.title')"
    :subtitle="$t('bookmarkMg.subtitle')"
    :selected-keys="selectedIds"
    :show-actions="false"
    :show-header="false"
    @add="router.push('/manage/editBookmark/add')"
    @item-click="handleItemClick"
    @retry="retryLoad"
  >
    <template #item="{ data }">
      <span class="bookmark-item-main" :class="{ 'is-batch-mode': batchMode }">
        <BookmarkFavicon :bookmark-id="data.id" :src="data.iconUrl" :size="20" :tile-size="38" />
        <span class="bookmark-item-copy">
          <span class="bookmark-item-name">{{ data.name }}</span>
          <span v-if="data.hasSnapshot || data.hasSummary" class="bm-badges">
            <BookmarkCapabilityBadge
              type="snapshot"
              :label="$t('bookmarkMg.badgeArchived')"
              :tooltip="$t('bookmarkMg.badgeArchivedHint')"
              @click="handleBookmarkSnapshotClick(data)"
              v-click-log="OPERATION_LOG_MAP.bookmarkMg.viewSnapshot"
            />
          </span>
        </span>
      </span>
      <span class="edit-tag-operation" aria-hidden="true">
        <span
          v-if="batchMode"
          class="bookmark-selection-indicator"
          :class="{ 'is-selected': selectedIds.includes(String(data.id)) }"
        >
          <SvgIcon v-if="selectedIds.includes(String(data.id))" :src="icon.filterPanel.check" size="17" />
        </span>
        <span v-else class="bookmark-more-indicator">
          <SvgIcon :src="icon.common.more" size="18" />
        </span>
      </span>
    </template>
  </PhoneListMg>
  <ResourceBatchActionBar
    :open="batchMode"
    mobile
    :summary="batchActionSummary"
    :aria-label="$t('resourceOutcome.batch.ariaLabel')"
    :clear-label="$t('resourceOutcome.batch.clear')"
    :show-clear="false"
    :show-mobile-primary="false"
    :primary-label="$t('resourceOutcome.primaryAction')"
    :more-label="$t('common.more')"
    :primary-disabled="!selectedIds.length"
    :primary-disabled-reason="!selectedIds.length ? $t('resourceOutcome.batch.selectFirst') : ''"
    @more="mobileBatchActionsOpen = true"
  >
    <template #leading>
      <BCheckbox
        :checked="allBookmarksSelected"
        :indeterminate="someBookmarksSelected"
        :disabled="!tableData.length"
        :aria-label="$t(allBookmarksSelected ? 'bookmarkMg.batchDeselectAll' : 'bookmarkMg.batchSelectAll')"
        @change="toggleSelectAll"
      />
    </template>
  </ResourceBatchActionBar>
  <MobilePageActionsDrawer
    v-model:open="pageActionsOpen"
    :title="$t('bookmarkMg.title')"
    :actions="pageActions"
    @action="handlePageAction"
  />
  <MobilePageActionsDrawer
    v-model:open="mobilePageActionsOpen"
    :object-title="activeBookmark?.name || $t('common.more')"
    :actions="mobilePageActions"
    @action="handleMobilePageAction"
  />
  <MobilePageActionsDrawer
    v-model:open="mobileBatchActionsOpen"
    :title="batchActionSummary"
    :actions="mobileBatchActions"
    @action="handleMobileBatchAction"
  />
  <LinkHealthModal v-model:visible="healthVisible" />
  <BookmarkSnapshotModal v-model:visible="snapVisible" :bookmark-id="snapBookmarkId" />
  <AiOrganizeModal v-model:visible="aiOrgVisible" :selected-ids="selectedAiOrganizeIds" @applied="reloadBookmarks" />
  <BookmarkAiDialog v-model:visible="bookmarkAiVisible" :bookmarks="bookmarkAiItems" />
  <ResourceOutcomeDrawer
    v-model:open="outcomeDrawerOpen"
    :resources="outcomeResources"
    :quick-actions="bookmarkOutcomeQuickActions"
    surface="bookmark_manage"
  />
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BookmarkFavicon from '@/components/base/BookmarkFavicon.vue';
  import BookmarkCapabilityBadge from '@/components/manage/bookmarkMg/BookmarkCapabilityBadge.vue';
  import PhoneListMg from '@/components/base/phoneComponents/PhoneListMg.vue';
  import LinkHealthModal from '@/components/manage/bookmarkMg/LinkHealthModal.vue';
  import BookmarkSnapshotModal from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';
  import { useBookmarkManage } from '@/composables/useBookmarkManage.ts';
  import type { BookmarkInterface } from '@/config/bookmarkCfg.ts';
  import icon from '@/config/icon.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { batchDeleteSearchResources, clearGlobalSearchCache } from '@/api/search.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { OPERATION_LOG_MAP } from '@/config/logMap';
  import BookmarkAiDialog from '@/components/manage/bookmarkMg/BookmarkAiDialog.vue';
  import AiOrganizeModal from '@/components/manage/bookmarkMg/AiOrganizeModal.vue';
  import ResourceBatchActionBar from '@/components/resourceActions/ResourceBatchActionBar.vue';
  import ResourceOutcomeDrawer, {
    type ResourceOutcomeQuickAction,
    type ResourceOutcomeResource,
  } from '@/components/resourceActions/ResourceOutcomeDrawer.vue';

  const { t } = useI18n();

  const {
    initialLoading,
    loadError,
    bookmarks: tableData,
    reloadBookmarks,
    confirmDeleteBookmark,
  } = useBookmarkManage();
  // 列表角标点击 → 弹出网页正文存档 / AI 摘要(与编辑页快照同一弹框)
  const snapVisible = ref(false);
  const snapBookmarkId = ref('');
  const batchMode = ref(false);
  const selectedIds = ref<string[]>([]);
  const mutating = ref(false);
  const pageActionsOpen = ref(false);
  const mobilePageActionsOpen = ref(false);
  const mobileBatchActionsOpen = ref(false);
  const healthVisible = ref(false);
  const activeBookmark = ref<BookmarkInterface | null>(null);
  const bookmarkAiVisible = ref(false);
  const bookmarkAiItems = ref<BookmarkInterface[]>([]);
  const aiOrgVisible = ref(false);
  const selectedAiOrganizeIds = ref<string[]>([]);
  const outcomeDrawerOpen = ref(false);
  const outcomeResources = ref<ResourceOutcomeResource[]>([]);
  const pageActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'health',
      label: t('bookmarkMg.healthCheck'),
      description: t('bookmarkMg.healthDesc'),
      icon: icon.bookmarkManage.healthCheck,
    },
    {
      key: 'batch',
      label: t('bookmarkMg.batchSelect'),
      icon: icon.filterPanel.check,
    },
  ]);
  const mobilePageActions = computed<MobilePageActionItem[]>(() => {
    const item = activeBookmark.value;
    if (!item) return [];
    return [
      { key: 'edit', label: t('common.edit'), icon: icon.table_edit },
      ...(item.hasSnapshot || item.hasSummary
        ? [{ key: 'snapshot', label: t('bookmarkMg.badgeArchived'), icon: icon.contextMenu.archive }]
        : []),
      { key: 'ai', label: t('bookmarkMg.aiUseBookmark'), icon: icon.settings.ai },
      {
        key: 'delete',
        label: t('common.delete'),
        icon: icon.table_delete,
        danger: true,
        dividerBefore: true,
      },
    ];
  });
  const selectedBookmarkItems = computed(() => {
    const selected = new Set(selectedIds.value);
    return tableData.value.filter((item) => selected.has(String(item.id)));
  });
  watch(
    () => tableData.value.map((item) => String(item.id)),
    (bookmarkIds) => {
      const availableIds = new Set(bookmarkIds);
      const nextSelection = selectedIds.value.filter((id) => availableIds.has(id));
      if (nextSelection.length !== selectedIds.value.length) selectedIds.value = nextSelection;
    },
    { flush: 'sync' },
  );
  const allBookmarksSelected = computed(
    () => tableData.value.length > 0 && tableData.value.every((item) => selectedIds.value.includes(String(item.id))),
  );
  const someBookmarksSelected = computed(
    () => !allBookmarksSelected.value && tableData.value.some((item) => selectedIds.value.includes(String(item.id))),
  );
  const batchActionSummary = computed(() =>
    selectedIds.value.length
      ? t('bookmarkMg.batchSelected', { count: selectedIds.value.length })
      : t('resourceOutcome.batch.selectResources'),
  );
  const mobileBatchActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'outcome',
      label: t('resourceOutcome.primaryAction'),
      icon: icon.common.magicWand,
      disabled: !selectedIds.value.length,
    },
    {
      key: 'smartOrganize',
      label: t('bookmarkMg.aiOrganizeBtn'),
      icon: icon.ai.organize,
      disabled: !selectedIds.value.length,
    },
    {
      key: 'clear',
      label: t('resourceOutcome.batch.clear'),
      icon: icon.common.close,
      disabled: !selectedIds.value.length,
    },
    {
      key: 'delete',
      label: t('bookmarkMg.batchDelete'),
      icon: icon.table_delete,
      danger: true,
      dividerBefore: true,
      disabled: !selectedIds.value.length,
      loading: mutating.value,
    },
  ]);
  const bookmarkOutcomeQuickActions = computed<ResourceOutcomeQuickAction[]>(() => [
    {
      id: 'summarize',
      label: t('ai.entry.summarizeSelected'),
      description: t('resourceOutcome.quickSummaryDescription'),
      skillId: 'search.summarize_selected',
      input: { instruction: t('ai.entry.summarizeSelectedInstruction') },
      minItems: 1,
      maxItems: 10,
      supportedTypes: ['bookmark'],
      requireReadable: true,
      icon: icon.ai.materials,
      generatedNoteTitle: t('bookmarkMg.aiGeneratedNoteTitle'),
    },
    {
      id: 'compare',
      label: t('ai.entry.compareSelected'),
      description: t('resourceOutcome.quickCompareDescription'),
      skillId: 'search.compare_selected',
      input: { instruction: t('bookmarkMg.aiCompareInstruction') },
      minItems: 2,
      maxItems: 10,
      supportedTypes: ['bookmark'],
      requireReadable: true,
      icon: icon.toolbox.comparison,
      generatedNoteTitle: t('bookmarkMg.aiGeneratedNoteTitle'),
    },
  ]);

  useMobileTopBar(['bookmarkMg'], {
    title: () =>
      batchMode.value ? t('bookmarkMg.batchSelected', { count: selectedIds.value.length }) : t('bookmarkMg.title'),
    onBack: () => {
      if (batchMode.value) {
        exitBatch();
        return;
      }
      if (window.history.length > 1) router.back();
      else router.push('/home');
    },
    leadingActionLabel: () => (batchMode.value ? t('common.cancel') : ''),
    searchSourceType: 'bookmark',
    showNotification: false,
    onAuxiliaryAction: () => {
      pageActionsOpen.value = true;
    },
    auxiliaryActionLabel: () => (batchMode.value ? '' : t('common.more')),
    auxiliaryActionIcon: () => icon.common.more,
    onAdd: () => router.push('/manage/editBookmark/add'),
    addLabel: () => t('common.add'),
    showAdd: () => !batchMode.value,
    addActionMode: () => 'icon',
  });
  const openSnap = (id: string) => {
    snapBookmarkId.value = id;
    snapVisible.value = true;
  };
  const edit = (id: string) => {
    router.push({ path: `/manage/editBookmark/${id}` });
  };
  const deleteBookmark = (bookmarkItem: Record<string, any>) => {
    confirmDeleteBookmark(bookmarkItem as BookmarkInterface);
  };
  function openItemActions(bookmarkItem: Record<string, any>) {
    activeBookmark.value = bookmarkItem as BookmarkInterface;
    mobilePageActionsOpen.value = true;
  }

  function openBookmarksInAi(items: BookmarkInterface[]) {
    const available = items.filter((item) => String(item?.id || '').trim());
    if (!available.length) return;
    bookmarkAiItems.value = available.slice(0, 1);
    bookmarkAiVisible.value = true;
  }

  function handleItemClick(item: Record<string, any>) {
    if (batchMode.value) {
      toggleSelection(item.id);
      return;
    }
    openItemActions(item);
  }

  function handleBookmarkSnapshotClick(item: BookmarkInterface) {
    if (batchMode.value) {
      toggleSelection(item.id);
      return;
    }
    openSnap(String(item.id));
  }

  async function handlePageAction(action: MobilePageActionItem) {
    if (action.key === 'batch') {
      enterBatch();
      return;
    }
    if (action.key !== 'health') return;

    await closeCurrentMobileOverlayThen(
      () => {
        pageActionsOpen.value = false;
      },
      () => {
        healthVisible.value = true;
        void recordOperation(OPERATION_LOG_MAP.bookmarkMg.healthCheck);
      },
    );
  }

  function toggleSelection(id: string | number) {
    const key = String(id);
    selectedIds.value = selectedIds.value.includes(key)
      ? selectedIds.value.filter((item) => item !== key)
      : [...selectedIds.value, key];
  }

  function toggleSelectAll(checked: boolean) {
    const visibleIds = tableData.value.map((item) => String(item.id));
    if (!checked) {
      selectedIds.value = selectedIds.value.filter((id) => !visibleIds.includes(id));
      return;
    }
    selectedIds.value = [...new Set([...selectedIds.value, ...visibleIds])];
  }

  function enterBatch() {
    selectedIds.value = [];
    batchMode.value = true;
  }

  function exitBatch() {
    batchMode.value = false;
    selectedIds.value = [];
    mobileBatchActionsOpen.value = false;
    outcomeDrawerOpen.value = false;
  }

  function handleMobilePageAction(action: MobilePageActionItem) {
    const item = activeBookmark.value;
    if (!item) return;
    if (action.key === 'edit') edit(String(item.id));
    else if (action.key === 'snapshot') openSnap(String(item.id));
    else if (action.key === 'ai') openBookmarksInAi([item]);
    else if (action.key === 'delete') deleteBookmark(item);
  }

  function handleMobileBatchAction(action: MobilePageActionItem) {
    if (action.key === 'outcome') openSelectedOutcomeDrawer();
    else if (action.key === 'smartOrganize') openSelectedAiOrganize();
    else if (action.key === 'clear') selectedIds.value = [];
    else if (action.key === 'delete') handleBatchDelete();
  }

  function openSelectedAiOrganize() {
    const ids = selectedBookmarkItems.value.map((item) => String(item.id));
    if (!ids.length) return;
    selectedAiOrganizeIds.value = ids;
    mobileBatchActionsOpen.value = false;
    aiOrgVisible.value = true;
  }

  function openSelectedOutcomeDrawer() {
    if (!selectedBookmarkItems.value.length) {
      message.warning(t('resourceOutcome.batch.selectFirst'));
      return;
    }
    outcomeResources.value = selectedBookmarkItems.value.map((item) => ({
      type: 'bookmark',
      id: String(item.id),
      title: String(item.name || t('bookmarkMg.untitled')),
      quickReadable: true,
    }));
    mobileBatchActionsOpen.value = false;
    bookmarkAiVisible.value = false;
    outcomeDrawerOpen.value = true;
    recordOperation({
      module: '书签管理',
      operation: `用所选书签生成与处理【${outcomeResources.value.length}个】`,
    });
  }

  function handleBatchDelete() {
    if (blockGuestWrite('delete-bookmark')) return;
    if (!selectedIds.value.length) {
      message.warning(t('bookmarkMg.batchDeleteNoSelection'));
      return;
    }
    const ids = [...selectedIds.value];
    Alert.alert({
      title: t('bookmarkMg.batchDeleteConfirmTitle'),
      content: t('bookmarkMg.batchDeleteConfirmContent', { count: ids.length }),
      async onOk() {
        mutating.value = true;
        try {
          const res = await batchDeleteSearchResources(ids.map((id) => ({ id, type: 'bookmark' })));
          if (Number(res?.status) !== 200) {
            message.error(res?.msg || t('bookmarkMg.batchDeleteFailed'));
            return;
          }
          const successCount = Number(res?.data?.affectedItemCount || 0);
          const skippedCount = Number(res?.data?.invalidItemCount || 0);
          if (!successCount) {
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
          clearGlobalSearchCache();
          exitBatch();
          await reloadBookmarks();
        } catch {
          message.error(t('bookmarkMg.batchDeleteFailed'));
        } finally {
          mutating.value = false;
        }
      },
    });
  }
  const retryLoad = async () => {
    try {
      await reloadBookmarks();
    } catch {
      // 请求层负责统一提示，页面保留可重试错误状态。
    }
  };

  void retryLoad();
</script>

<style lang="less" scoped>
  .bookmark-item-main {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 11px;
    min-width: 0;
    padding-right: 44px;

    &.is-batch-mode {
      padding-right: 44px;
    }
  }
  .bookmark-item-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .bookmark-item-main :deep(.bookmark-favicon) {
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .bookmark-item-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 15px;
    font-weight: 700;
  }
  .bookmark-item-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .bm-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .bookmark-item-tag {
    max-width: 120px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 18px;
    color: var(--desc-color);
    background: var(--common-tag-bg-color);
  }
  .edit-tag-container {
    height: 100%;
    box-sizing: border-box;
    padding: 0 40px;
  }
  .edit-tag-operation {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .bookmark-more-indicator {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    color: var(--text-color);
  }
  .bookmark-selection-indicator {
    width: 26px;
    height: 26px;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 7px;
    color: white;
    background: var(--card-background);

    &.is-selected {
      border-color: var(--primary-color);
      background: var(--primary-color);
    }
  }
  :deep(.list-item) {
    height: auto;
    box-sizing: border-box;
  }
  :deep(.list-item .mobile-list-row) {
    min-height: 70px;
    padding: 12px 13px;
    gap: 11px;
  }
  :deep(.list-item .mobile-list-row.is-complex) {
    min-height: 70px;
  }
  .bookmark-mobile-list--batch :deep(.list-body) {
    padding-bottom: 164px;
    scroll-padding-bottom: 164px;
  }
  .table-search-input {
    width: 100%;
  }
</style>
