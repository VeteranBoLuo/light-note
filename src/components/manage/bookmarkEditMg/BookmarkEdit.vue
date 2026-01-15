<template>
  <div class="tag-edit-container">
    <b-loading :loading="loading">
      <div class="tag-edit-body">
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('bookmarkMg.bookmarkName') }}</span>
          <b-input v-model:value="bookmarkData.name" />
        </div>
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('bookmarkMg.bookmarkUrl') }}</span>
          <b-input v-model:value="bookmarkData.url" />
        </div>
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('bookmarkMg.relatedTag') }}</span>
          <a-select
            :listHeight="350"
            :dropdownMatchSelectWidth="false"
            mode="multiple"
            :max-tag-count="3"
            :options="tagOptions"
            :placeholder="$t('placeholder.selectPlaceholder')"
            show-search
            :filter-option="SelectionSearch"
            v-model:value="bookmarkData.relatedTags"
          />
        </div>
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('bookmarkMg.description') }}</span>
          <b-input v-model:value="bookmarkData.description">
            <template #prefix>
              <div class="generate-btn" @click="generateDescription" :class="{ loading: generatingDescription }">
                <svg-icon :src="icon.common.magicWand" :title="$t('bookmarkMg.generateDescriptionTitle')" />
              </div>
            </template>
          </b-input>
        </div>
      </div>
    </b-loading>
    <b-space class="edit-tag-footer">
      <b-button v-click-log="OPERATION_LOG_MAP.bookmarkDetail.save" type="primary" @click="submit">确定</b-button>
      <b-button @click="$router.back()">返回</b-button>
    </b-space>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { useRouter } from 'vue-router';
  import { bookmarkStore, useUserStore } from '@/store';
  import { message } from 'ant-design-vue';
  import { SelectionSearch } from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const bookmark = bookmarkStore();
  const user = useUserStore();

  const generatingDescription = ref(false);

  const bookmarkData = ref<any>({
    id: '',
    name: '',
    iconUrl: '',
    description: '',
    createTime: '',
    relatedTags: [],
  });

  getAllBookmarkList();
  getTagSelect();
  const mockData = ref<any[]>([]);
  async function getAllBookmarkList() {
    const allRes = await apiQueryPost('/api/bookmark/getBookmarkList', {
      filters: {
        userId: localStorage.getItem('userId'),
        type: 'all',
      },
    });
    if (allRes.status === 200) {
      mockData.value = allRes.data.items;
    }
  }

  const tagOptions = ref([]);

  async function getTagSelect() {
    const res = await apiQueryPost('/api/bookmark/queryTagList', {
      filters: {
        userId: user.id,
      },
    });
    if (res.status === 200) {
      bookmark.tagList = res.data;
      tagOptions.value = [];
      res.data.forEach((tag) => {
        if (tag.id !== router.currentRoute.value.params.id) {
          tagOptions.value.push({
            label: tag.name,
            value: tag.id,
          });
        }
      });
      return tagOptions.value;
    }
    return [];
  }

  function submit() {
    if (loading.value) {
      message.warning('请等待数据请求完毕');
    }
    let params = JSON.parse(JSON.stringify(bookmarkData.value));
    let url = '/api/bookmark/updateBookmark';
    if (handleType.value === 'add') {
      url = '/api/bookmark/addBookmark';
      params.userId = user.id;
    } else {
      params.iconUrl = null;
    }
    apiBasePost(url, params).then((res) => {
      if (res.status === 200) {
        message.success('保存成功');
        router.back();
      }
    });
  }

  const generateDescription = async () => {
    if (!bookmarkData.value.url) {
      message.warning('请先填写书签地址');
      return;
    }
    generatingDescription.value = true;
    try {
      const res = await apiBasePost('/api/chat/generateBookmarkDescription', {
        url: bookmarkData.value.url,
      });
      if (res.status === 200) {
        bookmarkData.value.description = res.data.description;
      }
    } finally {
      generatingDescription.value = false;
    }
  };

  const handleType = computed(() => {
    if (router.currentRoute.value.params.id === 'add' || router.currentRoute.value.params.tagId) {
      return 'add';
    }
    return 'edit';
  });

  const router = useRouter();
  const loading = ref(false);
  onMounted(async () => {
    if (handleType.value === 'add') {
      if (router.currentRoute.value.params.tagId) {
        bookmarkData.value.relatedTags = [router.currentRoute.value.params.tagId];
      }
      return;
    }
    loading.value = true;
    // 创建两个Promise，分别对应两个API调用
    const res = await apiQueryPost('/api/bookmark/getBookmarkDetail', {
      filters: {
        id: router.currentRoute.value.params?.id,
      },
    });
    bookmarkData.value = res.data;
    const tagRes = await apiQueryPost('/api/bookmark/getRelatedTag', {
      filters: {
        userId: user.id,
        id: router.currentRoute.value.params?.id,
        type: 'bookmark',
      },
    });
    bookmarkData.value.relatedTags = tagRes.data.map((data) => data.id);
    loading.value = false;
  });
</script>

<style lang="less" scoped>
  .tag-edit-container {
    height: 100%;
    width: 100%;
    padding-top: 20px;
    box-sizing: border-box;
  }

  .tag-edit-body {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .tag-attr-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 50%;
  }

  .tag-attr-label {
    white-space: nowrap;
  }

  .edit-tag-footer {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
  }

  :deep(.ant-transfer-list-header) {
    background-color: var(--background-color);
    color: var(--text-color);
  }

  :deep(.ant-input) {
    background-color: var(--background-color);
    color: var(--text-color);
    transition: none;
  }

  //:deep(.ant-select-selector) {
  //  transition: none !important;
  //}

  :deep(.ant-input-affix-wrapper) {
    transition: none;
  }

  :deep(.ant-transfer-list-search) {
    background-color: var(--background-color);
  }

  :deep(.anticon-search) {
    color: var(--text-color) !important;
  }

  :deep(.ant-btn-primary) {
    box-shadow: none;
  }

  :deep(.ant-transfer-list-content-item-text) {
    color: var(--text-color) !important;
  }

  :deep(.ant-spin-container::after) {
    background-color: unset;
  }
  :deep(.ant-btn-icon-only) {
    color: #ccc;
  }
  .generate-btn {
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition:
      background-color 0.3s,
      color 0.3s;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-color);
    &:hover {
      background-color: var(--bl-input-noBorder-hover-bg-color);
    }
    &.loading {
      animation: multiColorFade 2s ease-in-out infinite;
    }
  }
  @keyframes multiColorFade {
    0% {
      color: var(--text-color);
    }
    20% {
      color: var(--primary-color);
    }
    40% {
      color: #ff6b6b;
    }
    60% {
      color: #4ecdc4;
    }
    80% {
      color: var(--primary-color);
    }
    100% {
      color: var(--text-color);
    }
  }
  @media (max-width: 1300px) {
    .tag-attr-item {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 90%;
    }

    :deep(.ant-checkbox-group) {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }

    :deep(.ant-checkbox-group-item) {
      color: var(--text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
