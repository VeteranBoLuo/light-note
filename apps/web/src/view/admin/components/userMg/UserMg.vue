<template>
  <AdminDataPage
    eyebrow="Admin / Users"
    title="用户管理"
    subtitle="管理系统用户账户、权限与资源使用情况"
    toolbar-hint="支持昵称或邮箱模糊匹配 · 停止输入 0.5s 自动查询"
    :summary-count="total"
  >
    <template #toolbar>
      <b-input v-model:value="searchValue" placeholder="搜索昵称或邮箱" class="log-search-input" @input="handleSearch">
        <template #prefix>
          <svg-icon :src="icon.navigation.search" size="16" />
        </template>
      </b-input>
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
        <template v-else-if="column.key === 'operation'">
          <BSpace>
            <BTooltip :title="t('guest.userPreviewEntry')">
              <!-- 模拟登录是「以别人身份进系统」的重操作，此前挂在裸 svg-icon 上：
                   键盘够不到、读屏也不播报，而旁边同等重要的「维护模式」却是正经按钮。 -->
              <button
                type="button"
                class="usermg-icon-btn dom-hover"
                :aria-label="`${t('guest.userPreviewEntry')}：${record.alias || record.email || record.id}`"
                @click.stop="loginAsUser(record)"
              >
                <svg-icon :src="icon.navigation.user" size="16" />
              </button>
            </BTooltip>
            <BTooltip :title="t('guest.adminContextMaintainEntry')">
              <BButton size="small" @click.stop="maintainAsUser(record)">{{
                t('guest.adminContextMaintainShort')
              }}</BButton>
            </BTooltip>
            <BActionButton action="edit" :tooltip="t('common.edit')" @click="editUser(record)" />
            <BActionButton action="delete" :tooltip="t('common.delete')" @click="delUser(record)" />
            <span
              title="成长运营(发经验/调等级/送补签卡)"
              class="dom-hover"
              style="cursor: pointer; font-size: 15px; line-height: 1"
              @click.stop="openGrowthAdmin(record)"
              >🎖️</span
            >
          </BSpace>
        </template>
      </template>
    </BTable>
  </AdminDataPage>

  <BModal v-model:visible="detailVisible" title="用户详情" width="500px" :show-footer="false" :mask-closable="true">
    <div class="user-detail" v-if="selectedRecord">
      <div class="user-detail__grid">
        <div
          ><label>昵称</label><p>{{ selectedRecord.alias }}</p></div
        >
        <div
          ><label>邮箱</label><p>{{ selectedRecord.email }}</p></div
        >
        <div
          ><label>角色</label><p>{{ selectedRecord.role }}</p></div
        >
        <div
          ><label>IP</label><p>{{ selectedRecord.ip || '-' }}</p></div
        >
        <div
          ><label>最近在线</label><p>{{ selectedRecord.lastActiveTime || '-' }}</p></div
        >
        <div
          ><label>注册时间</label><p>{{ selectedRecord.createTime }}</p></div
        >
        <div
          ><label>书签数</label><p>{{ selectedRecord.bookmarkTotal ?? 0 }}</p></div
        >
        <div
          ><label>笔记数</label><p>{{ selectedRecord.noteTotal ?? 0 }}</p></div
        >
        <div
          ><label>云空间</label><p>{{ selectedRecord.storageUsed ?? 0 }} MB</p></div
        >
      </div>
    </div>
  </BModal>

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
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BActionButton from '@/components/base/BasicComponents/BActionButton.vue';
  import UserPreviewModal from '@/view/admin/components/userMg/UserPreviewModal.vue';
  import GrowthAdminModal from '@/components/growth/GrowthAdminModal.vue';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';

  const { t } = useI18n();

  const tableRef = ref<InstanceType<typeof BTable> | null>(null);
  const searchValue = ref('');
  const sortState = ref<{ key: string | null; order: 'asc' | 'desc' | null }>({ key: null, order: null });
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
        filters: { key: searchValue.value },
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
      { title: '邮箱', key: 'email', width: '1fr' },
      { title: 'IP', key: 'ip', width: '150px' },
      { title: '最近在线', key: 'lastActiveTime', width: '1fr', sortable: true },
      { title: '注册时间', key: 'createTime', width: '1fr' },
      { title: '操作', key: 'operation', width: '190px' },
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
  const openGrowthAdmin = (record) => {
    growthAdminUser.value = { id: record.id, alias: record.alias || record.userName || '' };
    growthAdminVisible.value = true;
  };

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
    const name = record.alias || record.email || t('guest.adminContextUnknownUser');
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
            void resetList();
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
