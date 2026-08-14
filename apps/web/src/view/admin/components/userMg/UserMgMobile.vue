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
                <span
                  class="mobile-user-avatar"
                  :class="{ 'is-framed': frameVariant(record.equippedFrame) }"
                  aria-hidden="true"
                >
                  <AvatarFramePreview
                    v-if="frameVariant(record.equippedFrame)"
                    :frame-id="record.equippedFrame"
                    :src="record.headPicture || icon.navigation.user"
                    :size="30"
                    pause-when-offscreen
                  />
                  <SvgIcon v-else :src="record.headPicture || icon.navigation.user" size="36" />
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
                <span class="mobile-user-meta">
                  <span>{{ formatAdminUserAgent(record.userAgent, '-').browser }}</span>
                  <span>{{ t('adminUserManagement.levelShort', { level: record.level || 1 }) }}</span>
                  <span>{{
                    t('adminUserManagement.mobile.lastActive', { time: formatTime(record.lastActiveTime) })
                  }}</span>
                </span>
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
      @ok="openEditConfirmation"
    >
      <BForm form-id="userEditForm" :form-data="editData" :fields="formFields" />
    </BModal>
    <UserPreviewModal v-model:visible="previewVisible" :user-info="previewUser" :mode="previewMode" />
    <User360Modal
      v-model:visible="detailVisible"
      :user-info="selectedRecord"
      @preview="(record) => openPreview(record, 'readonly')"
    />
    <AdminUserRemarkModal v-model:visible="remarkVisible" :user="remarkUser" @saved="onRemarkSaved" />
    <GrowthAdminModal
      v-model:visible="growthAdminVisible"
      :user-id="growthAdminUser.id"
      :user-name="growthAdminUser.alias"
    />
    <AdminRiskActionModal
      v-model:visible="riskVisible"
      :title="riskConfig.title"
      :impact="riskConfig.impact"
      :confirm-phrase="riskConfig.phrase"
      :confirm-label="riskConfig.label"
      :loading="riskLoading"
      @confirm="confirmRiskAction"
    />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import { frameVariant } from '@/config/growthFrames.ts';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import BForm from '@/components/base/BasicComponents/BForm/BForm.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import GrowthAdminModal from '@/components/growth/GrowthAdminModal.vue';
  import router from '@/router';
  import UserPreviewModal from '@/view/admin/components/userMg/UserPreviewModal.vue';
  import User360Modal from '@/view/admin/components/userMg/User360Modal.vue';
  import AdminUserRemarkModal from '@/view/admin/components/userMg/AdminUserRemarkModal.vue';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory.ts';
  import { adminUserLabel, useAdminUserManagementList, useAdminUserOperations } from './useAdminUserManagement.ts';
  import { formatAdminUserAgent } from './userAgentFormat.ts';

  const { t, locale } = useI18n();
  const listRef = ref<InstanceType<typeof BVirtualList> | null>(null);
  const {
    items: userList,
    total,
    loading,
    hasMore,
    loadMore,
    searchValue,
    roleFilter,
    statusFilter,
    activityFilter,
    sortFilter,
    roleOptions,
    statusOptions,
    activityOptions,
    sortOptions,
    hasActiveFilters,
    handleSearch,
    reloadForFilter,
    reloadUsers,
    resetFilters,
  } = useAdminUserManagementList({
    t,
    limit: 30,
    scrollToTop: () => listRef.value?.scrollToTop(),
  });
  const {
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
  } = useAdminUserOperations({ t, items: userList, reloadUsers });
  const actionsOpen = ref(false);
  const actionUser = ref<any>(null);

  const mobileActions = computed<MobilePageActionItem[]>(() => [
    { key: 'detail', label: t('adminUserManagement.mobile.viewDetail'), icon: icon.navigation.user },
    { key: 'remark', label: t('adminUserManagement.remarkAction'), icon: icon.table_edit },
    { key: 'preview', label: t('guest.userPreviewEntry'), icon: icon.navigation.portal },
    { key: 'maintain', label: t('guest.adminContextMaintainEntry'), icon: icon.user_admin },
    { key: 'growth', label: t('adminUserManagement.growthAction'), icon: icon.userCenter.growth },
    { key: 'edit', label: t('common.edit'), icon: icon.table_edit },
    Number(actionUser.value?.delFlag) === 1
      ? {
          key: 'restore',
          label: t('adminUserManagement.restoreAction'),
          icon: icon.contextMenu.inbox,
          dividerBefore: true,
        }
      : {
          key: 'disable',
          label: t('adminUserManagement.disableAction'),
          icon: icon.table_delete,
          danger: true,
          dividerBefore: true,
        },
  ]);

  const userLabel = adminUserLabel;

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

  function openActions(record: any) {
    actionUser.value = record;
    actionsOpen.value = true;
  }

  async function handleMobileAction(action: MobilePageActionItem) {
    const record = actionUser.value;
    if (!record) return;
    await closeCurrentMobileOverlayThen(
      () => (actionsOpen.value = false),
      async () => {
        if (action.key === 'detail') openDetail(record);
        else if (action.key === 'remark') openRemarkEditor(record);
        else if (action.key === 'preview') openPreview(record, 'readonly');
        else if (action.key === 'maintain') maintainAsUser(record);
        else if (action.key === 'growth') openGrowthAdmin(record);
        else if (action.key === 'edit') editUser(record);
        else if (action.key === 'disable') disableUser(record);
        else if (action.key === 'restore') restoreUser(record);
      },
    );
  }
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

  .mobile-user-virtual-list :deep(.mobile-list-row__leading) {
    width: 44px;
    flex-basis: 44px;
  }

  .mobile-user-subtitle-line {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-user-meta {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
  }

  .mobile-user-meta > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-user-meta > span:not(:last-child)::after {
    content: '·';
    margin-left: 5px;
    color: var(--surface-divider-color);
  }

  .mobile-user-avatar {
    width: 36px;
    min-width: 36px;
    max-width: 36px;
    height: 36px;
    min-height: 36px;
    max-height: 36px;
    flex: 0 0 36px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--workspace-panel-bg-color);
    color: var(--primary-color);
  }

  .mobile-user-avatar.is-framed {
    overflow: visible;
    border-color: transparent;
    background: transparent;
  }

  .mobile-user-avatar:not(.is-framed) {
    overflow: hidden;
  }

  .mobile-user-avatar:not(.is-framed) :deep(img),
  .mobile-user-avatar:not(.is-framed) :deep(.icon-base64),
  .mobile-user-avatar:not(.is-framed) :deep(.icon-fixed-base64) {
    width: 100% !important;
    height: 100% !important;
    display: block;
    border-radius: inherit;
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
