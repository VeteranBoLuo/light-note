<template>
  <AdminDataPage
    eyebrow="Admin / Users"
    :title="t('adminUserManagement.title')"
    :subtitle="t('adminUserManagement.subtitle')"
    :toolbar-hint="t('adminUserManagement.toolbarHint')"
    :summary-count="total"
  >
    <template #toolbar>
      <b-input
        v-model:value="searchValue"
        :placeholder="t('adminUserManagement.searchPlaceholder')"
        class="log-search-input"
        @input="handleSearch"
      >
        <template #prefix>
          <svg-icon :src="icon.navigation.search" size="16" />
        </template>
      </b-input>
      <BSelect
        v-model:value="roleFilter"
        class="usermg-filter"
        :options="roleOptions"
        :aria-label="t('adminUserManagement.filters.role')"
        @change="() => resetList()"
      />
      <BSelect
        v-model:value="statusFilter"
        class="usermg-filter"
        :options="statusOptions"
        :aria-label="t('adminUserManagement.filters.status')"
        @change="() => resetList()"
      />
      <BSelect
        v-model:value="activityFilter"
        class="usermg-filter usermg-filter--activity"
        :options="activityOptions"
        :aria-label="t('adminUserManagement.filters.activity')"
        @change="() => resetList()"
      />
    </template>

    <BTable
      ref="tableRef"
      fill
      virtual
      :data="userList"
      :columns="userColumns"
      :row-clickable="true"
      :loading="loading"
      :has-more="hasMore"
      :remote-sort="true"
      :row-height="48"
      :sort="sortState"
      @load-more="loadMore"
      @sort-change="onSortChange"
      @row-click="onRowClick"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'headPicture'">
          <span class="usermg-avatar" :class="{ 'is-framed': frameVariant(record.equippedFrame) }" aria-hidden="true">
            <AvatarFramePreview
              v-if="frameVariant(record.equippedFrame)"
              :frame-id="record.equippedFrame"
              :src="record.headPicture || icon.navigation.user"
              :size="30"
              pause-when-offscreen
            />
            <svg-icon v-else :src="record.headPicture || icon.navigation.user" :size="36" />
          </span>
        </template>
        <template v-else-if="column.key === 'adminRemark'">
          <span class="usermg-remark" :class="{ 'is-empty': !record.adminRemark }">
            {{ record.adminRemark || '-' }}
          </span>
        </template>
        <template v-else-if="column.key === 'operation'">
          <!--
            五个操作平铺时这一列又挤又难扫。只把最常用的「预览用户」留在外面
            （日常查账号基本都走这个），编辑、维护模式、成长运营与删除收进
            「更多」，删除放最后并标危险色，顺带降低误点概率。
          -->
          <BSpace>
            <!-- 行本身可点击（打开用户详情），所以每个操作入口都要 @click.stop -->
            <BTooltip :title="t('guest.userPreviewEntry')">
              <BButton
                class="usermg-icon-btn dom-hover"
                :aria-label="`${t('guest.userPreviewEntry')}：${record.alias || record.email || record.id}`"
                @click.stop="loginAsUser(record)"
              >
                <svg-icon :src="icon.navigation.user" size="16" />
              </BButton>
            </BTooltip>
            <!--
              整个下拉外面包一层 @click.stop：不能把 .stop 加在触发按钮上 ——
              那样 BDropdown 收不到冒泡上来的 click，菜单根本展不开。
            -->
            <span class="usermg-more" @click.stop>
              <BDropdown trigger="click" align="right" :menu-options="moreOptions(record)">
                <BTooltip :title="t('common.more')">
                  <BButton
                    class="usermg-icon-btn dom-hover"
                    :aria-label="`${t('common.more')}：${record.alias || record.email || record.id}`"
                  >
                    <svg-icon :src="icon.common.more" size="16" />
                  </BButton>
                </BTooltip>
              </BDropdown>
            </span>
          </BSpace>
        </template>
      </template>
    </BTable>
  </AdminDataPage>

  <User360Modal v-model:visible="detailVisible" :user-info="selectedRecord" />

  <BModal
    v-if="editVisible"
    :title="t('adminUserManagement.editTitle')"
    width="600px"
    v-model:visible="editVisible"
    @close="editVisible = false"
    @ok="openEditConfirmation"
  >
    <div>
      <BForm form-id="userEditForm" :form-data="editData" :fields="formFields" />
    </div>
  </BModal>

  <UserPreviewModal v-model:visible="previewVisible" :user-info="previewUser" :mode="previewMode" />
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
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import { frameVariant } from '@/config/growthFrames.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BForm from '@/components/base/BasicComponents/BForm/BForm.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import UserPreviewModal from '@/view/admin/components/userMg/UserPreviewModal.vue';
  import User360Modal from '@/view/admin/components/userMg/User360Modal.vue';
  import AdminUserRemarkModal from '@/view/admin/components/userMg/AdminUserRemarkModal.vue';
  import GrowthAdminModal from '@/components/growth/GrowthAdminModal.vue';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import { useAdminUserManagementList, useAdminUserOperations } from './useAdminUserManagement.ts';

  const { t } = useI18n();
  const tableRef = ref<InstanceType<typeof BTable> | null>(null);
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
    sortState,
    roleOptions,
    statusOptions,
    activityOptions,
    handleSearch,
    reloadUsers,
    onSortChange,
  } = useAdminUserManagementList({ t, scrollToTop: () => tableRef.value?.scrollToTop() });
  const resetList = reloadUsers;
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

  const userColumns = computed(() => [
    { title: t('adminUserManagement.columns.avatar'), key: 'headPicture', width: '60px', overflowVisible: true },
    { title: t('adminUserManagement.columns.alias'), key: 'alias', width: '150px' },
    { title: t('adminUserManagement.remarkColumn'), key: 'adminRemark', width: '150px' },
    { title: t('adminUserManagement.email'), key: 'email', width: '1fr' },
    { title: 'IP', key: 'ip', width: '150px' },
    {
      title: t('adminUserManagement.columns.lastActive'),
      key: 'lastActiveTime',
      width: '1fr',
      sortable: true,
    },
    { title: t('adminUserManagement.columns.createdAt'), key: 'createTime', width: '1fr', sortable: true },
    { title: t('adminUserManagement.columns.actions'), key: 'operation', width: '100px' },
  ]);

  function onRowClick(record: any) {
    openDetail(record);
  }

  function loginAsUser(record: any) {
    openPreview(record, 'readonly');
  }

  const moreOptions = (record: any) => [
    {
      key: 'remark',
      label: t('adminUserManagement.remarkAction'),
      icon: icon.table_edit,
      function: () => openRemarkEditor(record),
    },
    { key: 'edit', label: t('common.edit'), icon: icon.table_edit, function: () => editUser(record) },
    {
      key: 'maintain',
      label: t('guest.adminContextMaintainEntry'),
      icon: icon.userCenter.settingsGear,
      function: () => maintainAsUser(record),
    },
    {
      key: 'growth',
      label: t('adminUserManagement.growthAction'),
      icon: icon.userCenter.growth,
      function: () => openGrowthAdmin(record),
    },
    { divider: true },
    Number(record.delFlag) === 1
      ? {
          key: 'restore',
          label: t('adminUserManagement.restoreAction'),
          icon: icon.contextMenu.inbox,
          function: () => restoreUser(record),
        }
      : {
          key: 'disable',
          label: t('adminUserManagement.disableAction'),
          icon: icon.table_delete,
          danger: true,
          function: () => disableUser(record),
        },
  ];
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-mixins.less';
  .log-search-input {
    flex: 1;
  }

  .usermg-filter {
    width: 132px;
    flex: 0 0 132px;
  }

  .usermg-filter--activity {
    width: 168px;
    flex-basis: 168px;
  }

  .user-detail__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 20px;
  }

  .user-detail__grid label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: var(--desc-color);
  }

  .user-detail__grid p {
    margin: 0;
    color: var(--text-color);
  }

  .usermg-remark {
    display: block;
    overflow: hidden;
    color: var(--text-color);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-empty {
      color: var(--desc-color);
      font-weight: 400;
    }
  }

  .usermg-avatar {
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
    overflow: visible;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--workspace-panel-bg-color);
    vertical-align: middle;
  }

  .usermg-avatar:not(.is-framed) {
    overflow: hidden;
  }

  .usermg-avatar.is-framed {
    border-color: transparent;
    background: transparent;
  }

  .usermg-avatar:not(.is-framed) :deep(img),
  .usermg-avatar:not(.is-framed) :deep(.icon-base64),
  .usermg-avatar:not(.is-framed) :deep(.icon-fixed-base64) {
    width: 100% !important;
    height: 100% !important;
    display: block;
    border-radius: inherit;
    object-fit: cover;
  }

  /* 图标形态的操作按钮：重置浏览器默认外观，保持原来「一个图标」的观感 */
  .usermg-icon-btn {
    .admin-focus-ring(6px);

    display: inline-flex;
    align-items: center;
    padding: 2px;
    border: none;
    border-radius: 6px;
    background: none;
    color: inherit;
    cursor: pointer;
  }
</style>
