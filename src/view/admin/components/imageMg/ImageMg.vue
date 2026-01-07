<template>
  <div class="admin-panel-container">
    <section class="admin-panel image-mg__panel">
      <header class="admin-header image-mg__header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Media</p>
          <h2 class="admin-title">图片管理</h2>
          <p class="admin-subtitle">管理系统中的图片资源</p>
        </div>
      </header>

      <ul class="admin-stats">
        <li v-for="card in statCards" :key="card.label" class="admin-stat-card">
          <span class="admin-stat-label image-mg__stat-label">{{ card.label }}</span>
          <strong class="admin-stat-value image-mg__stat-value">{{ card.value }}</strong>
          <span class="admin-stat-hint image-mg__stat-hint">{{ card.hint }}</span>
        </li>
      </ul>

      <div class="admin-filters">
        <div class="admin-filters-main">
          <b-input v-model:value="searchValue" placeholder="文件名" class="log-search-input" @input="handleSearch">
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
          <a-select style="width: 100px" :options="imgOptions" v-model:value="imgType" />
          <b-button @click="clearApiImages" type="primary">清理</b-button>
        </div>
        <span class="admin-filters-hint">支持文件名搜索 · 选择类型查看不同状态的图片</span>
      </div>

      <div class="admin-table-card">
        <a-table
          :data-source="allImg[imgType]"
          :columns="imageColumns"
          row-key="id"
          :scroll="{ y: 430 }"
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
                <svg-icon size="40" title="点击预览" :src="getImgFullUrl(record.fullFileName)" />
              </div>
            </template>
          </template>
        </a-table>
      </div>
    </section>
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
  const statCards = computed(() => {
    const totalValue = allImg.value?.[imgType.value]?.length ?? 0;
    return [
      {
        label: '总图片数',
        value: totalValue,
        hint: '累计',
      },
    ];
  });

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
  @import '@/assets/css/admin-manage.less';

  .log-search-input {
    flex: 1;
  }

  .image-mg__footer {
    margin-top: 12px;
    display: flex;
    justify-content: center;
  }

  @media (max-width: 960px) {
    .image-mg__filters-main {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
