import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { apiQueryPost } from '@/http/request.ts';
import userApi from '@/api/userApi.ts';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
import { type BaseFormItem } from '@/config/formConfig.ts';
import formRenders from '@/components/base/BasicComponents/BForm/FormRenders.vue';
import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';
import { useUserStore } from '@/store';

export type AdminUserSortField = 'lastActiveTime' | 'createTime';
export type AdminUserSortOrder = 'asc' | 'desc';
export type AdminUserMobileSort = 'recentlyActive' | 'leastRecentlyActive' | 'newest' | 'oldest';
export type AdminUserRiskKind = 'edit' | 'disable' | 'restore';
export type AdminUserRiskPayload = { reason: string; confirmed: true; confirmText: string };
type AdminTranslate = (key: string, named?: Record<string, string | number>) => string;

export interface AdminUserListContext {
  search: string;
  role: '' | 'user' | 'visitor' | 'test' | 'root';
  status: 'active' | 'banned' | 'all';
  activity: 'all' | 'day1' | 'day7' | 'day30' | 'inactive30';
  sortField: AdminUserSortField;
  sortOrder: AdminUserSortOrder;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface AdminActionResponseData {
  affectedRows?: number;
  auditId?: string;
  requestId?: string;
  sessionsRevoked?: boolean | null;
}

const DEFAULT_LIST_CONTEXT: AdminUserListContext = Object.freeze({
  search: '',
  role: '',
  status: 'active',
  activity: 'all',
  sortField: 'lastActiveTime',
  sortOrder: 'desc',
});
const ROLE_VALUES = new Set<AdminUserListContext['role']>(['', 'user', 'visitor', 'test', 'root']);
const STATUS_VALUES = new Set<AdminUserListContext['status']>(['active', 'banned', 'all']);
const ACTIVITY_VALUES = new Set<AdminUserListContext['activity']>(['all', 'day1', 'day7', 'day30', 'inactive30']);

function sessionStorageOrNull(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function contextStorageKey(actorUserId: string) {
  const actor =
    String(actorUserId || 'unknown')
      .trim()
      .slice(0, 255) || 'unknown';
  return `light-note:admin-user-list:v1:${actor}`;
}

export function normalizeAdminUserListContext(value: unknown): AdminUserListContext {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const role = String(input.role || '') as AdminUserListContext['role'];
  const status = String(input.status || '') as AdminUserListContext['status'];
  const activity = String(input.activity || '') as AdminUserListContext['activity'];
  const sortField = String(input.sortField || '') as AdminUserSortField;
  const sortOrder = String(input.sortOrder || '') as AdminUserSortOrder;
  return {
    search: String(input.search || '')
      .trim()
      .slice(0, 200),
    role: ROLE_VALUES.has(role) ? role : DEFAULT_LIST_CONTEXT.role,
    status: STATUS_VALUES.has(status) ? status : DEFAULT_LIST_CONTEXT.status,
    activity: ACTIVITY_VALUES.has(activity) ? activity : DEFAULT_LIST_CONTEXT.activity,
    sortField: sortField === 'createTime' ? 'createTime' : DEFAULT_LIST_CONTEXT.sortField,
    sortOrder: sortOrder === 'asc' ? 'asc' : DEFAULT_LIST_CONTEXT.sortOrder,
  };
}

export function readAdminUserListContext(actorUserId: string, storage = sessionStorageOrNull()) {
  if (!storage) return { ...DEFAULT_LIST_CONTEXT };
  try {
    const raw = storage.getItem(contextStorageKey(actorUserId));
    return raw ? normalizeAdminUserListContext(JSON.parse(raw)) : { ...DEFAULT_LIST_CONTEXT };
  } catch {
    return { ...DEFAULT_LIST_CONTEXT };
  }
}

export function saveAdminUserListContext(
  actorUserId: string,
  context: AdminUserListContext,
  storage = sessionStorageOrNull(),
) {
  if (!storage) return;
  try {
    storage.setItem(contextStorageKey(actorUserId), JSON.stringify(normalizeAdminUserListContext(context)));
  } catch {
    // 会话存储不可用不应阻断用户管理主流程。
  }
}

export function adminUserMobileSort(context: Pick<AdminUserListContext, 'sortField' | 'sortOrder'>) {
  if (context.sortField === 'createTime') return context.sortOrder === 'asc' ? 'oldest' : 'newest';
  return context.sortOrder === 'asc' ? 'leastRecentlyActive' : 'recentlyActive';
}

export function adminUserRequestSort(value: AdminUserMobileSort): {
  field: AdminUserSortField;
  order: AdminUserSortOrder;
} {
  if (value === 'newest') return { field: 'createTime', order: 'desc' };
  if (value === 'oldest') return { field: 'createTime', order: 'asc' };
  if (value === 'leastRecentlyActive') return { field: 'lastActiveTime', order: 'asc' };
  return { field: 'lastActiveTime', order: 'desc' };
}

export function adminUserLabel(record: any) {
  return record?.adminRemark || record?.alias || record?.email || record?.id || '-';
}

export function createAdminUserActionReceipt(
  kind: AdminUserRiskKind,
  data: AdminActionResponseData | null | undefined,
  t: AdminTranslate,
) {
  const successKey =
    kind === 'edit'
      ? 'adminUserManagement.saveSuccess'
      : kind === 'restore'
        ? 'adminUserManagement.restoreSuccess'
        : 'adminUserManagement.deleteSuccess';
  const parts = [t(successKey)];
  const affectedRows = Number(data?.affectedRows);
  if (Number.isFinite(affectedRows)) {
    parts.push(t('adminUserManagement.receipt.affected', { count: affectedRows }));
  }
  if (data?.requestId) parts.push(t('adminUserManagement.receipt.requestId', { id: data.requestId }));
  if (data?.auditId) parts.push(t('adminUserManagement.receipt.auditId', { id: data.auditId }));
  if (kind === 'disable' && data?.sessionsRevoked === false) {
    parts.push(t('adminUserManagement.receipt.sessionCleanupPending'));
    return { tone: 'warning' as const, content: parts.join(' · ') };
  }
  return { tone: 'success' as const, content: parts.join(' · ') };
}

export function useAdminUserManagementList({
  t,
  limit = 50,
  scrollToTop,
}: {
  t: AdminTranslate;
  limit?: number;
  scrollToTop?: () => void;
}) {
  const currentUser = useUserStore();
  const initial = readAdminUserListContext(currentUser.id);
  const searchValue = ref(initial.search);
  const roleFilter = ref<AdminUserListContext['role']>(initial.role);
  const statusFilter = ref<AdminUserListContext['status']>(initial.status);
  const activityFilter = ref<AdminUserListContext['activity']>(initial.activity);
  const sortState = ref<{ key: AdminUserSortField | null; order: AdminUserSortOrder | null }>({
    key: initial.sortField,
    order: initial.sortOrder,
  });
  let searchTimer: number | null = null;

  const roleOptions = computed(() => [
    { label: t('adminUserManagement.filters.allRoles'), value: '' },
    { label: t('adminUserManagement.detail.roles.user'), value: 'user' },
    { label: t('adminUserManagement.detail.roles.visitor'), value: 'visitor' },
    { label: t('adminUserManagement.detail.roles.test'), value: 'test' },
    { label: t('adminUserManagement.detail.roles.root'), value: 'root' },
  ]);
  const statusOptions = computed(() => [
    { label: t('adminUserManagement.filters.active'), value: 'active' },
    { label: t('adminUserManagement.filters.banned'), value: 'banned' },
    { label: t('adminUserManagement.filters.allStatuses'), value: 'all' },
  ]);
  const activityOptions = computed(() => [
    { label: t('adminUserManagement.filters.allActivity'), value: 'all' },
    { label: t('adminUserManagement.filters.active1d'), value: 'day1' },
    { label: t('adminUserManagement.filters.active7d'), value: 'day7' },
    { label: t('adminUserManagement.filters.active30d'), value: 'day30' },
    { label: t('adminUserManagement.filters.inactive30d'), value: 'inactive30' },
  ]);
  const sortOptions = computed(() => [
    { label: t('adminUserManagement.filters.recentlyActive'), value: 'recentlyActive' },
    { label: t('adminUserManagement.filters.leastRecentlyActive'), value: 'leastRecentlyActive' },
    { label: t('adminUserManagement.filters.newest'), value: 'newest' },
    { label: t('adminUserManagement.filters.oldest'), value: 'oldest' },
  ]);
  const requestSort = computed<{ field: AdminUserSortField; order: AdminUserSortOrder }>(() => ({
    field: sortState.value.key === 'createTime' ? 'createTime' : 'lastActiveTime',
    order: sortState.value.order === 'asc' ? 'asc' : 'desc',
  }));
  const sortFilter = computed<AdminUserMobileSort>({
    get: () =>
      adminUserMobileSort({
        sortField: requestSort.value.field,
        sortOrder: requestSort.value.order,
      }),
    set: (value) => {
      const next = adminUserRequestSort(value);
      sortState.value = { key: next.field, order: next.order };
    },
  });
  const hasActiveFilters = computed(
    () =>
      Boolean(searchValue.value || roleFilter.value) ||
      statusFilter.value !== DEFAULT_LIST_CONTEXT.status ||
      activityFilter.value !== DEFAULT_LIST_CONTEXT.activity ||
      sortFilter.value !== 'recentlyActive',
  );

  const persistContext = () =>
    saveAdminUserListContext(currentUser.id, {
      search: searchValue.value,
      role: roleFilter.value,
      status: statusFilter.value,
      activity: activityFilter.value,
      sortField: requestSort.value.field,
      sortOrder: requestSort.value.order,
    });

  watch([searchValue, roleFilter, statusFilter, activityFilter, sortState], persistContext, {
    deep: true,
    flush: 'sync',
  });

  const list = useAdminCursorList<any>({
    limit,
    request: (cursor, pageLimit) =>
      apiQueryPost('/api/user/getUserList', {
        cursor,
        limit: pageLimit,
        filters: {
          key: searchValue.value,
          role: roleFilter.value,
          status: statusFilter.value,
          activityWindow: activityFilter.value,
        },
        sort: requestSort.value,
      }),
    onError: (_error, silent) => {
      if (!silent) message.error(t('common.requestFailedDescription'));
    },
  });

  function reloadUsers(options: { silent?: boolean } = {}) {
    persistContext();
    scrollToTop?.();
    return list.reload(options);
  }

  function handleSearch() {
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void reloadUsers({ silent: true }), 500);
  }

  function reloadForFilter() {
    void reloadUsers();
  }

  function resetFilters() {
    searchValue.value = DEFAULT_LIST_CONTEXT.search;
    roleFilter.value = DEFAULT_LIST_CONTEXT.role;
    statusFilter.value = DEFAULT_LIST_CONTEXT.status;
    activityFilter.value = DEFAULT_LIST_CONTEXT.activity;
    sortState.value = {
      key: DEFAULT_LIST_CONTEXT.sortField,
      order: DEFAULT_LIST_CONTEXT.sortOrder,
    };
    void reloadUsers();
  }

  function onSortChange(sort: { key: string | null; order: AdminUserSortOrder | null }) {
    sortState.value = {
      key: sort.key === 'createTime' ? 'createTime' : sort.key === 'lastActiveTime' ? 'lastActiveTime' : 'createTime',
      order: sort.order === 'asc' ? 'asc' : 'desc',
    };
    void reloadUsers();
  }

  onMounted(() => void reloadUsers());
  onBeforeUnmount(() => {
    if (searchTimer !== null) window.clearTimeout(searchTimer);
  });

  return {
    ...list,
    searchValue,
    roleFilter,
    statusFilter,
    activityFilter,
    sortState,
    sortFilter,
    roleOptions,
    statusOptions,
    activityOptions,
    sortOptions,
    requestSort,
    hasActiveFilters,
    handleSearch,
    reloadForFilter,
    reloadUsers,
    resetFilters,
    onSortChange,
  };
}

export function useAdminUserOperations({
  t,
  items,
  reloadUsers,
}: {
  t: AdminTranslate;
  items: Ref<any[]>;
  reloadUsers: (options?: { silent?: boolean }) => Promise<boolean>;
}) {
  const editData = ref<any>();
  const editVisible = ref(false);
  const previewVisible = ref(false);
  const previewUser = ref<any>(null);
  const previewMode = ref<'readonly' | 'maintain'>('readonly');
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);
  const remarkVisible = ref(false);
  const remarkUser = ref<any>(null);
  const growthAdminVisible = ref(false);
  const growthAdminUser = ref<{ id: string; alias: string }>({ id: '', alias: '' });
  const riskVisible = ref(false);
  const riskLoading = ref(false);
  const riskKind = ref<AdminUserRiskKind>('edit');
  const riskUser = ref<any>(null);

