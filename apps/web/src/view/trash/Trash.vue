<template>
  <ResourcePageShell
    :title="$t('trash.title')"
    :subtitle="pageSubtitle"
    accent="neutral"
    show-back
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

    <BCard variant="card" padding="14px" class="trash-page">
      <!-- 提示区 -->
      <div v-if="total > 0 || trashFileSize > 0" class="trash-info-bar">
        <svg-icon :src="icon.common.important" size="14" color="red" />
        <span v-if="retainDays >= 3650">{{ $t('trash.autoCleanForever') }}</span>
        <span v-else>{{ $t('trash.autoCleanTip', { days: retainDays }) }}</span>
      </div>

      <div v-if="trashFileSizeWarnLevel" :class="['trash-size-warning', `is-${trashFileSizeWarnLevel}`]">
        <span>{{
          trashFileSizeWarnLevel === 'danger'
            ? $t('trash.trashSizeWarning500', { size: trashFileSizeMB })
            : $t('trash.trashSizeWarning200', { size: trashFileSizeMB })
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

          <div v-else-if="bookmark.isMobile" class="trash-mobile-list">
            <BCard
              v-for="item in items"
              :key="item.id"
              as="article"
              variant="card"
              padding="12px"
              class="trash-mobile-card"
            >
              <div class="trash-mobile-card__top">
                <span :class="['trash-type-badge', `trash-type-badge--${item.resourceType}`]">
                  <span class="type-dot" />
                  {{ $t(`trash.${item.resourceType}`) }}
                </span>
                <span class="trash-mobile-card__time">{{ item.deletedAt }}</span>
              </div>
              <div class="trash-mobile-card__body">
                <strong :title="item.name">{{ item.name || '-' }}</strong>
                <span v-if="item.resourceType === 'file' && item.fileSize">{{ formatTrashSize(item.fileSize) }}</span>
              </div>
              <div class="trash-mobile-card__actions">
                <BButton size="small" @click="confirmRestore(item)">{{ $t('trash.restore') }}</BButton>
                <BButton size="small" type="danger" @click="confirmDelete(item)">
                  {{ $t('trash.permanentDelete') }}
                </BButton>
              </div>
            </BCard>
          </div>

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
        <div v-if="selectedIds.length > 0" class="trash-batch-bar">
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
  </ResourcePageShell>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
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
  import { formatTrashSize, useTrash } from '@/composables/useTrash.ts';

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
    trashFileSizeMB,
    trashFileSizeWarnLevel,
    pageSubtitle,
    setFilter,
    confirmRestore,
    confirmDelete,
    confirmRestoreAll,
    confirmEmptyAll,
  } = useTrash();

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
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .trash-mobile-card {
    --b-card-background: var(--card-background);
    --b-card-border-color: var(--surface-border-color);
    --b-card-shadow: var(--surface-card-shadow);

    border-radius: 12px;
  }

  .trash-mobile-card__top,
  .trash-mobile-card__body,
  .trash-mobile-card__actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .trash-mobile-card__time,
  .trash-mobile-card__body span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .trash-mobile-card__body {
    margin: 12px 0;

    strong {
      min-width: 0;
      overflow: hidden;
      font-size: 14px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .trash-mobile-card__actions {
    justify-content: flex-end;
  }

  @media (max-width: 767px) {
    .trash-page {
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow: hidden;
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

    .trash-type-filter {
      width: 100%;
      overflow-x: auto;
    }

    .trash-type-btn {
      min-width: max-content;
      flex: 1;
      padding-inline: 12px;
    }

    .trash-loading-area,
    .trash-table-scroll {
      min-height: 0;
      flex: 1;
    }

    .trash-table-scroll {
      padding: 10px;
      box-sizing: border-box;
      border: 1px solid var(--surface-border-color);
      border-radius: 12px;
      background: var(--workspace-panel-bg-color);
    }

    .trash-info-bar,
    .trash-size-warning {
      margin-top: 0;
    }

    .trash-batch-bar {
      display: none;
    }
  }
</style>
