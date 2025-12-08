<template>
  <CommonContainer title="图片管理" @backClick="router.push('/admin')">
    <div style="overflow: hidden; height: 100%; box-sizing: border-box">
      <b-space style="width: 100%">
        <b-input v-model:value="searchValue" placeholder="文件名" @input="handleSearch">
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="16" />
          </template>
        </b-input>
        <a-select style="width: 100px" :options="imgOptions" v-model:value="imgType" />
        <b-button @click="clearApiImages" type="primary">清空</b-button>
      </b-space>
      <a-table
        :data-source="allImg[imgType]"
        :columns="imageColumns"
        row-key="id"
        style="margin-top: 5px"
        :scroll="{ y: bookmark.screenHeight - 250 }"
        :pagination="false"
      >
      </a-table>
      <p>
        总计
        <a>
          {{ allImg?.[imgType]?.length ?? 0 }}
        </a>
        张图片
      </p>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { apiBaseGet, apiBasePost, apiQueryPost } from '@/http/request.ts';
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
  const imgOptions = [
    { label: '使用中', value: 'usedImages' },
    { label: '已失效', value: 'unUsedImages' },
  ];

  const imageColumns = computed(() => {
    return [
      {
        title: '名称',
        dataIndex: 'name',
        ellipsis: true,
      },
    ];
  });

  function clearApiImages() {
    Alert.alert({
      title: '提示',
      content: `请确认是否要清空图片？`,
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
  onMounted(() => {
    searchApiImage();
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
