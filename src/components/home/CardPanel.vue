<template>
  {{ !bookmark.isMobile }}
  <VueDraggable
    :animation="200"
    :disabled="!bookmark.isMobile"
    ref="el"
    v-model="bookmark.bookmarkList"
    class="card-panel"
    id="card-panel"
    @end="onEnd"
  >
    <div v-for="item in getBookList">
      <RightMenu :menu="['编辑', '删除']" @select="rightMenuClick($event, item)">
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
  const bookmark = bookmarkStore();

  const getBookList = computed(() => {
    return bookmark.bookmarkList;
  });

  function rightMenuClick(type, item) {
    recordOperation({ module: '首页', operation: `右键${type}书签${item.name}` });
    if (type === '编辑') {
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

  async function onEnd() {
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
    margin-top: 120px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    padding: 0 20px;
    gap: 30px;
  }
  @media (max-width: 1000px) {
    .card-panel {
      justify-content: center;
    }
  }
  .panel-loading {
    :deep(.loading) {
      top: 40% !important;
    }
  }
</style>
