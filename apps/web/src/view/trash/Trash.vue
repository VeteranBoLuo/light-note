<template>
  <ResourcePageShell
    :title="$t('trash.title')"
    :subtitle="pageSubtitle"
    accent="neutral"
    layout="workspace"
    :show-header="!bookmark.isMobile"
    :show-back="!bookmark.isMobile"
    @back="router.back()"
  >
    <template #actions>
      <BButton :loading="restoringAll" :disabled="total === 0" @click="confirmRestoreAll">
        {{ $t('trash.restoreAll') }}
      </BButton>
      <BButton type="danger" :loading="emptyingAll" :disabled="total === 0" @click="confirmEmptyAll">
        {{ $t('trash.emptyAll') }}
      </BButton>
    </template>

    <BCard
      variant="card"
      padding="14px"
      class="trash-page"
      :class="{ 'is-mobile-batch': bookmark.isMobile && mobileBatchMode }"
    >
      <!-- 提示区 -->
      <MobileNoticeStrip
        v-if="bookmark.isMobile && (total > 0 || trashFileSize > 0)"
        :title="retainDays >= 3650 ? $t('trash.autoCleanForever') : $t('trash.autoCleanTip', { days: retainDays })"
        :description="pageSubtitle"
        :icon="icon.common.important"
      />
      <div v-else-if="total > 0 || trashFileSize > 0" class="trash-info-bar">
        <svg-icon :src="icon.common.important" size="14" color="red" />
        <span v-if="retainDays >= 3650">{{ $t('trash.autoCleanForever') }}</span>
        <span v-else>{{ $t('trash.autoCleanTip', { days: retainDays }) }}</span>
      </div>

      <MobileNoticeStrip
        v-if="bookmark.isMobile && trashFileSizeWarnLevel"
        :tone="trashFileSizeWarnLevel"
        :description="
          trashFileSizeWarnLevel === 'danger'
            ? $t('trash.trashSizeWarning500', { size: trashFileSizeText, percent: trashFileSizePercent })
            : $t('trash.trashSizeWarning200', { size: trashFileSizeText, percent: trashFileSizePercent })
        "
        :icon="icon.common.important"
      />
      <div v-else-if="trashFileSizeWarnLevel" :class="['trash-size-warning', `is-${trashFileSizeWarnLevel}`]">
        <span>{{
          trashFileSizeWarnLevel === 'danger'
            ? $t('trash.trashSizeWarning500', { size: trashFileSizeText, percent: trashFileSizePercent })
            : $t('trash.trashSizeWarning200', { size: trashFileSizeText, percent: trashFileSizePercent })
        }}</span>
      </div>

      <!-- 工具栏 -->
      <div class="trash-toolbar">
        <div class="trash-type-filter">
          <BButton
            class="trash-type-btn"
            :class="{ active: filterType === '' }"
            v-click-log="{ module: '回收站', operation: '筛选全部资源' }"
            @click="setFilter('')"
          >
            {{ $t('trash.allType') }}
          </BButton>
          <BButton
            class="trash-type-btn"
            :class="{ active: filterType === 'bookmark' }"
            v-click-log="{ module: '回收站', operation: '筛选书签' }"
            @click="setFilter('bookmark')"
          >
            {{ $t('trash.bookmark') }}
          </BButton>
          <BButton
            class="trash-type-btn"
            :class="{ active: filterType === 'note' }"
            v-click-log="{ module: '回收站', operation: '筛选笔记' }"
            @click="setFilter('note')"
          >
            {{ $t('trash.note') }}
          </BButton>
          <BButton
            class="trash-type-btn"
            :class="{ active: filterType === 'file' }"
            v-click-log="{ module: '回收站', operation: '筛选文件' }"
            @click="setFilter('file')"
          >
            {{ $t('trash.file') }}
          </BButton>
        </div>

        <div class="trash-toolbar-right">
          <BInput v-model:value="keyword" :placeholder="$t('trash.searchPlaceholder')" class="trash-search-input">
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="14" />
            </template>
          </BInput>
        </div>
      </div>

      <!-- 表格区域 -->
      <b-loading :loading="loading" class="trash-loading-area">
        <div class="trash-table-scroll">
          <div v-if="!loading && items.length === 0" class="trash-empty-state">
            <div class="trash-empty-icon">
              <svg-icon :src="icon.table_delete" size="36" />
            </div>
            <p class="trash-empty-text">{{ $t('trash.noData') }}</p>
          </div>

          <MobileListSurface v-else-if="bookmark.isMobile" class="trash-mobile-list">
            <MobileListRow
              v-for="item in items"
              :key="item.id"
              interactive
              :selected="selectedIds.includes(item.id)"
              :complex="true"
              @click="mobileBatchMode ? toggleMobileSelection(item.id) : openItemActions(item)"
            >
              <template #leading>
                <span :class="['trash-type-badge', `trash-type-badge--${item.resourceType}`]">
                  <span class="type-dot" />
                </span>
              </template>
              <template #title>{{ item.name || '-' }}</template>
              <template #subtitle>
                {{ $t(`trash.${item.resourceType}`) }}
                <template v-if="item.resourceType === 'file' && item.fileSize">
                  · {{ formatTrashSize(item.fileSize) }}</template
                >
                <template v-else-if="item.resourceType === 'note' && Number(item.batchCount || 1) > 1">
                  · {{ $t('trash.noteTreeBatch', { count: item.batchCount }) }}
                </template>
                · {{ item.deletedAt }}
              </template>
              <template #trailing>
                <span
                  v-if="mobileBatchMode"
                  class="trash-selection-indicator"
                  :class="{ 'is-selected': selectedIds.includes(item.id) }"
                  aria-hidden="true"
                >
                  <svg-icon v-if="selectedIds.includes(item.id)" :src="icon.filterPanel.check" size="17" />
                </span>
                <span v-else class="trash-mobile-more" aria-hidden="true">
                  <svg-icon :src="icon.common.more" size="18" />
                </span>
              </template>
            </MobileListRow>
          </MobileListSurface>

          <div v-else class="trash-table-wrap">
            <BTable
              :data="items"
              :columns="columns"
              :rowKey="'id'"
              :selectable="true"
              :selectedRows="selectedIds"
              @selection-change="selectedIds = $event"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'resourceType'">
                  <span :class="['trash-type-badge', `trash-type-badge--${(record as any).resourceType}`]">
                    <span class="type-dot" />
                    {{ $t(`trash.${(record as any).resourceType}`) }}
                  </span>
                </template>
                <template v-if="column.key === 'name'">
                  <div class="trash-name-cell-wrap">
                    <span class="trash-name-cell" :title="(record as any).name">{{ (record as any).name || '-' }}</span>
                    <span
                      v-if="(record as any).resourceType === 'file' && (record as any).fileSize"
                      class="trash-name-size"
                    >
                      {{ formatTrashSize((record as any).fileSize) }}
                    </span>
                    <span
                      v-else-if="(record as any).resourceType === 'note' && Number((record as any).batchCount || 1) > 1"
                      class="trash-name-size"
                    >
                      {{ $t('trash.noteTreeBatch', { count: (record as any).batchCount }) }}
                    </span>
                  </div>
                </template>
                <template v-if="column.key === 'action'">
                  <BButton size="small" class="trash-action-btn" @click="confirmRestore([record as any])">
                    {{ $t('trash.restore') }}
                  </BButton>
                  <BButton size="small" type="danger" class="trash-action-btn" @click="confirmDelete(record as any)">
                    {{ $t('trash.permanentDelete') }}
                  </BButton>
                </template>
              </template>
            </BTable>
          </div>
        </div>
      </b-loading>

      <!-- 批量操作栏 -->
      <transition name="batch-slide">
        <div v-if="selectedIds.length > 0 && !bookmark.isMobile" class="trash-batch-bar">
          <span class="batch-count">{{ $t('trash.totalCount', { count: selectedIds.length }) }}</span>
          <div class="batch-actions">
            <BButton size="small" @click="confirmRestore(selectedItems)">
              {{ $t('trash.restore') }}
            </BButton>
            <BButton size="small" type="danger" @click="confirmDelete(selectedItems)">
              {{ $t('trash.permanentDelete') }}
            </BButton>
          </div>
        </div>
      </transition>
    </BCard>
    <MobileStickyActionBar v-if="bookmark.isMobile && mobileBatchMode" :above-navigation="false">
      <BButton :disabled="!selectedIds.length" @click="confirmRestore(selectedItems)">
        {{ $t('trash.restore') }} {{ selectedIds.length || '' }}
      </BButton>
      <BButton type="danger" :disabled="!selectedIds.length" @click="confirmDelete(selectedItems)">
        {{ $t('trash.permanentDelete') }}
      </BButton>
    </MobileStickyActionBar>
    <MobilePageActionsDrawer
      v-model:open="mobileActionsOpen"
      :object-title="mobileActionTitle"
      :actions="mobileActions"
      @action="handleMobileAction"
    />
  </ResourcePageShell>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { bookmarkStore } from '@/store';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import { formatTrashSize, useTrash, type TrashItem } from '@/composables/useTrash.ts';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobileNoticeStrip from '@/components/mobile/MobileNoticeStrip.vue';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';

  const { t } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const {
    loading,
    emptyingAll,
    restoringAll,
    items,
    total,
    filterType,
    keyword,
    selectedIds,
    selectedItems,
    retainDays,
    trashFileSize,
    trashFileSizeText,
    trashFileSizePercent,
    trashFileSizeWarnLevel,
    pageSubtitle,
    setFilter,
    confirmRestore,
    confirmDelete,
    confirmRestoreAll,
    confirmEmptyAll,
  } = useTrash();

  const mobileBatchMode = ref(false);
  const mobileActionsOpen = ref(false);
  const activeMobileItem = ref<TrashItem | null>(null);
  const mobileActionTitle = computed(() => activeMobileItem.value?.name || t('trash.title'));
  const mobileActions = computed<MobilePageActionItem[]>(() => {
    if (activeMobileItem.value) {
      return [
        { key: 'restore-item', label: t('trash.restore'), icon: icon.contextMenu.archive },
        {
          key: 'delete-item',
          label: t('trash.permanentDelete'),
          icon: icon.table_delete,
          danger: true,
          dividerBefore: true,
        },
      ];
    }
    return [
      { key: 'batch', label: t('trash.batchSelect'), icon: icon.filterPanel.check, disabled: total.value === 0 },
      { key: 'restore-all', label: t('trash.restoreAll'), icon: icon.contextMenu.archive, disabled: total.value === 0 },
      {
        key: 'empty-all',
        label: t('trash.emptyAll'),
        icon: icon.table_delete,
        danger: true,
        dividerBefore: true,
        disabled: total.value === 0,
      },
    ];
  });

  useMobileTopBar(['trash', 'ptrash'], {
    title: () =>
      mobileBatchMode.value ? t('trash.selectedCount', { count: selectedIds.value.length }) : t('trash.title'),
    onBack: () => {
      if (mobileBatchMode.value) {
        exitMobileBatch();
        return;
      }
      if (window.history.length > 1) router.back();
      else router.push('/personCenter');
    },
    leadingActionLabel: () => (mobileBatchMode.value ? t('common.cancel') : ''),
    showNotification: false,
    onAuxiliaryAction: () => {
      if (mobileBatchMode.value) toggleAllMobile();
      else openPageActions();
    },
    auxiliaryActionLabel: () =>
      mobileBatchMode.value
        ? t(selectedIds.value.length === items.value.length ? 'trash.deselectAll' : 'trash.selectAll')
        : t('common.more'),
    auxiliaryActionIcon: () => (mobileBatchMode.value ? '' : icon.common.more),
  });

  function openPageActions() {
    activeMobileItem.value = null;
    mobileActionsOpen.value = true;
  }

  function openItemActions(item: TrashItem) {
    activeMobileItem.value = item;
    mobileActionsOpen.value = true;
  }

  function enterMobileBatch() {
    selectedIds.value = [];
    mobileBatchMode.value = true;
  }

  function exitMobileBatch() {
    selectedIds.value = [];
    mobileBatchMode.value = false;
  }

  function toggleMobileSelection(id: string) {
    if (!mobileBatchMode.value) return;
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter((value) => value !== id)
      : [...selectedIds.value, id];
  }

  function toggleAllMobile() {
    selectedIds.value = selectedIds.value.length === items.value.length ? [] : items.value.map((item) => item.id);
  }

  function handleMobileAction(action: MobilePageActionItem) {
    const item = activeMobileItem.value;
    if (action.key === 'batch') enterMobileBatch();
    else if (action.key === 'restore-all') confirmRestoreAll();
    else if (action.key === 'empty-all') confirmEmptyAll();
    else if (action.key === 'restore-item' && item) confirmRestore(item);
    else if (action.key === 'delete-item' && item) confirmDelete(item);
  }

  watch(items, () => {
    // 成功恢复/删除或切换筛选后列表会整体刷新，批量选择不跨数据集保留。
    if (mobileBatchMode.value) exitMobileBatch();
  });

  const columns = computed(() => [
    { key: 'resourceType', title: t('trash.resourceType'), width: '120px' },
    { key: 'name', title: t('trash.name') },
    { key: 'deletedAt', title: t('trash.deletedAt'), width: '180px' },
    { key: 'action', title: t('trash.action'), width: '150px' },
  ]);
