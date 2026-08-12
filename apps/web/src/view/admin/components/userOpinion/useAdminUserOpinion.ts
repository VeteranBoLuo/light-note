import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import opinionApi from '@/api/opinionApi.ts';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import { normalizeAdminActionCenterReturnTo } from '@/utils/adminNavigation.ts';

export type AdminOpinionStatus = 'pending' | 'replied' | 'viewed';

export interface AdminOpinionRecord {
  id: string;
  userId?: string | null;
  alias?: string | null;
  phone?: string | null;
  type?: string | null;
  content?: string | null;
  imgArray?: string | string[] | null;
  status?: AdminOpinionStatus;
  replyContent?: string | null;
  replyTime?: string | null;
  replyViewed?: number | boolean | null;
  viewedTime?: string | null;
  createTime?: string | null;
}

interface AdminOpinionReceiptData {
  affectedRows?: number;
  auditId?: string | null;
  requestId?: string | null;
  notificationCreated?: boolean | null;
}

type AdminOpinionOperation = 'reply' | 'delete';
type Translate = (key: string, named?: Record<string, string | number>) => string;

const STATUS_VALUES = new Set<AdminOpinionStatus>(['pending', 'replied', 'viewed']);

export function normalizeAdminOpinionStatus(value: unknown): AdminOpinionStatus | 'all' {
  const status = String(value || '').trim() as AdminOpinionStatus;
  return STATUS_VALUES.has(status) ? status : 'all';
}

export function normalizeAdminOpinionReturnTo(value: unknown) {
  return normalizeAdminActionCenterReturnTo(value);
}

export function parseAdminOpinionImages(value: AdminOpinionRecord['imgArray']) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function createAdminOpinionReceipt(
  operation: AdminOpinionOperation,
  data: AdminOpinionReceiptData | null | undefined,
  t: Translate,
) {
  const parts = [
    t(operation === 'reply' ? 'adminUserOpinion.messages.replySuccess' : 'adminUserOpinion.messages.deleteSuccess'),
  ];
  const affectedRows = Number(data?.affectedRows);
  if (Number.isFinite(affectedRows)) {
    parts.push(t('adminUserOpinion.receipt.affected', { count: affectedRows }));
  }
  if (data?.requestId) parts.push(t('adminUserOpinion.receipt.requestId', { id: data.requestId }));
  if (data?.auditId) parts.push(t('adminUserOpinion.receipt.auditId', { id: data.auditId }));

  let tone: 'success' | 'warning' = 'success';
  if (!data?.auditId) {
    tone = 'warning';
    parts.push(t('adminUserOpinion.receipt.auditUnavailable'));
  }
  if (operation === 'reply' && data?.notificationCreated === false) {
    tone = 'warning';
    parts.push(t('adminUserOpinion.receipt.notificationFailed'));
  }
  return { tone, content: parts.join(' · ') };
}

