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
      <BTable :data="allImg[imgType]" :columns="imageColumns" rowKey="id" style="margin-top: 5px">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'img'">
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
              <svg-icon size="40" title="点击预览" :src="getImgFullUrl(record.fullFileName)" />
            </div>
          </template>
          <template v-else>
            {{ record[column.key] }}
          </template>
        </template>
      </BTable>
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
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  const bookmark = bookmarkStore();
  const imgOptions = [
    { label: '使用中', value: 'usedImages' },
    { label: '已失效', value: 'unUsedImages' },
  ];

  const imageColumns = computed(() => {
    return [
      {
        title: '图片',
        key: 'img',
      },
      {
        title: '名称',
        key: 'name',
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
  function getImgFullUrl(fullFileName) {
    return `https://boluo66.top/uploads/${fullFileName}`;
  }
  onMounted(() => {
    searchApiImage();
  });
</script>

<style lang="less" scoped>
  :deep(.ant-select-dropdown-placement-topLeft) {
    min-width: 100px !important;
    transition: none !important;
  }
  :deep(.ant-select-selector .ant-select-selection-item) {
    background-color: unset !important;
    transition: none !important;
  }
</style>