  const riskConfig = computed(() => {
    const record = riskUser.value || editData.value || {};
    const name = adminUserLabel(record);
    if (riskKind.value === 'disable') {
      return {
        title: t('adminUserManagement.disableAction'),
        impact: t('adminUserManagement.deleteConfirm', { name }),
        phrase: t('adminUserManagement.confirmPhrases.disable'),
        label: t('adminUserManagement.disableAction'),
      };
    }
    if (riskKind.value === 'restore') {
      return {
        title: t('adminUserManagement.restoreAction'),
        impact: t('adminUserManagement.restoreConfirm', { name }),
        phrase: t('adminUserManagement.confirmPhrases.restore'),
        label: t('adminUserManagement.restoreAction'),
      };
    }
    return {
      title: t('adminUserManagement.editTitle'),
      impact: t('adminUserManagement.editImpact', { name, id: record.id || '-' }),
      phrase: t('adminUserManagement.confirmPhrases.edit'),
      label: t('common.save'),
    };
  });

  const formFields: BaseFormItem[] = [
    { label: t('adminUserManagement.detail.alias'), name: 'alias' },
    { label: t('adminUserManagement.email'), name: 'email' },
    { label: t('adminUserManagement.role'), name: 'role', render: formRenders.roleSelector() },
  ];

