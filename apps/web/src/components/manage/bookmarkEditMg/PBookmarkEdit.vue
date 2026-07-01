<template>
  <CommonContainer :title="(handleType === 'add' ? '新增' : '编辑') + '书签'">
    <b-loading :loading="loading" style='height: unset'>
      <div class="tag-edit-body">
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('bookmarkMg.bookmarkName') }}</span>
          <b-input v-model:value="bookmarkData.name" />
        </div>
        <div class="tag-attr-item">
          <div class="tag-attr-head">
            <span class="tag-attr-label">{{ $t('bookmarkMg.bookmarkUrl') }}</span>
            <BTooltip :title="$t('bookmarkMg.generateMetaDesc')">
              <button type="button" class="generate-meta-action" @click="generateBookmarkMeta" :class="{ loading: generating }">
                <svg-icon :src="icon.common.magicWand" :title="$t('bookmarkMg.generateMetaTitle')" />
                <span>{{ $t('bookmarkMg.generateMetaTitle') }}</span>
              </button>
            </BTooltip>
          </div>
          <b-input v-model:value="bookmarkData.url">
          </b-input>
        </div>
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('bookmarkMg.relatedTag') }}</span>
          <b-select
            mode="multiple"
            :max-tag-count="3"
            :options="tagOptions"
            :placeholder="$t('placeholder.selectPlaceholder')"
            :show-search="true"
            :filter-option="SelectionSearch"
            v-model:value="bookmarkData.relatedTags"
          />
        </div>
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('bookmarkMg.description') }}</span>
          <b-input v-model:value="bookmarkData.description" />
        </div>
      </div>
    </b-loading>
    <b-button
      class="container-footer-btn"
      type="primary"
      @click="submit"
      >确定</b-button
    >
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { useRouter } from 'vue-router';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { SelectionSearch } from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useBookmarkMeta } from '@/composables/useBookmarkMeta';

  const bookmark = bookmarkStore();
  const user = useUserStore();

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
        userId: user.id,
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
    }
    apiBasePost(url, params).then((res) => {
      if (res.status === 200) {
        recordOperation({
          module: '书签详情',
          operation: `${handleType.value === 'add' ? '新增' : '保存'}书签成功【${bookmarkData.value.name || bookmarkData.value.url}】`,
        });
        message.success('保存成功');
        router.back();
      }
    });
  }

  const { generating, generateBookmarkMeta } = useBookmarkMeta({
    bookmarkData,
    tagOptions,
    refreshTags: getTagSelect,
  });

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

  .tag-attr-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .generate-meta-action {
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 999px;
    transition:
      background-color 0.3s,
      color 0.3s,
      border-color 0.3s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--primary-color) 24%, var(--card-border-color));
    font-size: 12px;
    line-height: 1;
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
  @media (max-width: 1300px) {
    .tag-attr-item {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 90%;
    }

    .tag-attr-head {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
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
