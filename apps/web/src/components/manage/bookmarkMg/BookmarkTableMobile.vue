<template>
  <PhoneListMg
    :loading="initialLoading"
    :error="loadError"
    :list-data="tableData"
    :title="$t('bookmarkMg.title')"
    :subtitle="$t('bookmarkMg.subtitle')"
    :selected-keys="selectedIds"
    :show-actions="batchMode"
    :show-header="false"
    @add="router.push('/manage/editBookmark/add')"
    @item-click="handleItemClick"
    @retry="retryLoad"
  >
    <template #actions="{ dataList }">
      <template v-if="batchMode">
        <span class="bookmark-batch-count">{{ $t('bookmarkMg.batchSelected', { count: selectedIds.length }) }}</span>
        <BButton
          class="bookmark-batch-icon-button"
          :aria-label="
            allVisibleSelected(dataList) ? $t('bookmarkMg.batchDeselectAll') : $t('bookmarkMg.batchSelectAll')
          "
          :title="allVisibleSelected(dataList) ? $t('bookmarkMg.batchDeselectAll') : $t('bookmarkMg.batchSelectAll')"
          @click="toggleSelectAll(dataList)"
        >
          <SvgIcon :src="allVisibleSelected(dataList) ? icon.common.close : icon.filterPanel.check" size="17" />
        </BButton>
        <BButton
          type="danger"
          class="bookmark-batch-icon-button"
          :disabled="!selectedIds.length"
          :loading="mutating"
          :aria-label="$t('bookmarkMg.batchDelete')"
          :title="$t('bookmarkMg.batchDelete')"
          @click="handleBatchDelete"
        >
          <SvgIcon :src="icon.table_delete" size="17" />
        </BButton>
        <BButton
          class="bookmark-batch-icon-button"
          :aria-label="$t('bookmarkMg.batchCancel')"
          :title="$t('bookmarkMg.batchCancel')"
          @click="exitBatch"
        >
          <SvgIcon :src="icon.common.close" size="17" />
        </BButton>
      </template>
      <template v-else>
        <BButton :aria-label="$t('common.more')" @click="mobilePageActionsOpen = true">
          <SvgIcon :src="icon.common.more" size="18" />
          {{ $t('common.more') }}
        </BButton>
        <BButton type="primary" @click="router.push('/manage/editBookmark/add')">
          {{ $t('common.add') }}
        </BButton>
      </template>
    </template>
    <template #item="{ data }">
      <div class="bookmark-item-main" :class="{ 'is-batch-mode': batchMode }">
        <div class="bookmark-item-title">
          <BookmarkFavicon :bookmark-id="data.id" :src="data.iconUrl" :size="20" :tile-size="28" />
          <span class="bookmark-item-name">{{ data.name }}</span>
        </div>
        <div v-if="data.hasSnapshot || data.hasSummary" class="bm-badges">
          <BookmarkCapabilityBadge
            v-if="data.hasSnapshot"
            type="snapshot"
            :label="$t('bookmarkMg.badgeArchived')"
            :tooltip="$t('bookmarkMg.badgeArchivedHint')"
            @click.stop="openSnap(data.id)"
            v-click-log="OPERATION_LOG_MAP.bookmarkMg.viewSnapshot"
          />
          <BookmarkCapabilityBadge
            v-if="data.hasSummary"
            type="summary"
            :label="$t('bookmarkMg.badgeSummary')"
            :tooltip="$t('bookmarkMg.badgeSummaryHint')"
            @click.stop="openSnap(data.id)"
            v-click-log="OPERATION_LOG_MAP.bookmarkMg.viewSummary"
          />
        </div>
      </div>
      <div class="edit-tag-operation" @click.stop>
        <BCheckbox
          v-if="batchMode"
          :checked="selectedIds.includes(String(data.id))"
          :aria-label="data.name"
          @update:checked="toggleSelection(data.id)"
        />
        <BDropdown v-else :trigger="'click'" :align="'right'" :menu-options="itemMenuOptions(data)">
          <BButton class="bookmark-more-button" :aria-label="$t('common.more')">
            <SvgIcon :src="icon.common.more" size="18" />
          </BButton>
        </BDropdown>
      </div>
    </template>
  </PhoneListMg>
  <MobilePageActionsDrawer
    v-model:open="mobilePageActionsOpen"
    :title="$t('common.more')"
    :actions="mobilePageActions"
    @action="handleMobilePageAction"
  />
  <BookmarkSnapshotModal v-model:visible="snapVisible" :bookmark-id="snapBookmarkId" />
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import BookmarkCapabilityBadge from '@/components/manage/bookmarkMg/BookmarkCapabilityBadge.vue';
  import BookmarkFavicon from '@/components/base/BookmarkFavicon.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import PhoneListMg from '@/components/base/phoneComponents/PhoneListMg.vue';
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
  const mobilePageActionsOpen = ref(false);
  const mobilePageActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'batch',
      label: t('bookmarkMg.batchSelect'),
      icon: icon.filterPanel.check,
    },
  ]);

  useMobileTopBar(['bookmarkMg'], {
    title: () => t('bookmarkMg.title'),
    onBack: () => {
      if (window.history.length > 1) router.back();
      else router.push('/home');
    },
    searchSourceType: 'bookmark',
    showNotification: false,
    onAuxiliaryAction: () => {
      if (batchMode.value) {
        exitBatch();
        return;
      }
      mobilePageActionsOpen.value = true;
    },
    auxiliaryActionLabel: () => t(batchMode.value ? 'bookmarkMg.batchCancel' : 'common.more'),
    auxiliaryActionIcon: () => (batchMode.value ? icon.common.close : icon.common.more),
    onAdd: () => router.push('/manage/editBookmark/add'),
    addLabel: () => t('common.add'),
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
  const itemMenuOptions = (bookmarkItem: Record<string, any>) => [
    {
      label: t('common.edit'),
      icon: icon.table_edit,
      function: () => edit(String(bookmarkItem.id)),
    },
    { divider: true },
    {
      label: t('common.delete'),
      icon: icon.table_delete,
      danger: true,
      function: () => deleteBookmark(bookmarkItem),
    },
  ];

  function handleItemClick(item: Record<string, any>) {
    if (batchMode.value) {
      toggleSelection(item.id);
      return;
    }
    edit(String(item.id));
  }

  function toggleSelection(id: string | number) {
    const key = String(id);
    selectedIds.value = selectedIds.value.includes(key)
      ? selectedIds.value.filter((item) => item !== key)
      : [...selectedIds.value, key];
  }

  function allVisibleSelected(items: Record<string, any>[]) {
    return items.length > 0 && items.every((item) => selectedIds.value.includes(String(item.id)));
  }

  function toggleSelectAll(items: Record<string, any>[]) {
    const visibleIds = items.map((item) => String(item.id));
    if (allVisibleSelected(items)) {
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
  }

  function handleMobilePageAction(action: MobilePageActionItem) {
    if (action.key === 'batch') enterBatch();
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
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding-right: 86px;

    &.is-batch-mode {
      padding-right: 44px;
    }
  }
  .bookmark-item-title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .bookmark-item-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .bookmark-more-button {
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 9px;
  }
  .bookmark-batch-count {
    color: var(--desc-color);
    font-size: 13px;
    white-space: nowrap;
  }
  .bookmark-batch-icon-button {
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 10px;
  }
  :deep(.list-item) {
    height: auto;
    min-height: 44px;
    padding-block: 10px;
    box-sizing: border-box;
  }
  .table-search-input {
    width: 100%;
  }
</style>