  function openDetail(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
  }

  function openRemarkEditor(record: any) {
    remarkUser.value = record;
    remarkVisible.value = true;
  }

  function openGrowthAdmin(record: any) {
    growthAdminUser.value = { id: record.id, alias: adminUserLabel(record) };
    growthAdminVisible.value = true;
  }

  function editUser(record: any) {
    editData.value = { ...record };
    editVisible.value = true;
  }

  function openPreview(record: any, mode: 'readonly' | 'maintain') {
    if (!record?.id) {
      message.warning(t('guest.adminContextMissingUser'));
      return;
    }
    previewUser.value = record;
    previewMode.value = mode;
    previewVisible.value = true;
  }

  function maintainAsUser(record: any) {
    if (!record?.id) {
      message.warning(t('guest.adminContextMissingUser'));
      return;
    }
    Alert.alert({
      title: t('guest.adminContextMaintainConfirmTitle'),
      content: t('guest.adminContextMaintainConfirm', { name: adminUserLabel(record) }),
      onOk: () => openPreview(record, 'maintain'),
    });
  }

  function disableUser(record: any) {
    riskUser.value = record;
    riskKind.value = 'disable';
    riskVisible.value = true;
  }

  function restoreUser(record: any) {
    riskUser.value = record;
    riskKind.value = 'restore';
    riskVisible.value = true;
  }

