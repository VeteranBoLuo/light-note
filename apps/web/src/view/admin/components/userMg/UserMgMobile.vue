<template>
  <CommonContainer title="用户管理" @backClick="router.push('/admin')">
    <div class="mobile-admin-table">
      <BTable
        fill
        virtual
        :data="userList"
        :columns="userColumns"
        :row-clickable="true"
        :loading="loading"
        :has-more="hasMore"
        @load-more="loadMore"
        @row-click="onRowClick"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'alias'">
            <div class="mobile-user-name">
              <strong>{{ record.adminRemark || record.alias || '-' }}</strong>
              <span v-if="record.adminRemark && record.alias">
                {{ t('adminUserManagement.originalAlias', { name: record.alias }) }}
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'operation'">
            <b-dropdown
              class="card-more-menu"
              :trigger="'click'"
              @click.stop
              :menu-options="[
                {
                  label: t('adminUserManagement.remarkAction'),
                  icon: icon.table_edit,
                  function: () => openRemarkEditor(record),
                },
                {
                  label: t('guest.userPreviewEntry'),
                  icon: icon.navigation.user,
                  function: () => loginAsUser(record),
                },
                {
                  label: t('guest.adminContextMaintainShort'),
                  icon: icon.user_admin,
                  function: () => maintainAsUser(record),
                },
                {
                  label: t('common.edit'),
                  icon: icon.table_edit,
                  function: () => editUser(record),
                },
                {
                  label: t('common.delete'),
                  icon: icon.table_delete,
                  danger: true,
                  function: () => delUser(record),
                },
              ]"
            >
              <BTooltip :title="t('common.more')">
                <BButton
                  class="mobile-user-more dom-hover"
                  :aria-label="`${t('common.more')}：${record.adminRemark || record.alias || record.email || record.id}`"
                >
                  <svg-icon :src="icon.common.more" size="16" />
                </BButton>
              </BTooltip>
            </b-dropdown>
          </template>
        </template>
      </BTable>
    </div>

    <BModal
      v-if="editVisible"
      title="编辑用户信息"
      v-model:visible="editVisible"
      @close="editVisible = false"
      width="90%"
      @ok="saveUserInfo"
    >
      <div>
        <b-form form-id="userEditForm" :form-data="editData" :fields="formFields" />
      </div>
    </BModal>
    <UserPreviewModal v-model:visible="previewVisible" :user-info="previewUser" :mode="previewMode" />
    <AdminUserRemarkModal v-model:visible="remarkVisible" :user="remarkUser" @saved="onRemarkSaved" />

    <BModal v-model:visible="detailVisible" title="用户详情" width="90%" :show-footer="false" :mask-closable="true">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px" v-if="selectedRecord">
        <div
          ><div style="font-size: 12px; color: var(--desc-color)">昵称</div
          ><div style="color: var(--text-color)">{{ selectedRecord.alias }}</div></div
        >
        <div
          ><div style="font-size: 12px; color: var(--desc-color)">{{ t('adminUserManagement.remarkDetailLabel') }}</div
          ><div style="color: var(--text-color)">{{ selectedRecord.adminRemark || '-' }}</div></div
        >
        <div
          ><div style="font-size: 12px; color: var(--desc-color)">邮箱</div
          ><div style="color: var(--text-color)">{{ selectedRecord.email }}</div></div
        >
        <div
          ><div style="font-size: 12px; color: var(--desc-color)">角色</div
          ><div style="color: var(--text-color)">{{ selectedRecord.role }}</div></div
        >
        <div
          ><div style="font-size: 12px; color: var(--desc-color)">IP</div
          ><div style="color: var(--text-color)">{{ selectedRecord.ip || '-' }}</div></div
        >
        <div
          ><div style="font-size: 12px; color: var(--desc-color)">最近在线</div
          ><div style="color: var(--text-color)">{{ selectedRecord.lastActiveTime || '-' }}</div></div
        >
        <div
          ><div style="font-size: 12px; color: var(--desc-color)">注册时间</div
          ><div style="color: var(--text-color)">{{ selectedRecord.createTime }}</div></div
        >
        <div
          ><div style="font-size: 12px; color: var(--desc-color)">书签</div
          ><div style="color: var(--text-color)">{{ selectedRecord.bookmarkTotal ?? 0 }}</div></div
        >
        <div
          ><div style="font-size: 12px; color: var(--desc-color)">笔记</div
          ><div style="color: var(--text-color)">{{ selectedRecord.noteTotal ?? 0 }}</div></div
        >
        <div
          ><div style="font-size: 12px; color: var(--desc-color)">云空间</div
          ><div style="color: var(--text-color)">{{ selectedRecord.storageUsed ?? 0 }} MB</div></div
        >
      </div>
    </BModal>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiQueryPost } from '@/http/request.ts';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BForm from '@/components/base/BasicComponents/BForm/BForm.vue';
  import { BaseFormItem } from '@/config/formConfig.ts';
  import formRenders from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import userApi from '@/api/userApi.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import router from '@/router';
  import UserPreviewModal from '@/view/admin/components/userMg/UserPreviewModal.vue';
  import AdminUserRemarkModal from '@/view/admin/components/userMg/AdminUserRemarkModal.vue';
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';
  const { t } = useI18n();
  const {
    items: userList,
    loading,
    hasMore,
    loadMore,
    reload,
  } = useAdminCursorList<any>({
    request: (cursor, limit) =>
      apiQueryPost('/api/user/getUserList', {
        cursor,
        limit,
        filters: { key: '' },
        sort: { field: 'createTime', order: 'desc' },
      }),
    onError: () => message.error(t('common.requestFailedDescription')),
  });

  const userColumns = [
    { title: '昵称', key: 'alias', width: '1fr' },
    { title: '邮箱', key: 'email', width: '1fr' },
    { title: '操作', key: 'operation', width: '65px' },
  ];

  const editData = ref();
  const editVisible = ref(false);
  const previewVisible = ref(false);
  const previewUser = ref<any>(null);
  const previewMode = ref<'readonly' | 'maintain'>('readonly');
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);
  const remarkVisible = ref(false);
  const remarkUser = ref<any>(null);

  function onRowClick(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
  }

  const editUser = (record) => {
    editData.value = record;
    editVisible.value = true;
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
    void reload({ silent: true });
  }

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
      title: '提示',
      content: `请确认是否要删除此用户？`,
      onOk() {
        userApi.deleteUserById(record.id).then((res) => {
          if (res.status === 200) {
            message.success('删除成功');
            void reload();
          }
        });
      },
    });
  };

  const formFields: BaseFormItem[] = [
    {
      label: '昵称',
      name: 'alias',
    },
    {
      label: '邮箱',
      name: 'email',
    },
    {
      label: '密码',
      name: 'password',
    },
    {
      label: '权限',
      name: 'role',
      render: formRenders.roleSelector(),
    },
  ];

  function saveUserInfo() {
    const record = editData.value || {};
    userApi
      .updateUserInfo({ id: record.id, alias: record.alias, email: record.email, role: record.role })
      .then((res) => {
        if (res.status) {
          message.success('保存成功');
          editVisible.value = false;
          void reload();
        }
      });
  }
  onMounted(() => {
    void reload();
  });
</script>

<style lang="less" scoped>
  .mobile-admin-table {
    height: 100%;
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .mobile-user-name {
    min-width: 0;

    strong,
    span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: var(--text-color);
      font-weight: 600;
    }

    span {
      margin-top: 2px;
      color: var(--desc-color);
      font-size: 11px;
      font-weight: 400;
    }
  }

  .mobile-user-more {
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-color);
  }
</style>
