<template>
  <PhoneListMg
    :loading="loading"
    :list-data="tableData"
    :title="$t('bookmarkMg.title')"
    :subtitle="$t('bookmarkMg.subtitle')"
    @add="router.push('/manage/editBookmark/add')"
  >
    <template #item="{ data }">
      <div class="bookmark-item-main">
        <div class="bookmark-item-title">
          <BookmarkFavicon :bookmark-id="data.id" :src="data.iconUrl" :size="20" :tile-size="28" />
          <span class="bookmark-item-name">{{ data.name }}</span>
        </div>
        <div v-if="data.hasSnapshot || data.hasSummary" class="bm-badges">
          <BookmarkCapabilityBadge
            v-if="data.hasSnapshot"
            type="snapshot"
            :label="$t('bookmarkMg.badgeArchived')"
            :tooltip="$t('bookmarkMg.badgeArchivedHint')"
            @click="openSnap(data.id)"
            v-click-log="OPERATION_LOG_MAP.bookmarkMg.viewSnapshot"
          />
          <BookmarkCapabilityBadge
            v-if="data.hasSummary"
            type="summary"
            :label="$t('bookmarkMg.badgeSummary')"
            :tooltip="$t('bookmarkMg.badgeSummaryHint')"
            @click="openSnap(data.id)"
            v-click-log="OPERATION_LOG_MAP.bookmarkMg.viewSummary"
          />
        </div>
      </div>
      <div class="edit-tag-operation">
        <BActionButton
          action="edit"
          :tooltip="$t('common.edit')"
          @click="edit(data.id)"
          v-click-log="{ module: '书签管理', operation: `点击编辑图标` }"
        />
        <BActionButton action="delete" :tooltip="$t('common.delete')" @click="confirmDeleteBookmark(data)" />
      </div>
    </template>
  </PhoneListMg>
  <BookmarkSnapshotModal v-model:visible="snapVisible" :bookmark-id="snapBookmarkId" />
</template>

<script lang="ts" setup>
  import { ref } from 'vue';
  import router from '@/router';
  import BActionButton from '@/components/base/BasicComponents/BActionButton.vue';
  import BookmarkCapabilityBadge from '@/components/manage/bookmarkMg/BookmarkCapabilityBadge.vue';
  import BookmarkFavicon from '@/components/base/BookmarkFavicon.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import PhoneListMg from '@/components/base/phoneComponents/PhoneListMg.vue';
  import BookmarkSnapshotModal from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';
  import { useBookmarkManage } from '@/composables/useBookmarkManage.ts';

  const { loading, bookmarks: tableData, reloadBookmarks, confirmDeleteBookmark } = useBookmarkManage();
  // 列表角标点击 → 弹出网页正文存档 / AI 摘要(与编辑页快照同一弹框)
  const snapVisible = ref(false);
  const snapBookmarkId = ref('');
  const openSnap = (id: string) => {
    snapBookmarkId.value = id;
    snapVisible.value = true;
  };
  const edit = (id: string) => {
    router.push({ path: `/manage/editBookmark/${id}` });
  };

  reloadBookmarks();
</script>

<style lang="less" scoped>
  .bookmark-item-main {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding-right: 86px;
  }
  .bookmark-item-title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .bookmark-item-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bookmark-item-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .bm-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .bookmark-item-tag {
    max-width: 120px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 18px;
    color: var(--desc-color);
    background: var(--common-tag-bg-color);
  }
  .edit-tag-container {
    height: 100%;
    box-sizing: border-box;
    padding: 0 40px;
  }
  .edit-tag-operation {
    position: absolute;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  :deep(.list-item) {
    height: auto;
    min-height: 44px;
    padding-block: 10px;
    box-sizing: border-box;
  }
  .table-search-input {
    width: 100%;
  }
</style>
