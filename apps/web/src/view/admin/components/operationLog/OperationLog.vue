<template>
  <AdminDataPage
    eyebrow="Admin / Operation"
    title="操作日志"
    subtitle="实时掌握后台动作和接口调用状态"
    toolbar-hint="支持模糊匹配 · 回车或停止输入 0.5s 自动查询"
    :summary-count="total"
  >
    <template #toolbar>
      <b-input
        v-model:value="searchValue"
        placeholder="搜索昵称 / 邮箱 / 模块 / 操作名"
        class="log-search-input"
        @input="handleSearch"
      >
        <template #prefix>
          <svg-icon :src="icon.navigation.search" size="16" />
        </template>
      </b-input>
      <span class="admin-toolbar-switch">
        <BSwitch v-model:checked="hideInternal" @change="searchApiLog()" />
        隐藏内部账号(管理员/测试)
      </span>
      <b-button type="danger" @click="clearOperationLogs">清空日志</b-button>
    </template>

    <BTable
      ref="tableRef"
      fill
      virtual
      :data="logList"
      :columns="logColumns"
      :row-clickable="true"
      :loading="loading"
      :has-more="hasMore"
      @load-more="loadMore"
      @row-click="onRowClick"
    />
  </AdminDataPage>

  <BModal v-model:visible="detailVisible" title="操作详情" width="500px" :show-footer="false" :mask-closable="true">
    <div style="display: flex; flex-direction: column; gap: 10px; color: var(--text-color)" v-if="selectedRecord">
      <div>昵称：{{ selectedRecord.alias }}</div>
      <div>邮箱：{{ selectedRecord.email }}</div>
      <div>模块：{{ selectedRecord.module }}</div>
      <div>操作：{{ selectedRecord.operation }}</div>
      <div>时间：{{ selectedRecord.createTime }}</div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue';
  import { apiBaseGet, apiQueryPost } from '@/http/request.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n();
  const tableRef = ref<InstanceType<typeof BTable> | null>(null);
  const searchValue = ref('');
  const hideInternal = ref(true);
  const {
    items: logList,
    total,
    loading,
    hasMore,
    loadMore,
    reload,
  } = useAdminCursorList<any>({
    request: (cursor, limit) =>
      apiQueryPost('/api/common/getOperationLogs', {
        cursor,
        limit,
        filters: { key: searchValue.value, hideInternal: hideInternal.value },
      }),
    onError: () => message.error(t('common.requestFailedDescription')),
  });

  const logColumns = [
    { title: '昵称', key: 'alias', width: '1fr' },
    { title: '邮箱', key: 'email', width: '1fr' },
    { title: '模块', key: 'module', width: '1fr' },
    { title: '操作', key: 'operation', width: '1fr' },
    { title: '时间', key: 'createTime', width: '1fr' },
  ];

  const timer = ref();
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);

  function onRowClick(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
  }

  function clearOperationLogs() {
    Alert.alert({
      title: '提示',
      content: `请确认是否要清空操作日志？`,
      onOk() {
        apiBaseGet('/api/common/clearOperationLogs', {}).then((res) => {
          if (res.status === 200) {
            message.success('日志清空成功');
            searchApiLog();
          }
        });
      },
    });
  }

  function handleSearch() {
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      searchApiLog();
    }, 500);
  }

  function searchApiLog() {
    tableRef.value?.scrollToTop();
    void reload();
  }
  onMounted(() => {
    searchApiLog();
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-breakpoints.less';
  .log-search-input {
    flex: 1;
  }

  .admin-toolbar-switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-color);
    font-size: 13px;
    white-space: nowrap;
  }

  @media (max-width: @admin-bp-desktop) {
    .log-search-input {
      width: 100%;
    }
  }
</style>
