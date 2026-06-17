<template>
  <CommonContainer title="用户管理" @backClick="router.push('/admin')">
    <BTable
      :data="userList"
      :columns="userColumns"
      :row-clickable="true"
      :pagination="true"
      :total="total"
      :current-page="currentPage"
      :page-size="pageSize"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      @row-click="onRowClick"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'operation'">
          <b-space>
            <svg-icon title="登录此用户" :src="icon.navigation.user" size="16" @click.stop="loginAsUser(record)" class="dom-hover" />
            <svg-icon title="编辑" :src="icon.table_edit" size="16" @click.stop="editUser(record)" class="dom-hover" />
            <svg-icon title="删除" :src="icon.table_delete" size="16" @click.stop="delUser(record)" class="dom-hover" />
          </b-space>
        </template>
      </template>
    </BTable>

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
    <UserPreviewModal v-model:visible="previewVisible" :user-info="previewUser" />

    <BModal v-model:visible="detailVisible" title="用户详情" width="90%" :show-footer="false" :mask-closable="true">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px;" v-if="selectedRecord">
        <div><div style="font-size:12px;color:var(--desc-color)">昵称</div><div style="color:var(--text-color)">{{ selectedRecord.alias }}</div></div>
        <div><div style="font-size:12px;color:var(--desc-color)">邮箱</div><div style="color:var(--text-color)">{{ selectedRecord.email }}</div></div>
        <div><div style="font-size:12px;color:var(--desc-color)">角色</div><div style="color:var(--text-color)">{{ selectedRecord.role }}</div></div>
        <div><div style="font-size:12px;color:var(--desc-color)">IP</div><div style="color:var(--text-color)">{{ selectedRecord.ip || '-' }}</div></div>
        <div><div style="font-size:12px;color:var(--desc-color)">最近活跃</div><div style="color:var(--text-color)">{{ selectedRecord.lastActiveTime || '-' }}</div></div>
        <div><div style="font-size:12px;color:var(--desc-color)">注册时间</div><div style="color:var(--text-color)">{{ selectedRecord.createTime }}</div></div>
        <div><div style="font-size:12px;color:var(--desc-color)">书签</div><div style="color:var(--text-color)">{{ selectedRecord.bookmarkTotal ?? 0 }}</div></div>
        <div><div style="font-size:12px;color:var(--desc-color)">笔记</div><div style="color:var(--text-color)">{{ selectedRecord.noteTotal ?? 0 }}</div></div>
        <div><div style="font-size:12px;color:var(--desc-color)">云空间</div><div style="color:var(--text-color)">{{ selectedRecord.storageUsed ?? 0 }} MB</div></div>
      </div>
    </BModal>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue';
  import { apiQueryPost } from '@/http/request.ts';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BForm from '@/components/base/BasicComponents/BForm/BForm.vue';
  import { BaseFormItem } from '@/config/formConfig.ts';
  import formRenders from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import userApi from '@/api/userApi.ts';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import router from '@/router';
  import UserPreviewModal from '@/view/admin/components/userMg/UserPreviewModal.vue';
  const userList = ref([]);

  const userColumns = [
    { title: '昵称', key: 'alias', width: '1fr' },
    { title: '邮箱', key: 'email', width: '1fr' },
    { title: '操作', key: 'operation', width: '90px' },
  ];

  const currentPage = ref<number>(1);
  const pageSize = ref<number>(20);

  function onPageChange(page: number) {
    currentPage.value = page;
    init();
  }
  function onSizeChange(_current: number, size: number) {
    currentPage.value = 1;
    pageSize.value = size;
    init();
  }

  const editData = ref();
  const editVisible = ref(false);
  const previewVisible = ref(false);
  const previewUser = ref<any>(null);
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);

  function onRowClick(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
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
    previewUser.value = record;
    previewVisible.value = true;
  };

  const delUser = (record) => {
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除此用户？`,
      onOk() {
        userApi.deleteUserById(record.id).then((res) => {
          if (res.status === 200) {
            message.success('删除成功');
            init();
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
    userApi.updateUserInfo(editData.value).then((res) => {
      if (res.status) {
        message.success('保存成功');
        editVisible.value = false;
        init();
      }
    });
  }
  const total = ref(0);

  function init() {
    apiQueryPost('/api/user/getUserList', {
      currentPage: currentPage.value,
      pageSize: pageSize.value,
      filters: {
        key: '',
      },
    }).then((res) => {
      if (res.status) {
        userList.value = res.data.items;
        total.value = res.data.total;
      }
    });
  }
  onMounted(() => {
    init();
  });
</script>

<style lang="less" scoped>
</style>
