<template>
  <AdminDataPage
    eyebrow="Admin / Users"
    title="用户管理"
    subtitle="管理系统用户账户、权限与资源使用情况"
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
      :sort="sortState"
      @load-more="loadMore"
      @sort-change="onSortChange"
      @row-click="onRowClick"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'headPicture'">
          <svg-icon style="border-radius: 50%" :src="record.headPicture || icon.navigation.user" :size="30" />
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
    title="编辑用户信息"
    width="600px"
    v-model:visible="editVisible"
    @close="editVisible = false"
    @ok="saveUserInfo"
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
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiQueryPost } from '@/http/request.ts';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BForm from '@/components/base/BasicComponents/BForm/BForm.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import { BaseFormItem } from '@/config/formConfig.ts';
  import formRenders from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import userApi from '@/api/userApi.ts';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
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
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';

  const { t } = useI18n();

  const tableRef = ref<InstanceType<typeof BTable> | null>(null);
  const searchValue = ref('');
  const roleFilter = ref('');
  const statusFilter = ref('active');
  const activityFilter = ref('all');
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
  const sortState = ref<{ key: string | null; order: 'asc' | 'desc' | null }>({
    key: 'lastActiveTime',
    order: 'desc',
  });
  const {
    items: userList,
    total,
    loading,
    hasMore,
    loadMore,
    reload,
  } = useAdminCursorList<any>({
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
        sort: sortState.value.key
          ? { field: sortState.value.key, order: sortState.value.order }
          : { field: 'createTime', order: 'desc' },
      }),
    onError: (_error, silent) => {
      if (!silent) message.error(t('common.requestFailedDescription'));
    },
  });
  const userColumns = computed(() => {
    return [
      {
        title: '头像',
        key: 'headPicture',
        width: '60px',
      },
      { title: '昵称', key: 'alias', width: '150px' },
      { title: t('adminUserManagement.remarkColumn'), key: 'adminRemark', width: '150px' },
      { title: '邮箱', key: 'email', width: '1fr' },
      { title: 'IP', key: 'ip', width: '150px' },
      { title: '最近在线', key: 'lastActiveTime', width: '1fr', sortable: true },
      { title: '注册时间', key: 'createTime', width: '1fr' },
      // 操作只剩「预览 + 更多」两个图标，190px 是五个按钮平铺时代的遗留
      { title: '操作', key: 'operation', width: '100px' },
    ];
  });

  const timer = ref();
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);

  function onRowClick(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
  }
  function handleSearch() {
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      void resetList(true);
    }, 500);
  }

  function resetList(silent = false) {
    tableRef.value?.scrollToTop();
    return reload({ silent });
  }

  function onSortChange(sort: { key: string | null; order: 'asc' | 'desc' | null }) {
    sortState.value = sort;
    void resetList();
  }
  const editData = ref();
  const editVisible = ref(false);
  const previewVisible = ref(false);
  const previewUser = ref<any>(null);
  const previewMode = ref<'readonly' | 'maintain'>('readonly');
  const growthAdminVisible = ref(false);
  const growthAdminUser = ref<{ id: string; alias: string }>({ id: '', alias: '' });
  const remarkVisible = ref(false);
  const remarkUser = ref<any>(null);
  /**
   * 「更多」里的低频与危险操作。
   * 删除单独用分隔线隔开并标 danger，避免和上面几个「进入某人的工作区」混在一起误点。
   */
  const moreOptions = (record: any) => [
    {
      key: 'remark',
      label: t('adminUserManagement.remarkAction'),
      icon: icon.table_edit,
      function: () => openRemarkEditor(record),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: icon.table_edit,
      function: () => editUser(record),
    },
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
    {
      key: 'delete',
      label: t('common.delete'),
      icon: icon.table_delete,
      danger: true,
      function: () => delUser(record),
    },
  ];

  const openGrowthAdmin = (record) => {
    growthAdminUser.value = { id: record.id, alias: record.adminRemark || record.alias || record.userName || '' };
    growthAdminVisible.value = true;
  };

  const openRemarkEditor = (record: any) => {
    remarkUser.value = record;
    remarkVisible.value = true;
  };

  function onRemarkSaved(payload: { targetUserId: string; adminRemark: string }) {
    const loadedRecord = userList.value.find((record) => record.id === payload.targetUserId);
    if (loadedRecord) loadedRecord.adminRemark = payload.adminRemark;
    if (selectedRecord.value?.id === payload.targetUserId) {
      selectedRecord.value.adminRemark = payload.adminRemark;
    }
    void resetList(true);
  }

  const editUser = (record) => {
    editData.value = record;
    editVisible.value = true;
  };

  const loginAsUser = (record) => {
    if (!record?.id) {
      message.warning('此用户缺少用户ID，无法预览');
      return;
    }
    openPreview(record, 'readonly');
  };

  const openPreview = (record, mode: 'readonly' | 'maintain') => {
    previewUser.value = record;
    previewMode.value = mode;
    previewVisible.value = true;
  };

  const maintainAsUser = (record) => {
    if (!record?.id) {
      message.warning(t('guest.adminContextMissingUser'));
      return;
    }
    const name = record.adminRemark || record.alias || record.email || t('guest.adminContextUnknownUser');
    Alert.alert({
      title: t('guest.adminContextMaintainConfirmTitle'),
      content: t('guest.adminContextMaintainConfirm', { name }),
      onOk: () => openPreview(record, 'maintain'),
    });
  };

  const delUser = (record) => {
    Alert.alert({
      title: t('common.tips'),
      content: t('adminUserManagement.deleteConfirm', { name: record.adminRemark || record.alias || record.email }),
      onOk() {
        userApi.deleteUserById(record.id).then((res) => {
          if (res.status === 200) {
            message.success(t('adminUserManagement.deleteSuccess'));
            void resetList();
          }
        });
      },
    });
  };

  const formFields: BaseFormItem[] = [
    {
      label: t('adminUserManagement.detail.alias'),
      name: 'alias',
    },
    {
      label: t('adminUserManagement.email'),
      name: 'email',
    },
    {
      label: t('adminUserManagement.role'),
      name: 'role',
      render: formRenders.roleSelector(),
    },
  ];

  function saveUserInfo() {
    const record = editData.value || {};
    userApi
      .updateUserInfo({ id: record.id, alias: record.alias, email: record.email, role: record.role })
      .then((res) => {
        if (res.status === 200) {
          message.success(t('adminUserManagement.saveSuccess'));
          editVisible.value = false;
          void resetList();
        }
      });
  }

  // 发通知能力已收拢至独立「通知中心」模块(顶部管理 → 通知中心),此处不再内联,避免功能散落。

  onMounted(() => {
    void reload();
  });
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
