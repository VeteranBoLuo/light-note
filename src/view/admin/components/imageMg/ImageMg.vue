<template>
  <div style="height: 100%; box-sizing: border-box">
    <b-space style="width: 100%">
      <b-input v-model:value="searchValue" placeholder="文件名" class="log-search-input" @input="handleSearch">
        <template #prefix>
          <svg-icon :src="icon.navigation.search" size="16" />
        </template>
      </b-input>
      <a-select style="width: 100px" :options="imgOptions" v-model:value="imgType" />
      <b-button @click="clearApiImages" type="primary">清理</b-button>
    </b-space>
    <a-table
      :data-source="allImg[imgType]"
      :columns="imageColumns"
      row-key="id"
      style="margin-top: 5px"
      :scroll="{ y: bookmark.screenHeight - 250 }"
      :pagination="false"
    >
      <template #bodyCell="{ column, text, record }">
        <template v-if="column.dataIndex === 'img'">
          <div
            style="
              width: 40px;
              height: 40px;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 0.125rem;
              background-color: rgb(255, 255, 255);
              border-radius: 0.5rem;
              flex-shrink: 0;
            "
            class="dom-hover"
            @click="bookmark.refreshViewer(getImgFullUrl(record.fullFileName))"
          >
            <svg-icon size="40" title="点击预览" :src="getImgFullUrl(record.fullFileName)"
          /></div>
        </template>
      </template>
    </a-table>
    <p>
      总计
      <a>
        {{ allImg?.[imgType]?.length ?? 0 }}
      </a>
      张图片
    </p>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { apiBaseGet, apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { message } from 'ant-design-vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  const bookmark = bookmarkStore();

  const imgOptions = [
    { label: '使用中', value: 'usedImages' },
    { label: '已失效', value: 'unUsedImages' },
  ];

  const imageColumns = computed(() => {
    return [
      {
        title: '图片',
        dataIndex: 'img',
        width: 200,
      },
      {
        title: '名称',
        dataIndex: 'name',
        ellipsis: true,
      },
      {
        title: '类型',
        dataIndex: 'extension',
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
    searchApiImage();
  };

  function clearApiImages() {
    Alert.alert({
      title: '提示',
      content: `请确认是否要清理图片？`,
      onOk() {
        apiBasePost('/api/common/clearImages', {
          images: allImg.value[imgType.value],
        }).then((res) => {
          if (res.status === 200) {
            message.success('日志清空成功');
            searchApiImage();
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
      searchApiImage();
    }, 500);
  }

  const searchValue = ref('');
  const imgType = ref('usedImages');
  const allImg = ref({});
  function searchApiImage() {
    apiBasePost('/api/common/getImages', { name: searchValue.value }).then((res) => {
      if (res.status === 200) {
        allImg.value = res.data.items;
      }
    });
  }
  function getImgFullUrl(fullFileName) {
    return `${window.location.protocol}//${import.meta.env.VITE_HOST_URL}/uploads/${fullFileName}`;
  }
  onMounted(() => {
    searchApiImage();
  });
</script>

<style lang="less" scoped>
  .log-search-input {
    width: 50%;
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
