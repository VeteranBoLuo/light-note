<template>
  <CommonContainer title="用户管理" @backClick="router.push('/admin')">
    <a-table
      :data-source="userList"
      :columns="userColumns"
      row-key="id"
      :scroll="{ y: bookmark.screenHeight - 200 }"
      :pagination="false"
    >
      <template #bodyCell="{ column, text, record }">
        <template v-if="column.dataIndex === 'operation'">
          <b-space>
            <svg-icon title="编辑" :src="icon.table_edit" size="16" @click="editUser(record)" class="dom-hover" />
            <svg-icon title="编辑" :src="icon.table_delete" size="16" @click="delUser(record)" class="dom-hover" />
          </b-space>
        </template>
      </template>
    </a-table>
    <p>
      总计
      <a>
        {{ total }}
      </a>
      名用户
    </p>
    <b-modal
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
    </b-modal>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { bookmarkStore } from '@/store';
  import { apiQueryPost } from '@/http/request.ts';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BForm from '@/components/base/BasicComponents/BForm/BForm.vue';
  import { BaseFormItem } from '@/config/formConfig.ts';
  import formRenders from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import { message } from 'ant-design-vue';
  import userApi from '@/api/userApi.ts';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import router from '@/router';
  const bookmark = bookmarkStore();
  const userList = ref([]);
  const userColumns = computed(() => {
    return [
      {
        title: '昵称',
        dataIndex: 'alias',
        width: 100,
        ellipsis: true,
      },
      {
        title: '邮箱',
        dataIndex: 'email',
        ellipsis: true,
      },
      {
        title: '操作',
        dataIndex: 'operation',
        width: 100,
        ellipsis: true,
      },
    ];
  });
  const editData = ref();
  const editVisible = ref(false);
  const editUser = (record) => {
    editData.value = record;
    editVisible.value = true;
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
      currentPage: 1,
      pageSize: 1000,
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
  :deep(.ant-select-selector .ant-select-selection-item) {
    background-color: unset !important;
  }

  :deep(.ant-table-wrapper .ant-table) {
    background-color: var(--background-color);
    color: var(--text-color);
  }
  :deep(.ant-table-cell-ellipsis) {
    background-color: var(--background-color) !important;
    color: var(--text-color) !important;
  }
  :deep(.ant-table-cell-scrollbar) {
    background-color: unset !important;
    display: none;
  }
  :deep(.ant-table-cell) {
    background-color: var(--background-color) !important;
    color: black;
  }
</style>
