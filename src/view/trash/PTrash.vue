<template>
  <CommonContainer :title="$t('trash.title')">
    <div class="p-trash">
      <!-- 头部统计 -->
      <div class="p-trash-hero">
        <p class="p-trash-desc">
          <template v-if="total > 0">
            {{ $t('trash.totalCount', { count: total }) }}
            <template v-if="trashFileSize > 0"> · {{ $t('trash.trashFileSize') }} {{ trashFileSizeMB }}</template>
          </template>
          <template v-else>{{ $t('trash.subtitle') }}</template>
        </p>
        <!-- 提示 -->
        <div v-if="total > 0" class="p-trash-info flex-align-center-gap">
          <svg-icon :src="icon.table_delete" />
          <span>{{ $t('trash.autoCleanTip') }}</span>
        </div>
        <div v-if="trashFileSizeWarnLevel" :class="['p-trash-warn', `is-${trashFileSizeWarnLevel}`]">
          <span>{{
            trashFileSizeWarnLevel === 'danger'
              ? $t('trash.trashSizeWarning500', { size: trashFileSizeMB })
              : $t('trash.trashSizeWarning200', { size: trashFileSizeMB })
          }}</span>
        </div>
      </div>

      <!-- 搜索 + 筛选 -->
      <div class="p-trash-toolbar">
        <b-input v-model:value="keyword" placeholder="搜索名称…" class="p-trash-search" @enter="onKeywordChange">
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="14" />
          </template>
        </b-input>
      </div>
      <div class="p-trash-tabs">
        <div class="trash-type-filter">
          <button
            class="trash-type-btn"
            :class="{ active: filterType === '' }"
            @click="filterType = ''; onFilterChange()"
          >{{ $t('trash.allType') }}</button>
          <button
            class="trash-type-btn"
            :class="{ active: filterType === 'bookmark' }"
            @click="filterType = 'bookmark'; onFilterChange()"
          >{{ $t('trash.bookmark') }}</button>
          <button
            class="trash-type-btn"
            :class="{ active: filterType === 'note' }"
            @click="filterType = 'note'; onFilterChange()"
          >{{ $t('trash.note') }}</button>
          <button
            class="trash-type-btn"
            :class="{ active: filterType === 'file' }"
            @click="filterType = 'file'; onFilterChange()"
          >{{ $t('trash.file') }}</button>
        </div>
        <b-button type="danger" :loading="emptyingAll" :disabled="total === 0" class="p-trash-empty-btn" @click="confirmEmptyAll">
          {{ $t('trash.emptyAll') }}
        </b-button>
      </div>

      <!-- 骨架屏 -->
      <div v-if="loading" class="p-trash-list">
        <div v-for="n in 5" :key="'sk-' + n" class="p-trash-card p-trash-skeleton">
          <div class="p-trash-card-top">
            <div class="sk-badge"></div>
            <div class="sk-time"></div>
          </div>
          <div class="sk-name"></div>
          <div class="sk-actions">
            <div class="sk-btn"></div>
            <div class="sk-btn"></div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="items.length === 0" class="p-trash-empty">
        <p>{{ $t('trash.noData') }}</p>
      </div>

      <!-- 列表 -->
      <div v-else class="p-trash-list">
        <div v-for="item in items" :key="item.id" class="p-trash-card">
          <div class="p-trash-card-top">
            <span :class="['p-trash-badge', `p-trash-badge--${item.resourceType}`]">
              <span class="p-trash-dot" />
              {{ $t(`trash.${item.resourceType}`) }}
            </span>
            <span class="p-trash-time">{{ item.deletedAt }}</span>
          </div>
          <div class="p-trash-card-body">
            <span class="p-trash-name" :title="item.name">{{ item.name || '-' }}</span>
            <span v-if="item.resourceType === 'file' && item.fileSize" class="p-trash-size">{{
              formatSize(item.fileSize)
            }}</span>
          </div>
          <div class="p-trash-actions">
            <BButton
              size="small"
              @click="confirmRestore(item)"
            >
              {{ $t('trash.restore') }}
            </BButton>
            <BButton size="small" type="danger" @click="confirmDelete(item)">{{ $t('trash.permanentDelete') }}</BButton>
          </div>
        </div>
      </div>
    </div>
  </CommonContainer>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { message } from 'ant-design-vue';
  import { apiBasePost } from '@/http/request';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';

  const { t } = useI18n();

  const loading = ref(false);
  const emptyingAll = ref(false);
  const items = ref<any[]>([]);
  const filterType = ref('');
  const keyword = ref('');
  const total = ref(0);
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

  function onKeywordChange() {
    if (keywordTimer) clearTimeout(keywordTimer);
    keywordTimer = setTimeout(() => {
      fetchList();
    }, 300);
  }

  watch(keyword, () => {
    if (keywordTimer) clearTimeout(keywordTimer);
    keywordTimer = setTimeout(() => {
      fetchList();
    }, 300);
  });

  function onFilterChange() {
    fetchList();
  }

  async function fetchTrashFileSize() {
    try {
      const res = await apiBasePost('/api/trash/fileSize', {});
      if (res.status === 200) trashFileSize.value = res.data?.totalSize || 0;
    } catch {
      /* */
    }
  }

  async function fetchList() {
    loading.value = true;
    try {
      const [res] = await Promise.all([
        apiBasePost('/api/trash/list', {
          resourceType: filterType.value || undefined,
          keyword: keyword.value || undefined,
          pageSize: 200,
          currentPage: 1,
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

  function groupByType(entries: any[]) {
    const map = new Map<string, string[]>();
    entries.forEach(({ id, resourceType }) => {
      if (!map.has(resourceType)) map.set(resourceType, []);
      map.get(resourceType)!.push(id);
    });
    return [...map.entries()];
  }

  async function handleRestore(entries: any[]) {
    if (!entries.length) return;
    try {
      let success = 0;
      for (const [resourceType, ids] of groupByType(entries)) {
        const res = await apiBasePost('/api/trash/restore', { resourceType, ids });
        if (res.status === 200) success += res.data?.restored || 0;
      }
      if (success > 0) {
        message.success(t('trash.restoreSuccess'));
        fetchList();
      }
    } catch (e: any) {
      message.error(e?.message || '恢复失败');
    }
  }

  function confirmRestore(item: any) {
    Alert.alert({
      title: t('trash.restore'),
      content: t('trash.restoreConfirm', { count: 1 }),
      onOk() {
        handleRestore([{ id: item.id, resourceType: item.resourceType }]);
      },
    });
  }

  function confirmDelete(item: any) {
    Alert.alert({
      title: t('trash.permanentDelete'),
      content: t('trash.permanentDeleteConfirm', { count: 1 }),
      onOk() {
        handlePermanentDelete([{ id: item.id, resourceType: item.resourceType }]);
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
    if (!entries.length) return;
    try {
      let success = 0;
      for (const [resourceType, ids] of groupByType(entries)) {
        const res = await apiBasePost('/api/trash/permanentDelete', { resourceType, ids });
        if (res.status === 200) success += res.data?.deleted || 0;
      }
      if (success > 0) {
        message.success(t('trash.permanentDeleteSuccess'));
        fetchList();
      }
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  }

  async function handleEmptyAll() {
    emptyingAll.value = true;
    try {
      const res = await apiBasePost('/api/trash/emptyAll', {});
      if (res.status === 200) {
        message.success(t('trash.emptyAllSuccess'));
        fetchList();
      }
    } catch (e: any) {
      message.error(e?.message || '清空失败');
    } finally {
      emptyingAll.value = false;
    }
  }

  fetchList();
</script>

<style lang="less" scoped>
  .p-trash {
    padding: 12px 16px 24px;
  }

  .p-trash-hero {
    margin-bottom: 12px;
  }

  .p-trash-desc {
    margin: 0;
    font-size: 13px;
    color: var(--desc-color);
  }

  .p-trash-info {
    margin-top: 8px;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;
    background: var(--table-header-bg-color);
    color: var(--desc-color);
  }

  .p-trash-warn {
    margin-top: 8px;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;

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

  .p-trash-toolbar {
    margin-bottom: 10px;
  }

  .p-trash-search {
    width: 100%;
  }

  .p-trash-tabs {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 14px;

    :deep(.ant-radio-group) {
      background: var(--table-header-bg-color);
      border-radius: 10px;
      padding: 3px;
      flex-shrink: 0;

      .ant-radio-button-wrapper {
        border: none;
        background: transparent;
        border-radius: 8px;
        padding: 0 12px;
        height: 30px;
        line-height: 30px;
        font-size: 12px;
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

  .p-trash-empty-btn {
    flex-shrink: 0;
  }

  .p-trash-footer {
    margin-top: 20px;
  }

  .p-trash-empty {
    text-align: center;
    padding: 60px 0;
    color: var(--text-secondary-color);
    font-size: 14px;
  }

  .p-trash-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .p-trash-card {
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--table-bg-color);
    border: 1px solid var(--menu-item-h-bg-color);
  }

  .p-trash-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .p-trash-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 500;
  }

  .p-trash-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .p-trash-badge--bookmark {
    background: rgba(97, 92, 237, 0.08);
    color: #615ced;
    .p-trash-dot {
      background: #615ced;
    }
  }

  .p-trash-badge--note {
    background: rgba(0, 168, 132, 0.08);
    color: #00a884;
    .p-trash-dot {
      background: #00a884;
    }
  }

  .p-trash-badge--file {
    background: rgba(255, 138, 0, 0.08);
    color: #ff8a00;
    .p-trash-dot {
      background: #ff8a00;
    }
  }

  .p-trash-time {
    font-size: 11px;
    color: var(--desc-color);
  }

  .p-trash-card-body {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 2px;
  }

  .p-trash-name {
    font-size: 14px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-color);
  }

  .p-trash-size {
    font-size: 12px;
    color: var(--desc-color);
    flex-shrink: 0;
  }

  .p-trash-actions {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 6px;

    :deep(.ant-btn-link) {
      font-size: 13px;
      padding: 2px 4px;
    }
  }

  .p-trash-footer {
    margin-top: 20px;
  }

  // ---- 骨架屏 ----
  .p-trash-skeleton {
    position: relative;
    overflow: hidden;

    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: -60%;
      width: 60%;
      height: 100%;
      background: linear-gradient(
        90deg,
        transparent,
        var(--skeleton-body-bg-color, rgba(120, 120, 120, 0.06)),
        transparent
      );
      animation: trash-skeleton-shine 1.8s infinite;
    }
  }

  .sk-badge {
    width: 48px;
    height: 20px;
    border-radius: 5px;
    background: rgba(120, 120, 120, 0.14);
  }

  .sk-time {
    width: 72px;
    height: 12px;
    border-radius: 6px;
    background: rgba(120, 120, 120, 0.14);
  }

  .sk-name {
    width: 65%;
    height: 14px;
    border-radius: 7px;
    background: rgba(120, 120, 120, 0.14);
    margin: 4px 0 6px;
  }

  .sk-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
  }

  .sk-btn {
    width: 44px;
    height: 14px;
    border-radius: 7px;
    background: rgba(120, 120, 120, 0.14);
  }

  @keyframes trash-skeleton-shine {
    0% {
      left: -60%;
    }
    100% {
      left: 120%;
    }
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
