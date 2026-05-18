<template>
  <CommonContainer :title="$t('trash.title')">
    <div class="p-trash">
      <div class="p-trash-type-tabs">
        <a-radio-group v-model:value="filterType" option-type="button" button-style="solid" size="small" @change="onFilterChange">
          <a-radio-button value="">{{ $t('trash.allType') }}</a-radio-button>
          <a-radio-button value="bookmark">{{ $t('trash.bookmark') }}</a-radio-button>
          <a-radio-button value="note">{{ $t('trash.note') }}</a-radio-button>
          <a-radio-button value="file">{{ $t('trash.file') }}</a-radio-button>
        </a-radio-group>
      </div>

      <a-spin :spinning="loading">
        <div v-if="!loading && items.length === 0" class="p-trash-empty">
          <p>{{ $t('trash.noData') }}</p>
        </div>

        <div v-else class="p-trash-list">
          <div v-for="item in items" :key="item.id" class="p-trash-card">
            <div class="p-trash-card-top">
              <span :class="['p-trash-type-tag', `p-trash-type-tag--${item.resourceType}`]">
                {{ $t(`trash.${item.resourceType}`) }}
              </span>
              <span class="p-trash-time">{{ item.deletedAt }}</span>
            </div>
            <div class="p-trash-name">{{ item.name || '-' }}</div>
            <div class="p-trash-actions">
              <a-button type="link" size="small" @click="handleRestore([{ id: item.id, resourceType: item.resourceType }])">
                {{ $t('trash.restore') }}
              </a-button>
              <a-popconfirm
                :title="$t('trash.permanentDeleteConfirm', { count: 1 })"
                @confirm="handlePermanentDelete([{ id: item.id, resourceType: item.resourceType }])"
              >
                <a-button type="link" size="small" danger>{{ $t('trash.permanentDelete') }}</a-button>
              </a-popconfirm>
            </div>
          </div>
        </div>

        <a-pagination
          v-if="total > pagination.pageSize"
          v-model:current="pagination.current"
          :page-size="pagination.pageSize"
          :total="total"
          size="small"
          @change="fetchList"
          class="p-trash-pagination"
        />
      </a-spin>

      <div class="p-trash-footer">
        <a-popconfirm
          :title="$t('trash.emptyAllConfirm')"
          @confirm="handleEmptyAll"
          ok-text="确认"
          cancel-text="取消"
        >
          <a-button danger block :loading="emptyingAll">{{ $t('trash.emptyAll') }}</a-button>
        </a-popconfirm>
      </div>
    </div>
  </CommonContainer>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { message } from 'ant-design-vue';
import { apiBasePost } from '@/http/request';
import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';

const { t } = useI18n();

const loading = ref(false);
const emptyingAll = ref(false);
const items = ref<any[]>([]);
const filterType = ref('');
const total = ref(0);
const pagination = reactive({ current: 1, pageSize: 20 });

function onFilterChange() {
  pagination.current = 1;
  fetchList();
}

async function fetchList() {
  loading.value = true;
  try {
    const res = await apiBasePost('/api/trash/list', {
      resourceType: filterType.value || undefined,
      pageSize: pagination.pageSize,
      currentPage: pagination.current,
    });
    if (res.status === 200) {
      items.value = res.data?.items || [];
      total.value = res.data?.total || 0;
    }
  } finally {
    loading.value = false;
  }
}

function groupByType(entries: { id: string; resourceType: string }[]) {
  const map = new Map<string, string[]>();
  entries.forEach(({ id, resourceType }) => {
    if (!map.has(resourceType)) map.set(resourceType, []);
    map.get(resourceType)!.push(id);
  });
  return [...map.entries()];
}

async function handleRestore(entries: { id: string; resourceType: string }[]) {
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

<style scoped>
.p-trash {
  padding: 16px;
}
.p-trash-type-tabs {
  margin-bottom: 16px;
  overflow-x: auto;
}
.p-trash-empty {
  text-align: center;
  padding: 60px 0;
  color: var(--text-secondary-color);
}
.p-trash-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.p-trash-card {
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-secondary-color);
  border: 1px solid var(--border-color);
}
.p-trash-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.p-trash-type-tag {
  display: inline-block;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 20px;
}
.p-trash-type-tag--bookmark {
  background: rgba(97, 92, 237, 0.1);
  color: #615ced;
}
.p-trash-type-tag--note {
  background: rgba(0, 168, 132, 0.1);
  color: #00a884;
}
.p-trash-type-tag--file {
  background: rgba(255, 138, 0, 0.1);
  color: #ff8a00;
}
.p-trash-time {
  font-size: 12px;
  color: var(--text-secondary-color);
}
.p-trash-name {
  font-size: 15px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.p-trash-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.p-trash-pagination {
  margin-top: 16px;
  text-align: center;
}
.p-trash-footer {
  margin-top: 24px;
}
</style>
