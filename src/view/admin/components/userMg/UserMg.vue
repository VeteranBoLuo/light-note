<template>
  <div class="admin-panel-container">
    <section class="admin-panel user-mg__panel">
      <header class="admin-header user-mg__header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Users</p>
          <h2 class="admin-title">用户管理</h2>
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

      <div class="admin-filters">
        <div class="admin-filters-main">
          <b-input
            v-model:value="searchValue"
            placeholder="昵称或邮箱..."
            class="log-search-input"
            @input="handleSearch"
          >
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
        </div>
        <span class="admin-filters-hint">支持模糊匹配 · 回车或停止输入 0.5s 自动查询</span>
      </div>

      <div class="admin-table-card">
        <a-table :data-source="userList" :columns="userColumns" row-key="id" :scroll="{ y: 400 }" :pagination="false">
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

      <footer class="admin-footer">
        <a-pagination
          :current="currentPage"
          :page-size="pageSize"
          show-size-changer
          size="small"
          :total="total"
          @change="onChange"
        >
          <template #buildOptionText="props">
            <span>{{ props.value }}条/页</span>
          </template>
        </a-pagination>
      </footer>

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
  import BInput from '@/components/base/BasicComponents/BInput.vue';

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
        title: '密码',
        dataIndex: 'password',
        ellipsis: true,
      },
      {
        title: 'ip',
        dataIndex: 'ip',
        ellipsis: true,
      },
      {
        title: '最近活跃时间',
        dataIndex: 'lastActiveTime',
        ellipsis: true,
      },
      { title: '注册时间', dataIndex: 'createTime' },
      { title: '书签数', dataIndex: 'bookmarkTotal', width: 80 },
      { title: '笔记数', dataIndex: 'noteTotal', width: 80 },
      { title: '云空间使用量 (MB)', dataIndex: 'storageUsed', width: 140 },
      {
        title: '操作',
        dataIndex: 'operation',
        ellipsis: true,
      },
    ];
  });

  const currentPage = ref<number>(1);
  const pageSize = ref<number>(50);
  const searchValue = ref('');

  const onChange = (page: number, newPageSize: number) => {
    if (newPageSize !== pageSize.value) {
      currentPage.value = 1;
    } else {
      currentPage.value = page;
    }
    pageSize.value = newPageSize;
    init();
  };

  const timer = ref();
  function handleSearch() {
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      init();
    }, 500);
  }

  const total = ref(0);
  const statCards = computed(() => {
    const totalValue = total.value || 0;
    const hasData = totalValue > 0;
    const start = hasData ? (currentPage.value - 1) * pageSize.value + 1 : 0;
    const end = hasData ? Math.min(totalValue, currentPage.value * pageSize.value) : 0;
    return [
      {
        label: '当前展示区间',
        value: `${start}-${end}`,
        hint: '条记录',
      },
      {
        label: '总用户数',
        value: totalValue,
        hint: '累计',
      },
      {
        label: '分页尺寸',
        value: pageSize.value,
        hint: '条/页',
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

  function init() {
    apiQueryPost('/api/user/getUserList', {
      currentPage: currentPage.value,
      pageSize: pageSize.value,
      filters: {
        key: searchValue.value,
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
  @import '@/assets/css/admin-manage.less';

  .log-search-input {
    flex: 1;
  }

  :deep(.ant-select-selector .ant-select-selection-item) {
    background-color: unset !important;
  }

  @media (max-width: 960px) {
  }
</style>