</script>

<style lang="less" scoped>
  .trash-page {
    --b-card-background: var(--card-background);
    --b-card-border-color: var(--surface-border-color);
    --b-card-shadow: var(--surface-card-shadow);

    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr);
    border-radius: 14px;
  }

  // 固定头部区域
  .trash-info-bar,
  .trash-size-warning,
  .trash-toolbar {
    min-height: 0;
  }
  .trash-info-bar {
    grid-row: 1;
  }
  .trash-size-warning {
    grid-row: 2;
  }
  .trash-toolbar {
    grid-row: 3;
  }

  // 表格区域撑满剩余高度（grid 1fr 行有确切高度）
  .trash-loading-area {
    grid-row: 4;
    min-height: 0;
  }

  .trash-table-scroll {
    height: 100%;
    overflow-y: auto;
  }

  .trash-info-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 13px;
    border: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
    color: var(--desc-color);
  }

  .trash-size-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;

    &.is-warning {
      background: rgba(250, 173, 20, 0.08);
      color: #d48806;
      border: 1px solid rgba(250, 173, 20, 0.15);
    }

    &.is-danger {
      background: rgba(239, 68, 68, 0.08);
      color: #dc2626;
      border: 1px solid rgba(239, 68, 68, 0.15);
    }
  }

  // ---- 工具栏 ----
  .trash-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 16px 0 16px 0;
    flex-wrap: wrap;
    gap: 10px;
  }

  .trash-toolbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .trash-search-input {
    width: 220px;
  }

  // ---- 表格容器 ----
  .trash-table-wrap {
    height: 100%;

    :deep(.table-container) {
      border-radius: 14px;
      padding: 10px;
      box-shadow: var(--surface-card-shadow);
      background: var(--card-background);
      border: 1px solid var(--surface-border-color);
    }

    :deep(.table-header) {
      background: var(--workspace-panel-bg-color);
      border-radius: 9px;
      height: 38px;
    }

    :deep(.header-cell) {
      font-size: 12px;
      font-weight: 600;
      color: var(--desc-color);
    }

    :deep(.table-row) {
      min-height: 42px;
      border-radius: 9px;
      border: 1px solid transparent;
      transition: background 0.15s;
    }

    :deep(.table-row:hover) {
      background: var(--menu-item-h-bg-color);
      border-color: var(--workbench-table-row-hover-border, rgba(0, 0, 0, 0.04));
    }

    :deep(.table-cell) {
      font-size: 13px;
    }
  }

  // ---- 类型标签 ----
  .trash-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
  }

  .type-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .trash-type-badge--bookmark {
    background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 8%, transparent);
    color: var(--resource-bookmark-color, #615ced);
    .type-dot {
      background: var(--resource-bookmark-color, #615ced);
    }
  }

  .trash-type-badge--note {
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 8%, transparent);
    color: var(--resource-note-color, #00a884);
    .type-dot {
      background: var(--resource-note-color, #00a884);
    }
  }

  .trash-type-badge--file {
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 8%, transparent);
    color: var(--resource-file-color, #ff8a00);
    .type-dot {
      background: var(--resource-file-color, #ff8a00);
    }
  }

  // ---- 名称 ----
  .trash-name-cell-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .trash-name-cell {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 450;
    min-width: 0;
  }

  .trash-name-size {
    font-size: 12px;
    color: var(--desc-color);
    flex-shrink: 0;
  }

  // ---- 操作按钮 ----
  .trash-action-btn {
    padding: 2px 6px;
    font-size: 13px;
  }

  // ---- 空状态 ----
  .trash-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 0;
    gap: 12px;
  }

  .trash-empty-icon {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: var(--table-header-bg-color);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
  }

  .trash-empty-text {
    font-size: 14px;
    color: var(--desc-color);
    margin: 0;
  }

  // ---- 批量操作栏 ----
  .trash-batch-bar {
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--card-background);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    padding: 10px 22px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: var(--surface-hover-shadow);
    z-index: 100;
    backdrop-filter: blur(12px);
  }

  .batch-count {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-color);
  }

  .batch-actions {
    display: flex;
    gap: 8px;
  }

  // ---- 过渡动画 ----
  .batch-slide-enter-active,
  .batch-slide-leave-active {
    transition: all 0.25s ease;
  }

  .batch-slide-enter-from,
  .batch-slide-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(12px);
  }
  .trash-type-filter {
    display: inline-flex;
    border: 1px solid var(--card-border-color, #6e6e77);
    border-radius: 8px;
    overflow: hidden;
  }

  .trash-type-btn {
    height: 32px;
    padding: 4px 16px;
    border: none;
    border-right: 1px solid var(--card-border-color, #6e6e77);
    border-radius: 0;
    background: transparent !important;
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
  }

  .trash-type-btn:last-child {
    border-right: none;
  }

  .trash-type-btn:hover {
    background: color-mix(in srgb, var(--primary-color, #615ced) 10%, transparent) !important;
    color: var(--primary-color, #615ced);
  }

  .trash-type-btn.active {
    background: var(--primary-color, #615ced) !important;
    color: #fff;
  }

  .trash-mobile-list {
    display: block;
  }

  @media (max-width: 767px) {
    .trash-page {
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow: hidden;
      border: 0;
      border-radius: 0;
      background: var(--surface-page-bg);
      box-shadow: none;
    }

    .trash-page.is-mobile-batch {
      padding-bottom: 92px;
    }

    .trash-toolbar {
      align-items: stretch;
      flex-direction: column-reverse;
      gap: 8px;
    }

    .trash-toolbar-right,
    .trash-search-input {
      width: 100%;
    }

    .trash-search-input :deep(.b-input) {
      min-height: var(--mobile-touch-size, 44px);
    }

    .trash-type-filter {
      width: 100%;
      overflow-x: auto;
    }

    .trash-type-btn {
      min-width: max-content;
      height: var(--mobile-touch-size, 44px);
      flex: 1;
      padding-inline: 12px;
    }

    .trash-loading-area,
    .trash-table-scroll {
      min-height: 0;
      flex: 1;
    }

    // 移动端列表只有一个外层 Surface；这里只保留极小横向留白，避免贴住滚动容器。
    .trash-table-scroll {
      padding: 2px 2px 0;
      box-sizing: border-box;
      border: none;
      background: transparent;
    }

    .trash-info-bar,
    .trash-size-warning {
      margin-top: 0;
    }

    .trash-mobile-list .trash-type-badge {
      width: 38px;
      height: 38px;
      box-sizing: border-box;
      justify-content: center;
      padding: 0;
      border: 1px solid var(--surface-border-color);
      background: var(--workspace-panel-bg-color);
    }

    .trash-mobile-list .type-dot {
      width: 8px;
      height: 8px;
    }

    .trash-mobile-more {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      color: var(--text-color);
    }

    .trash-selection-indicator {
      width: 26px;
      height: 26px;
      box-sizing: border-box;
      display: grid;
      place-items: center;
      border: 1px solid var(--surface-border-color);
      border-radius: 7px;
      color: white;
      background: var(--card-background);
    }

    .trash-selection-indicator.is-selected {
      border-color: var(--primary-color);
      background: var(--primary-color);
    }

    .trash-batch-bar {
      display: none;
    }
  }
</style>
