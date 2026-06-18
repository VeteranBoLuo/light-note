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

      <div class="admin-table-card" ref="tableCardRef">
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
          <template #bodyCell="{ column, text, record }">
            <template v-if="column.key === 'operation'">
              <BSpace>
                <svg-icon
                  title="登录此用户"
                  :src="icon.navigation.user"
                  size="16"
                  @click="loginAsUser(record)"
                  class="dom-hover"
                />
                <svg-icon
                  title="编辑"
                  :src="icon.table_edit"
                  size="16"
                  @click="editUser(record)"
                  class="dom-hover"
                />
                <svg-icon
                  title="删除"
                  :src="icon.table_delete"
                  size="16"
                  @click="delUser(record)"
                  class="dom-hover"
                />
              </BSpace>
            </template>
          </template>
        </BTable>
      </div>

      <BModal v-model:visible="detailVisible" title="用户详情" width="500px" :show-footer="false" :mask-closable="true">
        <div class="user-detail" v-if="selectedRecord">
          <div class="user-detail__grid">
            <div><label>昵称</label><p>{{ selectedRecord.alias }}</p></div>
            <div><label>邮箱</label><p>{{ selectedRecord.email }}</p></div>
            <div><label>角色</label><p>{{ selectedRecord.role }}</p></div>
            <div><label>IP</label><p>{{ selectedRecord.ip || '-' }}</p></div>
            <div><label>最近活跃</label><p>{{ selectedRecord.lastActiveTime || '-' }}</p></div>
            <div><label>注册时间</label><p>{{ selectedRecord.createTime }}</p></div>
            <div><label>书签数</label><p>{{ selectedRecord.bookmarkTotal ?? 0 }}</p></div>
            <div><label>笔记数</label><p>{{ selectedRecord.noteTotal ?? 0 }}</p></div>
            <div><label>云空间</label><p>{{ selectedRecord.storageUsed ?? 0 }} MB</p></div>
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

      <UserPreviewModal v-model:visible="previewVisible" :user-info="previewUser" />
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { apiQueryPost } from '@/http/request.ts';
  import { useTableScrollY } from '@/composables/useTableScrollY';
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
  import UserPreviewModal from '@/view/admin/components/userMg/UserPreviewModal.vue';

  const tableCardRef = ref<HTMLElement | null>(null);
  useTableScrollY({ ref: tableCardRef });

  const userList = ref([]);
  const userColumns = computed(() => {
    return [
      { title: '昵称', key: 'alias', width: '1fr' },
      { title: '邮箱', key: 'email', width: '1fr' },
      { title: 'IP', key: 'ip', width: '120px' },
      { title: '最近活跃', key: 'lastActiveTime', width: '140px' },
      { title: '注册时间', key: 'createTime', width: '140px' },
      { title: '书签数', key: 'bookmarkTotal', width: '70px' },
      { title: '笔记数', key: 'noteTotal', width: '70px' },
      { title: '云空间(MB)', key: 'storageUsed', width: '110px' },
      { title: '操作', key: 'operation', width: '120px' },
    ];
  });

  const currentPage = ref<number>(1);
  const pageSize = ref<number>(20);
  const searchValue = ref('');

  const onPageChange = (page: number) => {
    currentPage.value = page;
    init();
  };

  const onSizeChange = (_current: number, size: number) => {
    currentPage.value = 1;
    pageSize.value = size;
    init();
  };

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
  const previewVisible = ref(false);
  const previewUser = ref<any>(null);

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

  .admin-table-card {
    padding: 0;
  }

  :deep(.ant-select-selector .ant-select-selection-item) {
    background-color: unset !important;
  }

  @media (max-width: 960px) {
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
</style>
