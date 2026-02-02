<template>
  <CommonContainer title="api日志" @backClick="router.push('/admin')">
    <div style="overflow: hidden; height: 100%; box-sizing: border-box">
      <b-space style="width: 100%">
        <b-input v-model:value="searchValue" placeholder="用户名或ip..." @input="handleSearch">
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="16" />
          </template>
        </b-input>
        <b-button @click="clearApiLogs" type="primary">清空</b-button>
      </b-space>
      <a-table
        :data-source="logList"
        :columns="logColumns"
        row-key="id"
        style="margin-top: 5px"
        :scroll="{ y: bookmark.screenHeight - 235 }"
        :pagination="false"
      >
        <template #expandedRowRender="{ record }">
          <div style="overflow: auto; height: 300px; color: var(--text-color)">
            <div>时间：{{ record.requestTime }}</div>
            <div>接口：{{ record.url }}</div>
            <div>
              请求参数：
              <pre>{{ record.req }}</pre>
            </div>
            <div>ip地址：{{ record?.ip }}</div>
            <div>指纹：{{ record.system?.fingerprint }}</div>
            <div>省份：{{ record.location?.province }}</div>
            <div>城市：{{ record.location?.city }}</div>
            <div>浏览器：{{ record.system?.browser }}</div>
            <div>操作系统：{{ record.system?.os }}</div>
          </div>
        </template>
      </a-table>
      <a-pagination
        style="margin-top: 10px"
        :current="currentPage"
        :page-size="pageSize"
        show-size-changer
        size="small"
        :total="total"
        :show-total="() => `总计 ${total} 条`"
        @change="onChange"
      >
        <template #buildOptionText="props">
          <span>{{ props.value }}条/页</span>
        </template>
      </a-pagination>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { apiBaseGet, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import router from '@/router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { message } from 'ant-design-vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  const bookmark = bookmarkStore();
  const logList = ref([]);

  const logColumns = computed(() => {
    if (bookmark.isMobile) {
      return [
        {
          title: '邮箱',
          dataIndex: 'email',
          ellipsis: true,
        },
        {
          title: '时间',
          dataIndex: 'requestTime',
          ellipsis: true,
        },
      ];
    }
  });

  const currentPage = ref<number>(1);
  const pageSize = ref<number>(20);
  const onChange = (page: number, newPageSize: number) => {
    if (newPageSize !== pageSize.value) {
      currentPage.value = 1;
    } else {
      currentPage.value = page;
    }
    pageSize.value = newPageSize;
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

<style lang="less" scoped>
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
  :deep(.ant-select-dropdown-placement-topLeft) {
    min-width: 100px !important;
    transition: none !important;
  }
  :deep(.ant-select-selector .ant-select-selection-item) {
    background-color: unset !important;
    transition: none !important;
  }
  //:deep(.ant-select-selector) {
  //  transition: none !important;
  //}
  /*--分页背景调色--*/
  :deep(.ant-pagination) {
    color: var(--text-color);
  }
  :deep(.ant-pagination-item a) {
    color: var(--text-color);
  }
  :deep(.ant-pagination-item-active a) {
    color: #4e4b46;
  }
  :deep(.ant-pagination-item-ellipsis) {
    color: var(--icon-color) !important;
  }
</style>
