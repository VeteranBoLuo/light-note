<template>
  <div class="admin-panel-container">
    <section class="admin-panel user-mg__panel">
      <header class="admin-header user-mg__header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Users</p>
          <h2>用户管理</h2>
          <p class="admin-subtitle">管理系统用户账户和权限</p>
        </div>
      </header>

      <ul class="admin-stats">
        <li v-for="card in statCards" :key="card.label" class="admin-stat-card">
          <span class="admin-stat-label">{{ card.label }}</span>
          <strong class="admin-stat-value">{{ card.value }}</strong>
          <span class="admin-stat-hint">{{ card.hint }}</span>
        </li>
      </ul>

      <div class="admin-table-card">
        <a-table :data-source="userList" :columns="userColumns" row-key="id" :scroll="{ y: 500 }" :pagination="false">
          <template #bodyCell="{ column, text, record }">
            <template v-if="column.dataIndex === 'operation'">
              <b-space>
                <svg-icon title="编辑" :src="icon.table_edit" size="16" @click="editUser(record)" class="dom-hover" />
                <svg-icon title="删除" :src="icon.table_delete" size="16" @click="delUser(record)" class="dom-hover" />
              </b-space>
            </template>
          </template>
        </a-table>
      </div>

      <b-modal
        v-if="editVisible"
        title="编辑用户信息"
        v-model:visible="editVisible"
        @close="editVisible = false"
        @ok="saveUserInfo"
      >
        <div>
          <b-form form-id="userEditForm" :form-data="editData" :fields="formFields" />
        </div>
      </b-modal>
    </section>
  </div>
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

  const bookmark = bookmarkStore();
  const userList = ref([]);
  const userColumns = computed(() => {
    return [
      {
        title: '昵称',
        dataIndex: 'alias',
        ellipsis: true,
      },
      {
        title: '邮箱',
        dataIndex: 'email',
        ellipsis: true,
      },
      {
        title: '权限',
        dataIndex: 'role',
        ellipsis: true,
      },
      {
        title: '密码',
        dataIndex: 'password',
        ellipsis: true,
      },
      {
        title: '邮箱',
        dataIndex: 'email',
        ellipsis: true,
      },
      {
        title: 'ip',
        dataIndex: 'ip',
        ellipsis: true,
      },
      {
        title: '操作',
        dataIndex: 'operation',
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
  const statCards = computed(() => {
    const totalValue = total.value || 0;
    return [
      {
        label: '总用户数',
        value: totalValue,
        hint: '累计',
      },
    ];
  });

  function init() {
    apiQueryPost('/api/user/getUserList').then((res) => {
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
  @import '@/assets/css/admin-manage.less';

  :deep(.ant-select-selector .ant-select-selection-item) {
    background-color: unset !important;
  }

  @media (max-width: 960px) {
  }
</style>
