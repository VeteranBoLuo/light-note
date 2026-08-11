<template>
  <CommonContainer :title="t('adminUserManagement.title')" @backClick="router.push('/admin')">
    <div class="mobile-user-page">
      <section class="mobile-user-filters" :aria-label="t('adminUserManagement.filters.status')">
        <BInput
          v-model:value="searchValue"
          :placeholder="t('adminUserManagement.searchPlaceholder')"
          @input="handleSearch"
        >
          <template #prefix><SvgIcon :src="icon.navigation.search" size="16" /></template>
        </BInput>
        <div class="mobile-user-filters__grid">
          <BSelect
            v-model:value="roleFilter"
            :options="roleOptions"
            :aria-label="t('adminUserManagement.filters.role')"
            @change="reloadForFilter"
          />
          <BSelect
            v-model:value="statusFilter"
            :options="statusOptions"
            :aria-label="t('adminUserManagement.filters.status')"
            @change="reloadForFilter"
          />
          <BSelect
            v-model:value="activityFilter"
            :options="activityOptions"
            :aria-label="t('adminUserManagement.filters.activity')"
            @change="reloadForFilter"
          />
          <BSelect
            v-model:value="sortFilter"
            :options="sortOptions"
            :aria-label="t('adminUserManagement.filters.sort')"
            @change="reloadForFilter"
          />
        </div>
        <div class="mobile-user-filters__summary">
          <span>{{ t('adminUserManagement.mobile.resultCount', { count: total }) }}</span>
          <BButton size="small" :disabled="!hasActiveFilters" @click="resetFilters">
            {{ t('adminUserManagement.filters.reset') }}
          </BButton>
        </div>
      </section>

      <div class="mobile-user-results">
        <BLoading v-if="loading && !userList.length" inline loading :title="t('common.loading')" />
        <BVirtualList
          v-else-if="userList.length"
          ref="listRef"
          class="mobile-user-virtual-list"
          role="list"
          :aria-label="t('adminUserManagement.mobile.listAria')"
          :items="userList"
          item-key="id"
          :item-height="112"
          :overscan="5"
          :loading="loading"
          :loading-text="t('common.loading')"
          :has-more="hasMore"
          @load-more="loadMore"
        >
          <template #default="{ item: record }">
            <MobileListRow complex>
              <template #leading>
                <span class="mobile-user-avatar">
                  <SvgIcon :src="record.headPicture || icon.navigation.user" size="30" />
                </span>
              </template>
              <template #title>
                <span class="mobile-user-heading">
                  <span>{{ record.adminRemark || record.alias || record.email || '-' }}</span>
                  <BChip :tone="Number(record.delFlag) === 1 ? 'danger' : 'success'">
                    {{
                      Number(record.delFlag) === 1
                        ? t('adminUserManagement.detail.statusBanned')
                        : t('adminUserManagement.detail.statusActive')
                    }}
                  </BChip>
                </span>
              </template>
              <template #subtitle>
                <span class="mobile-user-subtitle-line">{{ record.email || '-' }}</span>
                <span class="mobile-user-subtitle-line">
                  {{
                    t('adminUserManagement.mobile.resourceSummary', {
                      bookmarks: record.bookmarkTotal || 0,
                      notes: record.noteTotal || 0,
                      storage: formatStorage(record.storageUsed),
                    })
                  }}
                </span>
              </template>
              <template #meta>
                <span>{{ t('adminUserManagement.mobile.lastActive', { time: formatTime(record.lastActiveTime) }) }}</span>
              </template>
              <template #trailing>
                <BButton
                  class="mobile-user-more"
                  :aria-label="t('adminUserManagement.mobile.actionsFor', { name: userLabel(record) })"
                  @click="openActions(record)"
                >
                  <SvgIcon :src="icon.common.more" size="18" />
                </BButton>
              </template>
            </MobileListRow>
          </template>
        </BVirtualList>
        <p v-else-if="!loading" class="mobile-user-empty">{{ t('adminUserManagement.mobile.empty') }}</p>
      </div>
    </div>

    <MobilePageActionsDrawer
      v-model:open="actionsOpen"
      :object-title="t('adminUserManagement.mobile.actionsFor', { name: userLabel(actionUser) })"
      :actions="mobileActions"
      @action="handleMobileAction"
    />

    <BModal
      v-if="editVisible"
      v-model:visible="editVisible"
      :title="t('adminUserManagement.editTitle')"
      width="90%"
      fullscreen-mobile
      @close="editVisible = false"
      @ok="saveUserInfo"
    >
      <BForm form-id="userEditForm" :form-data="editData" :fields="formFields" />
    </BModal>
    <UserPreviewModal v-model:visible="previewVisible" :user-info="previewUser" :mode="previewMode" />
    <User360Modal v-model:visible="detailVisible" :user-info="selectedRecord" />
    <AdminUserRemarkModal v-model:visible="remarkVisible" :user="remarkUser" @saved="onRemarkSaved" />
    <GrowthAdminModal
      v-model:visible="growthAdminVisible"
      :user-id="growthAdminUser.id"
      :user-name="growthAdminUser.alias"
    />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiQueryPost } from '@/http/request.ts';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import BForm from '@/components/base/BasicComponents/BForm/BForm.vue';
  import { type BaseFormItem } from '@/config/formConfig.ts';
  import formRenders from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import userApi from '@/api/userApi.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import GrowthAdminModal from '@/components/growth/GrowthAdminModal.vue';
  import router from '@/router';
  import UserPreviewModal from '@/view/admin/components/userMg/UserPreviewModal.vue';
  import User360Modal from '@/view/admin/components/userMg/User360Modal.vue';
  import AdminUserRemarkModal from '@/view/admin/components/userMg/AdminUserRemarkModal.vue';
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory.ts';

  const { t, locale } = useI18n();
  const searchValue = ref('');
  const roleFilter = ref('');
  const statusFilter = ref('active');
  const activityFilter = ref('all');
  const sortFilter = ref('recentlyActive');
  const listRef = ref<InstanceType<typeof BVirtualList> | null>(null);
  let searchTimer: number | null = null;

  const roleOptions = computed(() => [
    { label: t('adminUserManagement.filters.allRoles'), value: '' },
    { label: t('adminUserManagement.detail.roles.user'), value: 'user' },
    { label: t('adminUserManagement.detail.roles.visitor'), value: 'visitor' },
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
  const hasActiveFilters = computed(
    () =>
      Boolean(searchValue.value || roleFilter.value) ||
      statusFilter.value !== 'active' ||
      activityFilter.value !== 'all' ||
      sortFilter.value !== 'recentlyActive',
  );
  const requestSort = computed(() => {
    if (sortFilter.value === 'newest') return { field: 'createTime', order: 'desc' };
    if (sortFilter.value === 'oldest') return { field: 'createTime', order: 'asc' };
    if (sortFilter.value === 'leastRecentlyActive') return { field: 'lastActiveTime', order: 'asc' };
    return { field: 'lastActiveTime', order: 'desc' };
  });
  const {
    items: userList,
    total,
    loading,
    hasMore,
    loadMore,
    reload,
  } = useAdminCursorList<any>({
    limit: 30,
    request: (cursor, limit) =>
      apiQueryPost('/api/user/getUserList', {
        cursor,
        limit,
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

  const editData = ref<any>();
  const editVisible = ref(false);
  const previewVisible = ref(false);
  const previewUser = ref<any>(null);
  const previewMode = ref<'readonly' | 'maintain'>('readonly');
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);
  const remarkVisible = ref(false);
  const remarkUser = ref<any>(null);
  const actionsOpen = ref(false);
  const actionUser = ref<any>(null);
  const growthAdminVisible = ref(false);
  const growthAdminUser = ref<{ id: string; alias: string }>({ id: '', alias: '' });

  const mobileActions = computed<MobilePageActionItem[]>(() => [
    { key: 'detail', label: t('adminUserManagement.mobile.viewDetail'), icon: icon.navigation.user },
    { key: 'remark', label: t('adminUserManagement.remarkAction'), icon: icon.table_edit },
    { key: 'preview', label: t('guest.userPreviewEntry'), icon: icon.navigation.portal },
    { key: 'maintain', label: t('guest.adminContextMaintainEntry'), icon: icon.user_admin },
    { key: 'growth', label: t('adminUserManagement.growthAction'), icon: icon.userCenter.growth },
    { key: 'edit', label: t('common.edit'), icon: icon.table_edit },
    { key: 'delete', label: t('common.delete'), icon: icon.table_delete, danger: true, dividerBefore: true },
  ]);

  function userLabel(record: any) {
    return record?.adminRemark || record?.alias || record?.email || record?.id || '-';
  }

  function formatStorage(value: unknown) {
    return `${Number(value || 0).toLocaleString(locale.value === 'en-US' ? 'en-US' : 'zh-CN', {
      maximumFractionDigits: 2,
    })} MB`;
  }

  function formatTime(value: unknown) {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(locale.value === 'en-US' ? 'en-US' : 'zh-CN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  }

  function handleSearch() {
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void reloadUsers({ silent: true }), 500);
  }

  function reloadForFilter() {
    void reloadUsers();
  }

  function resetFilters() {
    searchValue.value = '';
    roleFilter.value = '';
    statusFilter.value = 'active';
    activityFilter.value = 'all';
    sortFilter.value = 'recentlyActive';
    void reloadUsers();
  }

  function openActions(record: any) {
    actionUser.value = record;
    actionsOpen.value = true;
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
    const name = userLabel(record);
    Alert.alert({
      title: t('guest.adminContextMaintainConfirmTitle'),
      content: t('guest.adminContextMaintainConfirm', { name }),
      onOk: () => openPreview(record, 'maintain'),
    });
  }

  function delUser(record: any) {
    Alert.alert({
      title: t('common.tips'),
      content: t('adminUserManagement.deleteConfirm', { name: userLabel(record) }),
      onOk() {
        userApi.deleteUserById(record.id).then((response) => {
          if (response.status === 200) {
            message.success(t('adminUserManagement.deleteSuccess'));
            void reloadUsers();
          }
        });
      },
    });
  }

  async function handleMobileAction(action: MobilePageActionItem) {
    const record = actionUser.value;
    if (!record) return;
    await closeCurrentMobileOverlayThen(
      () => (actionsOpen.value = false),
      async () => {
        if (action.key === 'detail') {
          selectedRecord.value = record;
          detailVisible.value = true;
        } else if (action.key === 'remark') {
          remarkUser.value = record;
          remarkVisible.value = true;
        } else if (action.key === 'preview') {
          openPreview(record, 'readonly');
        } else if (action.key === 'maintain') {
          maintainAsUser(record);
        } else if (action.key === 'growth') {
          growthAdminUser.value = { id: record.id, alias: userLabel(record) };
          growthAdminVisible.value = true;
        } else if (action.key === 'edit') {
          editData.value = record;
          editVisible.value = true;
        } else if (action.key === 'delete') {
          delUser(record);
        }
      },
    );
  }

  function onRemarkSaved(payload: { targetUserId: string; adminRemark: string }) {
    const record = userList.value.find((item) => item.id === payload.targetUserId);
    if (record) record.adminRemark = payload.adminRemark;
    if (selectedRecord.value?.id === payload.targetUserId) selectedRecord.value.adminRemark = payload.adminRemark;
    void reloadUsers({ silent: true });
  }

  const formFields: BaseFormItem[] = [
    { label: t('adminUserManagement.detail.alias'), name: 'alias' },
    { label: t('adminUserManagement.email'), name: 'email' },
    { label: t('adminUserManagement.role'), name: 'role', render: formRenders.roleSelector() },
  ];

  function saveUserInfo() {
    const record = editData.value || {};
    userApi
      .updateUserInfo({ id: record.id, alias: record.alias, email: record.email, role: record.role })
      .then((response) => {
        if (response.status === 200) {
          message.success(t('adminUserManagement.saveSuccess'));
          editVisible.value = false;
          void reloadUsers();
        }
      });
  }

  function reloadUsers(options: { silent?: boolean } = {}) {
    listRef.value?.scrollToTop();
    return reload(options);
  }

  onMounted(() => void reloadUsers());
  onBeforeUnmount(() => {
    if (searchTimer !== null) window.clearTimeout(searchTimer);
  });
</script>

<style lang="less" scoped>
  :deep(.phone-body) {
    overflow: hidden;
  }

  .mobile-user-page {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .mobile-user-filters {
    display: grid;
    gap: 9px;
    flex: 0 0 auto;
  }

  .mobile-user-filters__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .mobile-user-filters__summary {
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .mobile-user-results {
    min-height: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    overflow: hidden;
  }

  .mobile-user-virtual-list {
    flex: 1 1 auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }

  .mobile-user-virtual-list :deep(.b-virtual-list__item + .b-virtual-list__item) {
    border-top: 1px solid var(--surface-divider-color);
  }

  .mobile-user-virtual-list :deep(.mobile-list-row) {
    height: 100%;
    min-height: 0;
  }

  .mobile-user-subtitle-line {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-user-avatar {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--workspace-panel-bg-color);
    color: var(--primary-color);
  }

  .mobile-user-avatar :deep(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mobile-user-heading {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mobile-user-heading > span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-user-more.b_btn {
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
    color: var(--text-color);
  }

  .mobile-user-empty {
    margin: 22px 0;
    color: var(--desc-color);
    text-align: center;
    font-size: 13px;
  }

  @media (max-width: 359px) {
    .mobile-user-filters__grid {
      grid-template-columns: 1fr;
    }
  }
</style>
