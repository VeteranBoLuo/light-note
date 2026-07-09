<template>
  <div class="trash-page">
    <!-- 头部 -->
    <div class="trash-hero">
      <div class="trash-hero-icon">
        <svg-icon :src="icon.table_delete" size="22" />
      </div>
      <div class="trash-hero-text">
        <h2 class="trash-hero-title">{{ $t('trash.title') }}</h2>
        <p class="trash-hero-desc">
          <template v-if="total > 0">
            {{ $t('trash.totalCount', { count: total }) }}
            <template v-if="trashFileSize > 0">，{{ $t('trash.trashFileSize') }} {{ trashFileSizeMB }}</template>
          </template>
          <template v-else>{{ $t('trash.subtitle') }}</template>
        </p>
      </div>
    </div>

    <!-- 提示区 -->
    <div v-if="total > 0 || trashFileSize > 0" class="trash-info-bar">
      <svg-icon :src="icon.common.important" size="14" color="red" />
      <span>{{ $t('trash.autoCleanTip', { days: retainDays }) }}</span>
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
        <button
          class="trash-type-btn"
          :class="{ active: filterType === '' }"
          @click="
            filterType = '';
            onFilterChange();
          "
          >{{ $t('trash.allType') }}</button
        >
        <button
          class="trash-type-btn"
          :class="{ active: filterType === 'bookmark' }"
          @click="
            filterType = 'bookmark';
            onFilterChange();
          "
          >{{ $t('trash.bookmark') }}</button
        >
        <button
          class="trash-type-btn"
          :class="{ active: filterType === 'note' }"
          @click="
            filterType = 'note';
            onFilterChange();
          "
          >{{ $t('trash.note') }}</button
        >
        <button
          class="trash-type-btn"
          :class="{ active: filterType === 'file' }"
          @click="
            filterType = 'file';
            onFilterChange();
          "
          >{{ $t('trash.file') }}</button
        >
      </div>

      <div class="trash-toolbar-right">
        <b-input v-model:value="keyword" placeholder="搜索名称…" class="trash-search-input">
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="14" />
          </template>
        </b-input>
        <div style="display: flex; gap: 6px; flex-shrink: 0">
          <b-button type="danger" :loading="emptyingAll" :disabled="total === 0" @click="confirmEmptyAll">
            {{ $t('trash.emptyAll') }}
          </b-button>
          <b-button :loading="restoringAll" :disabled="total === 0" @click="confirmRestoreAll">
            一键恢复
          </b-button>
        </div>
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
                    {{ formatSize((record as any).fileSize) }}
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
          <b-button size="small" @click="confirmRestore(selectedItems)">
            {{ $t('trash.restore') }}
          </b-button>
          <b-button size="small" type="danger" @click="confirmBatchDelete">{{ $t('trash.permanentDelete') }}</b-button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, watch, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost } from '@/http/request';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useGrowth } from '@/composables/useGrowth.ts';

  const { t } = useI18n();
  const { growth, load: loadGrowth } = useGrowth();
  // 回收站保留天数按成长等级(缺省 30;升级后延长,提示随之更新)
  const retainDays = computed(() => growth.value?.trashDays || 30);

  const loading = ref(false);
  const emptyingAll = ref(false);
  const restoringAll = ref(false);
  const items = ref<any[]>([]);
  const total = ref(0);
  const filterType = ref('');
  const keyword = ref('');
  const selectedIds = ref<string[]>([]);
  const pagination = reactive({ current: 1, pageSize: 200 });
  const trashFileSize = ref(0);
  const trashFileSizeMB = computed(() => formatSize(trashFileSize.value));
  const trashFileSizeWarnLevel = computed(() => {
    const mb = trashFileSize.value / 1024 / 1024;
    if (mb > 500) return 'danger';
    if (mb > 200) return 'warning';
    return '';
  });

  function formatSize(bytes: number): string {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  let keywordTimer: ReturnType<typeof setTimeout> | null = null;

  watch(keyword, () => {
    if (keywordTimer) clearTimeout(keywordTimer);
    keywordTimer = setTimeout(() => {
      pagination.current = 1;
      fetchList();
    }, 300);
  });

  const selectedItems = computed(() => {
    const idSet = new Set(selectedIds.value);
    return items.value
      .filter((i: any) => idSet.has(i.id))
      .map((i: any) => ({ id: i.id, resourceType: i.resourceType }));
  });

  const columns = computed(() => [
    { key: 'resourceType', title: t('trash.resourceType'), width: '120px' },
    { key: 'name', title: '名称' },
    { key: 'deletedAt', title: t('trash.deletedAt'), width: '180px' },
    { key: 'action', title: '操作', width: '150px' },
  ]);

  async function fetchTrashFileSize() {
    try {
      const res = await apiBasePost('/api/trash/fileSize', {});
      if (res.status === 200) {
        trashFileSize.value = res.data?.totalSize || 0;
      }
    } catch {
      /* */
    }
  }

  async function fetchList() {
    loading.value = true;
    selectedIds.value = [];
    try {
      const [res] = await Promise.all([
        apiBasePost('/api/trash/list', {
          resourceType: filterType.value || undefined,
          keyword: keyword.value || undefined,
          pageSize: pagination.pageSize,
          currentPage: pagination.current,
        }),
        fetchTrashFileSize(),
      ]);
      if (res.status === 200) {
        items.value = res.data?.items || [];
        total.value = res.data?.total || 0;
      }
    } finally {
      loading.value = false;
    }
  }

  function onFilterChange() {
    pagination.current = 1;
    fetchList();
  }

  function onSizeChange(_current: number, size: number) {
    pagination.pageSize = size;
    pagination.current = 1;
    fetchList();
  }

  function groupByType(entries: any[]) {
    const map = new Map<string, string[]>();
    entries.forEach(({ id, resourceType }) => {
      if (!map.has(resourceType)) map.set(resourceType, []);
      map.get(resourceType)!.push(id);
    });
    return [...map.entries()];
  }

  async function handleRestore(entries: any[]) {
    if (blockGuestWrite('restore-trash')) return;
    if (!entries.length) return;
    try {
      let success = 0;
      for (const [resourceType, ids] of groupByType(entries)) {
        const res = await apiBasePost('/api/trash/restore', { resourceType, ids });
        if (res.status === 200) success += res.data?.restored || 0;
      }
      if (success > 0) {
        message.success(t('trash.restoreSuccess'));
        selectedIds.value = [];
        fetchList();
      }
    } catch (e: any) {
      message.error(e?.message || '恢复失败');
    }
  }

  function confirmRestore(entries: any[]) {
    const count = entries.length;
    Alert.alert({
      title: t('trash.restore'),
      content: t('trash.restoreConfirm', { count }),
      onOk() {
        handleRestore(entries);
      },
    });
  }

  function confirmDelete(record: any) {
    Alert.alert({
      title: t('trash.permanentDelete'),
      content: t('trash.permanentDeleteConfirm', { count: 1 }),
      onOk() {
        handlePermanentDelete([record]);
      },
    });
  }

  function confirmBatchDelete() {
    Alert.alert({
      title: t('trash.permanentDelete'),
      content: t('trash.permanentDeleteConfirm', { count: selectedIds.length }),
      onOk() {
        handlePermanentDelete(selectedItems);
      },
    });
  }

  function confirmEmptyAll() {
    Alert.alert({
      title: t('trash.emptyAll'),
      content: t('trash.emptyAllConfirm'),
      onOk() {
        handleEmptyAll();
      },
    });
  }

  async function handlePermanentDelete(entries: any[]) {
    if (blockGuestWrite('delete-trash')) return;
    if (!entries.length) return;
    try {
      let success = 0;
      for (const [resourceType, ids] of groupByType(entries)) {
        const res = await apiBasePost('/api/trash/permanentDelete', { resourceType, ids });
        if (res.status === 200) success += res.data?.deleted || 0;
      }
      if (success > 0) {
        message.success(t('trash.permanentDeleteSuccess'));
        selectedIds.value = [];
        fetchList();
      }
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  }

  function confirmRestoreAll() {
    Alert.alert({
      title: '一键恢复',
      content: `确认恢复全部 ${total.value} 项？`,
      onOk() {
        handleRestoreAll();
      },
    });
  }

  async function handleRestoreAll() {
    if (blockGuestWrite('restore-trash')) return;
    restoringAll.value = true;
    try {
      const res = await apiBasePost('/api/trash/restoreAll', {});
      if (res.status === 200) {
        message.success(res.msg || '恢复成功');
        selectedIds.value = [];
        fetchList();
      }
    } catch (e: any) {
      message.error(e?.message || '恢复失败');
    } finally {
      restoringAll.value = false;
    }
  }

  async function handleEmptyAll() {
    if (blockGuestWrite('delete-trash')) return;
    emptyingAll.value = true;
    try {
      const res = await apiBasePost('/api/trash/emptyAll', {});
      if (res.status === 200) {
        message.success(t('trash.emptyAllSuccess'));
        selectedIds.value = [];
        fetchList();
      }
    } catch (e: any) {
      message.error(e?.message || '清空失败');
    } finally {
      emptyingAll.value = false;
    }
  }

  onMounted(() => {
    fetchList();
    loadGrowth(); // 拉取成长数据,让回收站保留天数按等级显示
  });
</script>

<style lang="less" scoped>
  .trash-page {
    width: 100%;
    height: 100%;
    padding: 28px 24px 24px;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto auto auto auto 1fr;
  }

  // 固定头部区域
  .trash-hero,
  .trash-info-bar,
  .trash-size-warning,
  .trash-toolbar {
    min-height: 0;
  }
  .trash-hero {
    grid-row: 1;
  }
  .trash-info-bar {
    grid-row: 2;
  }
  .trash-size-warning {
    grid-row: 3;
  }
  .trash-toolbar {
    grid-row: 4;
  }

  // 表格区域撑满剩余高度（grid 1fr 行有确切高度）
  .trash-loading-area {
    grid-row: 5;
    min-height: 0;
  }

  .trash-table-scroll {
    height: 100%;
    overflow-y: auto;
  }

  // ---- 头部 ----
  .trash-hero {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 22px;
  }

  .trash-hero-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(239, 68, 68, 0.04));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #ef4444;
  }

  .trash-hero-title {
    margin: 0;
    font-size: 22px;
    font-weight: 650;
    color: var(--text-color);
    letter-spacing: -0.3px;
  }

  .trash-hero-desc {
    margin: 2px 0 0;
    font-size: 13px;
    color: var(--desc-color);
  }

  .trash-info-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 13px;
    background: var(--table-header-bg-color);
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

    :deep(.ant-radio-group) {
      background: var(--table-header-bg-color);
      border-radius: 10px;
      padding: 3px;

      .ant-radio-button-wrapper {
        border: none;
        background: transparent;
        border-radius: 8px;
        padding: 0 15px;
        height: 32px;
        line-height: 32px;
        font-size: 13px;
        color: var(--desc-color);
        box-shadow: none;
        transition: all 0.2s;

        &::before {
          display: none;
        }

        &.ant-radio-button-wrapper-checked {
          background: var(--bg-color);
          color: var(--text-color);
          font-weight: 600;
        }

        &:hover:not(.ant-radio-button-wrapper-checked) {
          color: var(--text-color);
        }
      }
    }
  }

  .trash-toolbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .trash-search-input {
    width: 220px;
  }

  .filter-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  // ---- 表格容器 ----
  .trash-table-wrap {
    height: 100%;

    :deep(.table-container) {
      border-radius: 14px;
      padding: 10px;
      box-shadow: none;
      background: var(--table-bg-color);
      border: 1px solid var(--menu-item-h-bg-color);
    }

    :deep(.table-header) {
      background: var(--table-header-bg-color);
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
    background: rgba(97, 92, 237, 0.08);
    color: #615ced;
    .type-dot {
      background: #615ced;
    }
  }

  .trash-type-badge--note {
    background: rgba(0, 168, 132, 0.08);
    color: #00a884;
    .type-dot {
      background: #00a884;
    }
  }

  .trash-type-badge--file {
    background: rgba(255, 138, 0, 0.08);
    color: #ff8a00;
    .type-dot {
      background: #ff8a00;
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

  // ---- 分页 ----
  .trash-pagination {
    display: flex;
    justify-content: center;
    margin-top: 18px;
  }

  // ---- 批量操作栏 ----
  .trash-batch-bar {
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-color);
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 12px;
    padding: 10px 22px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
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
    padding: 4px 16px;
    border: none;
    border-right: 1px solid var(--card-border-color, #6e6e77);
    background: transparent;
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
    background: color-mix(in srgb, var(--primary-color, #615ced) 10%, transparent);
    color: var(--primary-color, #615ced);
  }

  .trash-type-btn.active {
    background: var(--primary-color, #615ced);
    color: #fff;
  }
</style>
