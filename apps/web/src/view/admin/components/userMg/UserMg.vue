<template>
  <AdminDataPage
    class="usermg-page"
    appearance="workspace"
    :eyebrow="`ADMIN / ${t('adminUserManagement.title')}`"
    :title="t('adminUserManagement.title')"
    :subtitle="t('adminWorkspace.usersSubtitle')"
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
        :placeholder="t('adminUserManagement.filters.allRoles')"
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
      <BButton type="text" @click="resetFilters">{{ t('adminUserManagement.filters.reset') }}</BButton>
    </template>
    <template #summary
      ><span>{{ t('adminWorkspace.userCount', { count: total.toLocaleString() }) }}</span
      ><span>{{ t('adminWorkspace.userHint') }}</span></template
    >

    <BTable
      v-if="userList.length || loading"
      ref="tableRef"
      fill
      virtual
      :data="userList"
      :columns="userColumns"
      :row-clickable="true"
      :loading="loading"
      :has-more="hasMore && !failed"
      :remote-sort="true"
      :row-height="48"
      :sort="sortState"
      @load-more="loadMore"
      @sort-change="onSortChange"
      @row-click="onRowClick"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'headPicture'">
          <span class="usermg-avatar-cell">
            <span class="usermg-avatar" :class="{ 'is-framed': frameVariant(record.equippedFrame) }" aria-hidden="true">
              <AvatarFramePreview
                v-if="frameVariant(record.equippedFrame)"
                :frame-id="record.equippedFrame"
                :src="record.headPicture || icon.navigation.user"
                :size="dimension(30, 'icon')"
                layout-mode="slot"
                pause-when-offscreen
              />
              <svg-icon v-else :src="record.headPicture || icon.navigation.user" :size="36" />
            </span>
            <span class="usermg-identity"
              ><strong :title="record.alias || record.email">{{ record.alias || record.email || '—' }}</strong
              ><span
                ><small
                  >{{ t('adminUserManagement.levelShort', { level: record.level || 1 }) }} ·
                  {{ userRoleLabel(record.role) }}</small
                ><BChip :tone="Number(record.delFlag) === 1 ? 'danger' : 'success'">{{
                  t(
                    Number(record.delFlag) === 1
                      ? 'adminUserManagement.detail.statusBanned'
                      : 'adminUserManagement.detail.statusActive',
                  )
                }}</BChip></span
              ></span
            >
          </span>
        </template>
        <template v-else-if="column.key === 'browser'">
          <BTooltip :title="formatAdminDeviceLabel(record.userAgent, t('common.unknown'))">
            <span class="usermg-browser">{{
              formatAdminUserAgent(record.userAgent, '-').browser.replace(/\s[\d.]+$/, '')
            }}</span>
          </BTooltip>
        </template>
        <template v-else-if="column.key === 'adminRemark'">
          <span class="usermg-remark" :class="{ 'is-empty': !record.adminRemark }">
            {{ record.adminRemark || '-' }}
          </span>
        </template>
        <template v-else-if="column.key === 'lastActiveTime' || column.key === 'createTime'">
          <span v-if="record[column.key]" class="usermg-time"
            ><span>{{ userDate(record[column.key]) }}</span
            ><small>{{ userTime(record[column.key]) }}</small></span
          ><span v-else>—</span>
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
                class="usermg-preview-btn"
                type="text"
                size="small"
                :aria-label="`${t('guest.userPreviewEntry')}：${record.alias || record.email || record.id}`"
                :loading="previewOpeningUserId === String(record.id)"
                :disabled="Boolean(previewOpeningUserId)"
                @click.stop="loginAsUser(record)"
              >
                <svg-icon :src="icon.garden.view" size="16" />{{ t('adminWorkspace.preview') }}
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
                    class="usermg-icon-btn"
                    icon-only
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
    <div v-else class="usermg-empty" :role="failed ? 'alert' : 'status'">
      <p>{{ failed ? t('common.requestFailedDescription') : t('adminWorkspace.emptyUsers') }}</p
      ><BButton v-if="failed" size="small" @click="reloadUsers()">{{ t('common.retry') }}</BButton>
    </div>
    <div v-if="userList.length" class="usermg-footer"
      ><span>{{ userList.length.toLocaleString() }} / {{ total.toLocaleString() }}</span
      ><BButton v-if="failed" size="small" @click="loadMore">{{ t('common.retry') }}</BButton
      ><span v-else-if="!hasMore">{{ t('adminWorkspace.noMore') }}</span></div
    >
  </AdminDataPage>

  <User360Modal
    v-model:visible="detailVisible"
    :user-info="selectedRecord"
    @preview="(record) => openPreview(record, 'readonly')"
  />

  <BModal
    v-if="editVisible"
    :title="t('adminUserManagement.editTitle')"
    width="var(--ui-layout-600, 600px)"
    v-model:visible="editVisible"
    @close="editVisible = false"
    @ok="openEditConfirmation"
  >
    <div>
      <BForm form-id="userEditForm" :form-data="editData" :fields="formFields" />
    </div>
  </BModal>

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
  import { parseAdminDateTime, ADMIN_DEFAULT_TIME_ZONE } from '@/utils/adminDateTime';
  import { adminWorkspaceMessages } from '@/i18n/locales/adminWorkspace';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import { useUiDensity } from '@/composables/useUiDensity';
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
  import User360Modal from '@/view/admin/components/userMg/User360Modal.vue';
  import AdminUserRemarkModal from '@/view/admin/components/userMg/AdminUserRemarkModal.vue';
  import GrowthAdminModal from '@/components/growth/GrowthAdminModal.vue';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import { useAdminUserManagementList, useAdminUserOperations } from './useAdminUserManagement.ts';
  import { formatAdminDeviceLabel, formatAdminUserAgent } from './userAgentFormat.ts';

  const { t, locale } = useI18n({ messages: adminWorkspaceMessages, missingWarn: false, fallbackWarn: false });
  const { dimension } = useUiDensity();
  const tableRef = ref<InstanceType<typeof BTable> | null>(null);
  const {
    items: userList,
    total,
    loading,
    hasMore,
    failed,
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
    resetFilters,
    onSortChange,
  } = useAdminUserManagementList({ t, scrollToTop: () => tableRef.value?.scrollToTop() });
  const resetList = reloadUsers;
  const {
    editData,
    editVisible,
    previewOpeningUserId,
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
    {
      title: t('adminOperationLog.columns.user'),
      key: 'headPicture',
      width: 'var(--ui-layout-200, 200px)',
      overflowVisible: true,
    },
    { title: t('adminUserManagement.remarkColumn'), key: 'adminRemark', width: 'var(--ui-layout-100, 100px)' },
    { title: t('adminUserManagement.email'), key: 'email', width: 'minmax(var(--ui-layout-180, 180px), 1fr)' },
    { title: 'IP', key: 'ip', width: 'var(--ui-layout-125, 125px)' },
    { title: t('adminUserManagement.columns.browser'), key: 'browser', width: 'var(--ui-layout-88, 88px)' },
    {
      title: t('adminUserManagement.columns.lastActive'),
      key: 'lastActiveTime',
      width: 'var(--ui-layout-120, 120px)',
      sortable: true,
    },
    {
      title: t('adminUserManagement.columns.createdAt'),
      key: 'createTime',
      width: 'var(--ui-layout-120, 120px)',
      sortable: true,
    },
    { title: t('adminUserManagement.columns.actions'), key: 'operation', width: 'var(--ui-layout-120, 120px)' },
  ]);

  const dateFormatter = computed(
    () =>
      new Intl.DateTimeFormat(locale.value, {
        timeZone: ADMIN_DEFAULT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
  );
  const timeFormatter = computed(
    () =>
      new Intl.DateTimeFormat(locale.value, {
        timeZone: ADMIN_DEFAULT_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
  );
  const userDate = (value: unknown) => {
    const date = parseAdminDateTime(value);
    return date ? dateFormatter.value.format(date) : '—';
  };
  const userTime = (value: unknown) => {
    const date = parseAdminDateTime(value);
    return date ? timeFormatter.value.format(date) : '—';
  };

  function userRoleLabel(role: string) {
    return ['user', 'visitor', 'test', 'root'].includes(role)
      ? t(`adminUserManagement.detail.roles.${role}`)
      : t('common.unknown');
  }

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
  .usermg-page {
    font-size: var(--ui-font-13, 13px);
  }
  .log-search-input {
    flex: 1 1 var(--ui-layout-240, 240px);
    min-width: 0;
  }

  .usermg-filter {
    width: var(--ui-layout-132, 132px);
    flex: 0 0 var(--ui-layout-132, 132px);
  }

  .usermg-filter--activity {
    width: var(--ui-layout-168, 168px);
    flex-basis: var(--ui-layout-168, 168px);
  }

  .user-detail__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px) var(--ui-space-20, 20px);
  }

  .user-detail__grid label {
    display: block;
    margin-bottom: var(--ui-space-4, 4px);
    font-size: var(--ui-font-12, 12px);
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
    width: var(--ui-layout-36, 36px);
    min-width: var(--ui-layout-36, 36px);
    max-width: var(--ui-layout-36, 36px);
    height: var(--ui-layout-36, 36px);
    min-height: var(--ui-layout-36, 36px);
    max-height: var(--ui-layout-36, 36px);
    flex: 0 0 var(--ui-layout-36, 36px);
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

  .usermg-avatar-cell {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: var(--ui-space-7, 7px);
  }

  .usermg-avatar-cell small {
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
    font-weight: 600;
    white-space: nowrap;
  }

  .usermg-browser {
    display: block;
    overflow: hidden;
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .usermg-time {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-3, 3px);
  }
  .usermg-time small {
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
  }
  .usermg-identity {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    gap: var(--ui-space-3, 3px);
  }
  .usermg-identity > strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ui-font-13, 13px);
  }
  .usermg-identity > span {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
  }
  .usermg-identity small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .usermg-preview-btn.b_btn {
    height: var(--ui-control-28, 28px);
    gap: var(--ui-space-5, 5px);
  }
  .usermg-icon-btn.b_btn {
    .admin-focus-ring(6px);
    width: var(--ui-control-28, 28px);
    height: var(--ui-control-28, 28px);
    padding: var(--ui-space-4, 4px);
    border: 0;
    background: transparent;
    border-radius: 6px;
  }
  .usermg-icon-btn.b_btn:hover {
    background: var(--category-item-ba-color);
  }
  .usermg-empty {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    color: var(--desc-color);
    gap: var(--ui-space-8, 8px);
  }
  .usermg-footer {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-8, 8px) 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
</style>