  function onRemarkSaved(payload: { targetUserId: string; adminRemark: string }) {
    const record = items.value.find((item) => item.id === payload.targetUserId);
    if (record) record.adminRemark = payload.adminRemark;
    if (selectedRecord.value?.id === payload.targetUserId) selectedRecord.value.adminRemark = payload.adminRemark;
    void reloadUsers({ silent: true });
  }

  function openEditConfirmation() {
    const record = editData.value || {};
    if (!record.id || !String(record.alias || '').trim() || !String(record.email || '').trim()) {
      message.warning(t('adminUserManagement.validationRequired'));
      return;
    }
    riskUser.value = record;
    riskKind.value = 'edit';
    riskVisible.value = true;
  }

  async function confirmRiskAction(action: AdminUserRiskPayload) {
    const record = riskUser.value || {};
    if (!record.id) return;
    const currentKind = riskKind.value;
    riskLoading.value = true;
    try {
      const response =
        currentKind === 'edit'
          ? await userApi.updateAdminUser({
              userId: record.id,
              alias: String(record.alias || '').trim(),
              email: String(record.email || '').trim(),
              role: String(record.role || ''),
              ...action,
            })
          : currentKind === 'restore'
            ? await userApi.restoreAdminUser(record.id, action)
            : await userApi.disableAdminUser(record.id, action);
      if (response.status !== 200) return;
      riskVisible.value = false;
      if (currentKind === 'edit') editVisible.value = false;
      const receipt = createAdminUserActionReceipt(currentKind, response.data, t);
      if (receipt.tone === 'warning') message.warning(receipt.content, 8);
      else message.success(receipt.content, 8);
      riskUser.value = null;
      await reloadUsers();
    } finally {
      riskLoading.value = false;
    }
  }

  return {
    editData,
    editVisible,
    previewVisible,
    previewUser,
    previewMode,
    selectedRecord,
    detailVisible,
    remarkVisible,
    remarkUser,
    growthAdminVisible,
    growthAdminUser,
    riskVisible,
    riskLoading,
    riskKind,
    riskConfig,
    formFields,
    openDetail,
    openRemarkEditor,
    openGrowthAdmin,
    editUser,
    openPreview,
    maintainAsUser,
    disableUser,
    restoreUser,
    onRemarkSaved,
    openEditConfirmation,
    confirmRiskAction,
  };
}
