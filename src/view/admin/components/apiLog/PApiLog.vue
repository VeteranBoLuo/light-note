<template>
  <CommonContainer title="api日志" @backClick="router.push('/admin')">
    <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden">
      <b-space style="width: 100%; flex-shrink: 0">
        <b-input v-model:value="searchValue" placeholder="用户名或ip..." @input="handleSearch">
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="16" />
          </template>
        </b-input>
        <b-button @click="clearApiLogs" type="primary">清空</b-button>
      </b-space>
      <BTable
        style="flex: 1; min-height: 0"
        :data="logList"
        :columns="logColumns"
        :row-clickable="true"
        :pagination="true"
        :total="total"
        :current-page="currentPage"
        :page-size="pageSize"
        @page-change="onPageChange"
        @size-change="onSizeChange"
        @row-click="onRowClick"
      >
        <template #bodyCell="{ column, text }">
          <template v-if="column.key === 'system'">
            <span :style="{ color: getOsColor(text?.os), fontSize: '12px' }">{{ text?.os || '未知' }}</span>
          </template>
        </template>
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
              background: var(--menu-item-h-bg-color);
              padding: 8px;
              border-radius: 6px;
              font-size: 12px;
            "
            >{{ selectedRecord.req }}</pre
          >
        </div>
        <div>ip地址：{{ selectedRecord?.ip }}</div>
        <div>指纹：{{ selectedRecord.system?.fingerprint }}</div>
        <div>省份：{{ selectedRecord.location?.province }}</div>
        <div>城市：{{ selectedRecord.location?.city }}</div>
        <div>浏览器：{{ selectedRecord.system?.browser }}</div>
        <div>操作系统：{{ selectedRecord.system?.os }}</div>
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
  import { message } from 'ant-design-vue/es';
  const logList = ref([]);

  const logColumns = [
    { title: '邮箱', key: 'email', width: '1fr' },
    { title: '系统', key: 'system', width: '80px' },
    { title: '时间', key: 'requestTime', width: '1fr' },
  ];

  function getOsColor(os?: string): string {
    if (!os) return '#666';
    if (os.includes('Windows')) return '#1677ff';
    if (os.includes('Mac')) return '#00a884';
    if (os.includes('Linux')) return '#52c41a';
    return '#666';
  }

  const currentPage = ref<number>(1);
  const pageSize = ref<number>(20);
  const onPageChange = (page: number) => {
    currentPage.value = page;
    searchApiLog();
  };
  const onSizeChange = (_current: number, newPageSize: number) => {
    pageSize.value = newPageSize;
    currentPage.value = 1;
    searchApiLog();
  };

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

  const total = ref(0);
  const searchValue = ref('');
  function searchApiLog() {
    apiQueryPost('/api/common/getApiLogs', {
      currentPage: currentPage.value,
      pageSize: pageSize.value,
      filters: {
        key: searchValue.value,
      },
    }).then((res) => {
      if (res.status === 200) {
        logList.value = res.data.items;
        total.value = res.data.total;
      }
    });
  }
  onMounted(() => {
    searchApiLog();
  });
</script>

<style lang="less" scoped></style>
