import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiBasePost } from '@/http/request';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
import { blockGuestWrite } from '@/composables/useGuestGuard';
import { useGrowth } from '@/composables/useGrowth.ts';
import { recordOperation } from '@/api/commonApi.ts';
import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
import cloudSpaceStore from '@/store/cloudSpace.ts';

export type TrashResourceType = 'bookmark' | 'note' | 'file';
export interface TrashItem {
  id: string;
  resourceType: TrashResourceType;
  name?: string;
  deletedAt?: string;
  fileSize?: number;
  batchCount?: number;
}
export type TrashEntry = Pick<TrashItem, 'id' | 'resourceType' | 'batchCount'>;

export function formatTrashSize(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function getTrashStorageUsagePercent(bytes: number, quotaMb: number) {
  const quotaBytes = Math.max(1, (Number(quotaMb) || 1024) * 1024 * 1024);
  return Number(Math.min(100, (Math.max(0, Number(bytes) || 0) / quotaBytes) * 100).toFixed(1));
}

export function getTrashStorageWarnLevel(percent: number): 'danger' | 'warning' | '' {
  if (Number(percent) >= 30) return 'danger';
  if (Number(percent) >= 15) return 'warning';
  return '';
}

export function useTrash() {
  const { t } = useI18n();
  const { growth, load: loadGrowth } = useGrowth();
  const cloud = cloudSpaceStore();
  const loading = ref(false);
  const emptyingAll = ref(false);
  const restoringAll = ref(false);
  const items = ref<TrashItem[]>([]);
  const total = ref(0);
  const filterType = ref<'' | TrashResourceType>('');
  const keyword = ref('');
  const selectedIds = ref<string[]>([]);
  const trashFileSize = ref(0);
  let keywordTimer: ReturnType<typeof setTimeout> | null = null;

  const retainDays = computed(() => growth.value?.trashDays || 30);
  const trashFileSizeText = computed(() => formatTrashSize(trashFileSize.value));
  const trashFileSizePercent = computed(() =>
    getTrashStorageUsagePercent(trashFileSize.value, Number(growth.value?.spaceMb || cloud.maxSpace || 1024)),
  );
  const trashFileSizeWarnLevel = computed(() => getTrashStorageWarnLevel(trashFileSizePercent.value));
  const selectedItems = computed<TrashEntry[]>(() => {
    const selected = new Set(selectedIds.value);
    return items.value
      .filter((item) => selected.has(item.id))
      .map((item) => ({ id: item.id, resourceType: item.resourceType, batchCount: item.batchCount }));
  });
  const pageSubtitle = computed(() =>
    total.value ? t('trash.summary', { count: total.value, size: trashFileSizeText.value }) : t('trash.subtitle'),
  );

  async function fetchTrashFileSize() {
    try {
      const response = await apiBasePost('/api/trash/fileSize', {});
      if (response.status === 200) trashFileSize.value = response.data?.totalSize || 0;
    } catch {
      trashFileSize.value = 0;
    }
  }

  async function fetchList() {
    loading.value = true;
    selectedIds.value = [];
    try {
      const [response] = await Promise.all([
        apiBasePost('/api/trash/list', {
          resourceType: filterType.value || undefined,
          keyword: keyword.value.trim() || undefined,
          pageSize: 200,
          currentPage: 1,
        }),
        fetchTrashFileSize(),
      ]);
      if (response.status !== 200) return;
      items.value = response.data?.items || [];
      total.value = response.data?.total || 0;
    } finally {
      loading.value = false;
    }
  }

  function setFilter(type: '' | TrashResourceType) {
    if (filterType.value === type) return;
    filterType.value = type;
    fetchList();
  }

  function groupByType(entries: TrashEntry[]) {
    const groups = new Map<TrashResourceType, string[]>();
    entries.forEach(({ id, resourceType }) => {
      if (!groups.has(resourceType)) groups.set(resourceType, []);
      groups.get(resourceType)!.push(id);
    });
    return [...groups.entries()];
  }

  function normalizeEntries(value: TrashItem | TrashEntry | Array<TrashItem | TrashEntry>): TrashEntry[] {
    const entries = Array.isArray(value) ? value : [value];
    return entries.map(({ id, resourceType, batchCount }) => ({ id, resourceType, batchCount }));
  }

  function affectedEntryCount(entries: TrashEntry[]) {
    return entries.reduce((total, entry) => total + Math.max(1, Number(entry.batchCount || 1)), 0);
  }

  async function restore(entries: TrashEntry[]) {
    if (blockGuestWrite('restore-trash') || !entries.length) return;
    try {
      let success = 0;
      for (const [resourceType, ids] of groupByType(entries)) {
        const response = await apiBasePost('/api/trash/restore', { resourceType, ids });
        if (response.status === 200) success += response.data?.restored || 0;
      }
      if (!success) {
        // 此前静默 return:用户点了恢复却毫无反馈,无法区分失败与未生效
        message.warning(t('trash.restoreFailed'));
        return;
      }
      message.success(t('trash.restoreSuccess'));
      recordOperation({ ...OPERATION_LOG_MAP.trash.restore, operation: `恢复回收站资源成功【${success}项】` });
      await Promise.all([fetchList(), cloud.getUsedSpace()]);
    } catch (error: any) {
      message.error(error?.message || t('trash.restoreFailed'));
    }
  }

  function confirmRestore(value: TrashItem | TrashEntry | Array<TrashItem | TrashEntry>) {
    const entries = normalizeEntries(value);
    Alert.alert({
      title: t('trash.restore'),
      content: t('trash.restoreConfirm', { count: affectedEntryCount(entries) }),
      onOk: () => restore(entries),
    });
  }

  async function permanentlyDelete(entries: TrashEntry[]) {
    if (blockGuestWrite('delete-trash') || !entries.length) return;
    try {
      let success = 0;
      for (const [resourceType, ids] of groupByType(entries)) {
        const response = await apiBasePost('/api/trash/permanentDelete', { resourceType, ids });
        if (response.status === 200) success += response.data?.deleted || 0;
      }
      if (!success) {
        message.warning(t('common.deleteFailed'));
        return;
      }
      message.success(t('trash.permanentDeleteSuccess'));
      recordOperation({
        ...OPERATION_LOG_MAP.trash.permanentDelete,
        operation: `永久删除回收站资源成功【${success}项】`,
      });
      await Promise.all([fetchList(), cloud.getUsedSpace()]);
    } catch (error: any) {
      message.error(error?.message || t('common.deleteFailed'));
    }
  }

  function confirmDelete(value: TrashItem | TrashEntry | Array<TrashItem | TrashEntry>) {
    const entries = normalizeEntries(value);
    Alert.alert({
      title: t('trash.permanentDelete'),
      content: t('trash.permanentDeleteConfirm', { count: affectedEntryCount(entries) }),
      onOk: () => permanentlyDelete(entries),
    });
  }

  function confirmRestoreAll() {
    Alert.alert({
      title: t('trash.restoreAll'),
      content: t('trash.restoreAllConfirm', { count: total.value }),
      onOk: restoreAll,
    });
  }

  async function restoreAll() {
    if (blockGuestWrite('restore-trash')) return;
    restoringAll.value = true;
    try {
      const response = await apiBasePost('/api/trash/restoreAll', {});
      if (response.status !== 200) return;
      const restored = Number(response.data?.restored || 0);
      message.success(response.msg || t('trash.restoreSuccess'));
      if (restored > 0) {
        recordOperation({
          ...OPERATION_LOG_MAP.trash.restoreAll,
          operation: `一键恢复全部回收站资源成功【${restored}项】`,
        });
      }
      await Promise.all([fetchList(), cloud.getUsedSpace()]);
    } catch (error: any) {
      message.error(error?.message || t('trash.restoreFailed'));
    } finally {
      restoringAll.value = false;
    }
  }

  function confirmEmptyAll() {
    Alert.alert({
      title: t('trash.emptyAll'),
      content: t('trash.emptyAllConfirm'),
      onOk: emptyAll,
    });
  }

  async function emptyAll() {
    if (blockGuestWrite('delete-trash')) return;
    emptyingAll.value = true;
    try {
      const response = await apiBasePost('/api/trash/emptyAll', {});
      if (response.status !== 200) return;
      const deleted = Number(response.data?.deleted || 0);
      message.success(t('trash.emptyAllSuccess'));
      if (deleted > 0) {
        recordOperation({ ...OPERATION_LOG_MAP.trash.emptyAll, operation: `清空回收站成功【${deleted}项】` });
      }
      await Promise.all([fetchList(), cloud.getUsedSpace()]);
    } catch (error: any) {
      message.error(error?.message || t('common.deleteFailed'));
    } finally {
      emptyingAll.value = false;
    }
  }

  watch(keyword, () => {
    if (keywordTimer) clearTimeout(keywordTimer);
    keywordTimer = setTimeout(fetchList, 300);
  });

  onMounted(() => {
    void fetchList();
    void loadGrowth();
    void cloud.getUsedSpace();
  });
  onBeforeUnmount(() => {
    if (keywordTimer) clearTimeout(keywordTimer);
  });

  return {
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
    fetchList,
    setFilter,
    confirmRestore,
    confirmDelete,
    confirmRestoreAll,
    confirmEmptyAll,
  };
}
