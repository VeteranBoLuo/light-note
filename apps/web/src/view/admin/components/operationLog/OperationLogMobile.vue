<template>
  <CommonContainer title="操作日志" @backClick="router.push('/admin')">
    <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden">
      <b-space style="width: 100%; flex-shrink: 0">
        <b-input v-model:value="searchValue" placeholder="昵称、邮箱或操作名..." @input="handleSearch">
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="16" />
          </template>
        </b-input>
        <b-button @click="clearOperationLogs" type="primary">清空</b-button>
      </b-space>
      <BTable
        fill
        virtual
        style="flex: 1; min-height: 0"
        :data="logList"
        :columns="logColumns"
        :row-clickable="true"
        :loading="loading"
        :has-more="hasMore"
        @load-more="loadMore"
        @row-click="onRowClick"
      />
    </div>

    <BModal v-model:visible="detailVisible" title="操作详情" width="500px" :show-footer="false" :mask-closable="true">
      <div style="display: flex; flex-direction: column; gap: 10px; color: var(--text-color)" v-if="selectedRecord">
        <div>昵称：{{ selectedRecord.alias }}</div>
        <div>邮箱：{{ selectedRecord.email }}</div>
        <div>模块：{{ selectedRecord.module }}</div>
        <div>操作：{{ selectedRecord.operation }}</div>
        <div>时间：{{ selectedRecord.createTime }}</div>
      </div>
    </BModal>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue';
  import { apiBaseGet, apiQueryPost } from '@/http/request.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import router from '@/router';
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n();
  const searchValue = ref('');
  const hideInternal = ref(true); // 移动端无开关,默认隐藏内部账号(root/test);后端也默认隐藏
  const {
    items: logList,
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
    { title: '操作名称', key: 'operation', width: '1fr' },
  ];

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
      searchApiLog();
    }, 500);
  }

  function searchApiLog() {
    void reload();
  }
  onMounted(() => {
    searchApiLog();
  });
</script>

<style lang="less" scoped></style>
