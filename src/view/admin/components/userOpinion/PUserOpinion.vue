<template>
  <CommonContainer title="用户反馈" @backClick="router.push('/admin')">
    <div style="overflow: hidden; height: 100%; box-sizing: border-box">
      <b-space style="width: 100%">
        <b-input v-model:value="searchValue" placeholder="用户名..." @input="handleSearch">
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="16" />
          </template>
        </b-input>
      </b-space>
      <a-table
        :data-source="logList"
        :columns="logColumns"
        row-key="id"
        style="margin-top: 5px"
        :scroll="{ y: bookmark.screenHeight - 250 }"
        :pagination="false"
      >
        <template #expandedRowRender="{ record }">
          <div style="max-height: 300px; overflow-y: auto; min-height: 120px; color: var(--text-color)">
            <p>反馈内容：{{ record.content }}</p>
            <p>反馈时间：{{ record.createTime }}</p>
            反馈图片：
            <div class="flex-align-center-gap">
              <img
                v-for="src in JSON.parse(record.imgArray)"
                :src="src"
                height="100"
                width="100"
                @click="bookmark.refreshViewer(src)"
                alt=""
              />
            </div>
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

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import router from '@/router';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';

  const bookmark = bookmarkStore();
  const logList = ref([]);

  const logColumns = computed(() => {
    return [
      {
        title: '用户名',
        dataIndex: 'userName',
        ellipsis: true,
      },
      {
        title: '反馈内容',
        dataIndex: 'content',
        ellipsis: true,
      },
    ];
  });

  const currentPage = ref<number>(1);
  const pageSize = ref<number>(10);
  const onChange = (page: number, newPageSize: number) => {
    if (newPageSize !== pageSize.value) {
      currentPage.value = 1;
    } else {
      currentPage.value = page;
    }
    pageSize.value = newPageSize;
    searchApiLog();
  };

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
    apiQueryPost('/api/opinion/getOpinionList', {
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
