<template>
  <AdminDataPage
    eyebrow="Admin / Media"
    title="图片管理"
    subtitle="管理系统中的图片资源与失效文件"
    toolbar-hint="支持文件名搜索 · 选择类型查看不同状态的图片"
    :summary-count="imageTotal"
  >
    <template #toolbar>
      <b-input v-model:value="searchValue" placeholder="搜索文件名" class="log-search-input" @input="handleSearch">
        <template #prefix>
          <svg-icon :src="icon.navigation.search" size="16" />
        </template>
      </b-input>
      <BSelect class="image-mg__type-select" :options="imgOptions" v-model:value="imgType" @change="onTypeChange" />
      <BButton
        type="danger"
        :loading="clearing"
        :disabled="clearing || loading || !imageTotal"
        @click="clearApiImages"
      >
        清理{{ imageTotal ? ` ${imageTotal} 张` : "" }}
      </BButton>
    </template>

    <BTable
      fill
      :data="pagedImages"
      :columns="imageColumns"
      :loading="loading"
      loading-text="正在加载图片…"
      row-key="id"
      :pagination="true"
      :total="imageTotal"
      :current-page="currentPage"
      :page-size="pageSize"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'img'">
          <div class="image-mg__preview dom-hover" @click="bookmark.refreshViewer(getImgFullUrl(record.fullFileName))">
            <svg-icon size="40" title="点击预览" :src="getImgFullUrl(record.fullFileName)" />
          </div>
        </template>
      </template>
    </BTable>
  </AdminDataPage>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
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
        width: '200px',
      },
      {
        title: '名称',
        key: 'name',
        ellipsis: true,
      },
      {
        title: '类型',
        key: 'extension',
        ellipsis: true,
      },
    ];
  });

  function clearApiImages() {
    if (!imageTotal.value) return;
    const typeLabel = imgOptions.find((item) => item.value === imgType.value)?.label || imgType.value;
    Alert.alert({
      title: '确认清理',
      // 清理范围是当前所选类型的全部图片而非当前页，必须把类型与数量写进确认文案
      content: `将物理删除【${typeLabel}】下的全部 ${imageTotal.value} 张图片，不可恢复，确认继续？`,
      async onOk() {
        clearing.value = true;
        try {
          const res = await apiBasePost('/api/common/clearImages', { images: currentImages.value });
          if (res.status === 200) {
            message.success(`已清理 ${imageTotal.value} 张图片`);
            await searchApiImage();
          }
        } finally {
          clearing.value = false;
        }
      },
    });
  }

  const timer = ref();
  function handleSearch() {
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      currentPage.value = 1;
      searchApiImage();
    }, 500);
  }

  const searchValue = ref('');
  const imgType = ref('usedImages');
  const allImg = ref<Record<string, any[]>>({});
  const loading = ref(false);
  // 破坏性操作独立的进行中状态：与列表加载分开，避免搜索时误禁用清理按钮之外的判断
  const clearing = ref(false);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const currentImages = computed(() => allImg.value?.[imgType.value] ?? []);
  const imageTotal = computed(() => currentImages.value.length);
  const pagedImages = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return currentImages.value.slice(start, start + pageSize.value);
  });

  function onPageChange(page: number) {
    currentPage.value = page;
  }

  function onSizeChange(_current: number, size: number) {
    currentPage.value = 1;
    pageSize.value = size;
  }

  function onTypeChange() {
    currentPage.value = 1;
  }

  async function searchApiImage() {
    loading.value = true;
    try {
      const res = await apiBasePost('/api/common/getImages', { name: searchValue.value });
      if (res.status === 200) {
        allImg.value = res.data.items;
        const maxPage = Math.max(1, Math.ceil(imageTotal.value / pageSize.value));
        currentPage.value = Math.min(currentPage.value, maxPage);
      }
    } finally {
      loading.value = false;
    }
  }
  function getImgFullUrl(fullFileName) {
    return `https://boluo66.top/uploads/${fullFileName}`;
  }
  onMounted(() => {
    searchApiImage();
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-breakpoints.less';
  .log-search-input {
    flex: 1;
  }

  .image-mg__type-select {
    width: 120px;
  }

  .image-mg__preview {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    padding: 2px;
    border-radius: 8px;
    background: #fff;
  }

  @media (max-width: @admin-bp-desktop) {
    .log-search-input,
    .image-mg__type-select {
      width: 100%;
    }
  }
</style>
