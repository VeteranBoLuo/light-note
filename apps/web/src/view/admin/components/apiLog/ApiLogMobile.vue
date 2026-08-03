<template>
  <CommonContainer title="api日志" @backClick="router.push('/admin')">
    <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden">
      <b-space style="width: 100%; flex-shrink: 0">
        <b-input v-model:value="searchValue" placeholder="昵称、邮箱、IP 或接口..." @input="handleSearch">
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="16" />
          </template>
        </b-input>
        <b-button @click="clearApiLogs" type="primary">清空</b-button>
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
      >
      </BTable>
    </div>

    <BModal v-model:visible="detailVisible" title="API 详情" width="600px" :show-footer="false" :mask-closable="true">
      <div style="display: flex; flex-direction: column; gap: 10px; color: var(--text-color)" v-if="selectedRecord">
        <div>时间：{{ selectedRecord.requestTime }}</div>
        <div>接口：{{ selectedRecord.url }}</div>
        <div>
          请求参数：
          <pre
            style="
              margin: 4px 0 0;
              max-height: 120px;
              overflow: auto;
              padding: 8px;
              border-radius: 6px;
              font-size: 12px;
              white-space: pre-wrap;
              word-break: break-all;
            "
            >{{ selectedRecord.req }}</pre>
        </div>
        <div>ip地址：{{ selectedRecord?.ip }}</div>
        <div>指纹：{{ selectedRecord.system?.fingerprint }}</div>
        <div>省份：{{ selectedRecord.location?.province }}</div>
        <div>城市：{{ selectedRecord.location?.city }}</div>
        <div>浏览器：{{ selectedRecord.system?.browser }}</div>
        <div>{{ t('apiLog.operatingSystem') }}：{{ selectedRecord.system?.os || t('apiLog.unknown') }}</div>
        <div>{{ t('apiLog.runtime') }}：{{ t(getApiLogRuntimeLabelKey(selectedRecord.system?.runtime)) }}</div>
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
  import router from '@/router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { useI18n } from 'vue-i18n';
  import { getApiLogRuntimeLabelKey } from '@/utils/apiLogPresentation.ts';
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';
  const { t } = useI18n();
  const searchValue = ref('');
  const {
    items: logList,
    loading,
    hasMore,
    loadMore,
    reload,
  } = useAdminCursorList<any>({
    request: (cursor, limit) =>
      apiQueryPost('/api/common/getApiLogs', {
        cursor,
        limit,
        filters: { key: searchValue.value, hideInternal: true },
      }),
    onError: () => message.error(t('common.requestFailedDescription')),
  });

  const logColumns = [
    { title: '昵称', key: 'alias', width: '1fr' },
    { title: '邮箱', key: 'email', width: '1fr' },
    { title: '时间', key: 'requestTime', width: '1fr' },
  ];

  function clearApiLogs() {
    Alert.alert({
      title: '提示',
      content: `请确认是否要清空日志？`,
      onOk() {
        apiBaseGet('/api/common/clearApiLogs', {}).then((res) => {
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
