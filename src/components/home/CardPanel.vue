<template>
  <div v-if="bookmark.bookmarkLoading" class="card-panel skeleton-panel">
    <div v-for="n in skeletonCount" :key="n" class="card-skeleton">
      <div class="skeleton-title">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-tags">
        <div class="skeleton-chip"></div>
        <div class="skeleton-chip"></div>
      </div>
    </div>
  </div>
  <VueDraggable
    v-else
    :animation="200"
    :disabled="bookmark.isMobile"
    ref="el"
    v-model="bookmark.bookmarkList"
    class="card-panel"
    id="card-panel"
    @start="onDragStart"
    @end="onEnd"
    :scroll-sensitivity="50"
    :forceFallback="true"
    :delay="50"
  >
    <div v-for="item in getBookList" :key="item.id">
      <RightMenu :menu="[$t('common.edit'), $t('common.delete')]" @select="rightMenuClick($event, item)">
        <TagCard :cardInfo="item" />
      </RightMenu>
    </div>
  </VueDraggable>
</template>

<script lang="ts" setup>
  import { VueDraggable } from 'vue-draggable-plus';
  import TagCard from '@/components/home/TagCard.vue';
  import { bookmarkStore } from '@/store';
  import { computed } from 'vue';
  import RightMenu from '@/components/base/RightMenu.vue';
  import router from '@/router';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { message } from 'ant-design-vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useI18n } from 'vue-i18n';
  const bookmark = bookmarkStore();
  const { t } = useI18n();

  const getBookList = computed(() => {
    return bookmark.bookmarkList;
  });
  const skeletonCount = computed(() => (bookmark.isMobile ? 8 : 24));

  function rightMenuClick(type, item) {
    recordOperation({ module: '首页', operation: `右键${type}书签${item.name}` });
    if (type === t('common.edit')) {
      router.push({ path: `/manage/editBookmark/${item.id}` });
    } else {
      Alert.alert({
        title: '提示',
        content: `请确认是否要删除书签【${item.name}】？`,
        onOk() {
          apiBasePost('/api/bookmark/delBookmark', {
            id: item.id,
          }).then((res) => {
            if (res.status == 200) {
              message.success('删除成功');
              bookmark.refreshData();
            }
          });
        },
      });
    }
  }
  const onDragStart = () => {
    document.body.classList.add('drag-active');
  };

  async function onEnd() {
    document.body.classList.remove('drag-active');
    try {
      const sortedTags =
        bookmark.bookmarkList.map((bookmark: any, index: number) => ({
          sort: index,
          id: bookmark.id,
        })) || [];

      await apiBasePost('/api/bookmark/updateBookmarkSort', { bookmarks: sortedTags });
    } catch (error) {
      console.error('Error updating bookmark sort:', error);
    }
  }
</script>

<style lang="less" scoped>
  .card-panel {
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    padding: 0 16px;
    gap: 20px;
    align-content: start;
  }
  .skeleton-panel {
    margin-top: 16px;
  }
  .card-skeleton {
    border: 1px solid var(--card-border-color);
    height: 150px;
    border-radius: 1rem;
    padding: 14px;
    box-sizing: border-box;
    background: var(--background-color);
    position: relative;
    overflow: hidden;
    box-shadow: var(--ant-table-boxShadow);
  }
  .card-skeleton::after {
    content: '';
    position: absolute;
    top: 0;
    left: -60%;
    width: 60%;
    height: 100%;
    background: linear-gradient(90deg, transparent, var(--skeleton-body-bg-color), transparent);
    animation: skeleton-shine 1.2s infinite;
  }
  .skeleton-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .skeleton-avatar {
    width: 24px;
    height: 24px;
    border-radius: 8px;
    background: var(--common-tag-bg-color);
  }
  .skeleton-line {
    height: 10px;
    border-radius: 6px;
    background: var(--btn-h-bg-color);
    margin-bottom: 8px;
  }
  .skeleton-line.short {
    width: 120px;
  }
  .skeleton-tags {
    display: flex;
    gap: 8px;
    position: absolute;
    bottom: 14px;
    left: 14px;
  }
  .skeleton-chip {
    width: 50px;
    height: 16px;
    border-radius: 8px;
    background: var(--btn-h-bg-color);
  }
  :global(body.drag-active) {
    .card-panel {
      cursor: grabbing;
    }
  }
  .card-panel > div {
    min-width: 0;
  }
  @keyframes skeleton-shine {
    0% {
      left: -60%;
    }
    100% {
      left: 120%;
    }
  }
  @media (max-width: 1200px) {
    .card-panel {
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
      padding: 0 12px;
    }
  }
  @media (max-width: 1000px) {
    .card-panel {
      justify-content: center;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 14px;
      padding: 0 20px;
    }
  }
  .panel-loading {
    :deep(.loading) {
      top: 40% !important;
    }
  }
</style>