export function useAdminUserOpinion(options: { initialPageSize?: number } = {}) {
  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const opinionList = ref<AdminOpinionRecord[]>([]);
  const replyDrafts = reactive<Record<string, string>>({});
  const selectedRecord = ref<AdminOpinionRecord | null>(null);
  const pendingDelete = ref<AdminOpinionRecord | null>(null);
  const detailVisible = ref(false);
  const deleteVisible = ref(false);
  const loading = ref(false);
  const replying = ref(false);
  const deleting = ref(false);
  const currentPage = ref(1);
  const pageSize = ref(options.initialPageSize || 20);
  const total = ref(0);
  const searchValue = ref('');
  const statusFilter = ref<AdminOpinionStatus | 'all'>(normalizeAdminOpinionStatus(route.query.status));
  const hideInternal = ref(true);
  const summary = ref({ pendingTotal: 0, repliedTotal: 0, viewedTotal: 0 });
  let searchTimer: number | null = null;
  let loadSequence = 0;

  const returnTo = computed(() => normalizeAdminOpinionReturnTo(route.query.returnTo));
  const linkedOpinionId = computed(() =>
    String(route.query.opinionId || '')
      .trim()
      .slice(0, 255),
  );
  const statusOptions = computed(() => [
    { label: t('adminUserOpinion.filters.all'), value: 'all' },
    { label: t('adminUserOpinion.filters.pending'), value: 'pending' },
    { label: t('adminUserOpinion.filters.replied'), value: 'replied' },
    { label: t('adminUserOpinion.filters.viewed'), value: 'viewed' },
  ]);
  const statCards = computed(() => [
    {
      label: t('adminUserOpinion.metrics.pending'),
      value: summary.value.pendingTotal,
      hint: t('adminUserOpinion.metrics.pendingHint'),
    },
    {
      label: t('adminUserOpinion.metrics.replied'),
      value: summary.value.repliedTotal,
      hint: t('adminUserOpinion.metrics.repliedHint'),
    },
    {
      label: t('adminUserOpinion.metrics.viewed'),
      value: summary.value.viewedTotal,
      hint: t('adminUserOpinion.metrics.viewedHint'),
    },
  ]);

  function statusMeta(status: unknown) {
    const normalized = normalizeAdminOpinionStatus(status);
    const value = normalized === 'all' ? 'pending' : normalized;
    return {
      value,
      label: t(`adminUserOpinion.filters.${value}`),
      tone:
        value === 'pending' ? ('pending' as const) : value === 'viewed' ? ('success' as const) : ('neutral' as const),
    };
  }

  function assignDraft(record: AdminOpinionRecord) {
    replyDrafts[record.id] = record.replyContent || '';
  }

  function openOpinion(record: AdminOpinionRecord) {
    assignDraft(record);
    selectedRecord.value = record;
    detailVisible.value = true;
  }

  function closeDetail() {
    detailVisible.value = false;
  }

  function replaceRecord(id: string, patch: Partial<AdminOpinionRecord>) {
    const index = opinionList.value.findIndex((item) => item.id === id);
    let updated: AdminOpinionRecord;
    if (index >= 0) {
      updated = { ...opinionList.value[index], ...patch };
      opinionList.value.splice(index, 1, updated);
    } else {
      updated = { ...(selectedRecord.value || { id }), ...patch, id };
    }
    if (selectedRecord.value?.id === id) selectedRecord.value = updated;
    return updated;
  }

  function removeRecord(id: string) {
    const index = opinionList.value.findIndex((item) => item.id === id);
    if (index >= 0) {
      opinionList.value.splice(index, 1);
      total.value = Math.max(0, total.value - 1);
    }
  }

  function adjustSummary(from: AdminOpinionStatus, to?: AdminOpinionStatus) {
    const keyByStatus = {
      pending: 'pendingTotal',
      replied: 'repliedTotal',
      viewed: 'viewedTotal',
    } as const;
    summary.value[keyByStatus[from]] = Math.max(0, Number(summary.value[keyByStatus[from]] || 0) - 1);
    if (to && to !== from) summary.value[keyByStatus[to]] = Number(summary.value[keyByStatus[to]] || 0) + 1;
  }

  async function loadOpinions({ silent = false }: { silent?: boolean } = {}) {
    const requestId = ++loadSequence;
    if (!silent) loading.value = true;
    try {
      const response: any = await opinionApi.getOpinionList({
        currentPage: currentPage.value,
        pageSize: pageSize.value,
        filters: {
          key: searchValue.value.trim(),
          status: statusFilter.value === 'all' ? undefined : statusFilter.value,
          hideInternal: hideInternal.value,
        },
      });
      if (requestId !== loadSequence) return false;
      if (response?.status !== 200) throw new Error(response?.msg || t('adminUserOpinion.messages.loadFailed'));
      opinionList.value = Array.isArray(response.data?.items) ? response.data.items : [];
      total.value = Number(response.data?.total || 0);
      summary.value = {
        pendingTotal: Number(response.data?.summary?.pendingTotal || 0),
        repliedTotal: Number(response.data?.summary?.repliedTotal || 0),
        viewedTotal: Number(response.data?.summary?.viewedTotal || 0),
      };
      opinionList.value.forEach(assignDraft);
      return true;
    } catch (error: any) {
      if (requestId === loadSequence && !silent) {
        message.error(error?.message || t('adminUserOpinion.messages.loadFailed'));
      }
      return false;
    } finally {
      if (requestId === loadSequence) loading.value = false;
    }
  }

  async function openLinkedOpinion() {
    const id = linkedOpinionId.value;
    if (!id) return;
    const current = opinionList.value.find((item) => item.id === id);
    if (current) {
      openOpinion(current);
      return;
    }
    try {
      const response: any = await opinionApi.getOpinionList({
        currentPage: 1,
        pageSize: 1,
        filters: { opinionId: id, hideInternal: false },
      });
      const record = response?.status === 200 && Array.isArray(response.data?.items) ? response.data.items[0] : null;
      if (!record) {
        message.warning(t('adminUserOpinion.messages.notFound'));
        return;
      }
      openOpinion(record);
    } catch {
      message.warning(t('adminUserOpinion.messages.notFound'));
    }
  }

  async function initialize() {
    await loadOpinions();
    await openLinkedOpinion();
  }

  function handleSearch() {
    if (searchTimer != null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      currentPage.value = 1;
      void loadOpinions();
    }, 400);
  }

  function applyFilters() {
    currentPage.value = 1;
    void loadOpinions();
  }

  function onPageChange(page: number) {
    currentPage.value = page;
    void loadOpinions();
  }

  function onSizeChange(_currentOrSize: number, maybeSize?: number) {
    pageSize.value = Number(maybeSize || _currentOrSize || pageSize.value);
    currentPage.value = 1;
    void loadOpinions();
  }

  async function submitReply(record: AdminOpinionRecord) {
    const replyContent = String(replyDrafts[record.id] || '').trim();
    if (!replyContent) {
      message.warning(t('adminUserOpinion.messages.replyRequired'));
      return false;
    }
    replying.value = true;
    const recordWasListed = opinionList.value.some((item) => item.id === record.id);
    try {
      const response: any = await opinionApi.replyOpinion({
        id: record.id,
        replyContent,
        reason: t('adminUserOpinion.replyAuditReason'),
      });
      if (response?.status !== 200) throw new Error(response?.msg || t('adminUserOpinion.messages.replyFailed'));
      const beforeStatus = (record.status || 'pending') as AdminOpinionStatus;
      const updated = replaceRecord(record.id, {
        ...(response.data?.opinion || {}),
        status: 'replied',
        replyContent,
        replyViewed: 0,
        viewedTime: null,
      });
      if (recordWasListed && beforeStatus !== 'replied') adjustSummary(beforeStatus, 'replied');
      if (statusFilter.value !== 'all' && statusFilter.value !== updated.status) removeRecord(record.id);
      const receipt = createAdminOpinionReceipt('reply', response.data, t);
      message[receipt.tone](receipt.content);
      void loadOpinions({ silent: true });
      return true;
    } catch (error: any) {
      message.error(error?.message || t('adminUserOpinion.messages.replyFailed'));
      return false;
    } finally {
      replying.value = false;
    }
  }

  function requestDelete(record: AdminOpinionRecord) {
    pendingDelete.value = record;
    deleteVisible.value = true;
  }

  async function confirmDelete(payload: { reason: string; confirmed: true; confirmText: string }) {
    const record = pendingDelete.value;
    if (!record) return false;
    deleting.value = true;
    const recordWasListed = opinionList.value.some((item) => item.id === record.id);
    try {
      const response: any = await opinionApi.deleteOpinion({ id: record.id, reason: payload.reason });
      if (response?.status !== 200) throw new Error(response?.msg || t('adminUserOpinion.messages.deleteFailed'));
      if (recordWasListed) adjustSummary((record.status || 'pending') as AdminOpinionStatus);
      removeRecord(record.id);
      if (selectedRecord.value?.id === record.id) closeDetail();
      const receipt = createAdminOpinionReceipt('delete', response.data, t);
      message[receipt.tone](receipt.content);
      deleteVisible.value = false;
      pendingDelete.value = null;
      void loadOpinions({ silent: true });
      return true;
    } catch (error: any) {
      message.error(error?.message || t('adminUserOpinion.messages.deleteFailed'));
      return false;
    } finally {
      deleting.value = false;
    }
  }

  function goToReturnQueue() {
    if (returnTo.value) void router.push(returnTo.value);
  }

  onBeforeUnmount(() => {
    if (searchTimer != null) window.clearTimeout(searchTimer);
  });

  return {
    opinionList,
    replyDrafts,
    selectedRecord,
    pendingDelete,
    detailVisible,
    deleteVisible,
    loading,
    replying,
    deleting,
    currentPage,
    pageSize,
    total,
    searchValue,
    statusFilter,
    hideInternal,
    returnTo,
    statusOptions,
    statCards,
    statusMeta,
    initialize,
    loadOpinions,
    handleSearch,
    applyFilters,
    onPageChange,
    onSizeChange,
    openOpinion,
    closeDetail,
    submitReply,
    requestDelete,
    confirmDelete,
    goToReturnQueue,
  };
}
