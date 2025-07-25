<template>
  <div class="workbenches-container">
    <div style="display: flex; gap: 10px; height: 184px">
      <div class="quick-jump-container card-container" style="flex: 0.5">
        <div class="flex-align-center" style="justify-content: space-between">
          <PlatformOverview />
          <WorkBookmarkCard />
        </div>
        <div class="flex-align-center" style="justify-content: space-between">
          <WorkNoteCard />
          <WorkCloudSpaceCard />
        </div>
      </div>
<!--      <div class="flex-align-center-gap card-container" style="flex: 1">-->
<!--        <CommonFunctions />-->
<!--      </div>-->
      <div class="card-container" style="flex: 1">
        <BeginnerGuide />
      </div>
    </div>
    <div class="flex-align-center-gap" style="height: 305px; flex-shrink: 0">
      <BookmarkDistribution :isReady="readyObj.tagReady" style="flex: 1" />
      <NoteDistribution :isReady="readyObj.noteReady" style="flex: 1" />
    </div>
    <UpdateLogList style="height: 324px;width: calc(50% - 5px)" />
    <div style="flex: 1" class="card-container flex-center"> 敬请期待... </div>
  </div>
</template>

<script lang="ts" setup>
  import BookmarkDistribution from '@/components/workbenches/BookmarkDistribution.vue';
  import PlatformOverview from '@/components/workbenches/dataCard/WorkTagCard.vue';
  import WorkBookmarkCard from '@/components/workbenches/dataCard/WorkBookmarkCard.vue';
  import { computed, onMounted, reactive, watch } from 'vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import WorkNoteCard from '@/components/workbenches/dataCard/WorkNoteCard.vue';
  import WorkCloudSpaceCard from '@/components/workbenches/dataCard/WorkCloudSpaceCard.vue';
  import useUser from '@/store/useUser.ts';
  import UpdateLogList from '@/components/workbenches/UpdateLogList.vue';
  import BeginnerGuide from '@/components/workbenches/BeginnerGuide.vue';
  import NoteDistribution from '@/components/workbenches/NoteDistribution.vue';

  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const user = useUser();
  const readyObj = reactive({
    tagReady: false,
    noteReady: false,
  });
  function init() {
    readyObj.tagReady = false;
    readyObj.noteReady = false;
    apiQueryPost('/api/bookmark/queryTagList', {
      filters: { userId: user.id },
    }).then((res) => {
      if (res.status === 200) {
        bookmark.tagList = res.data;
        readyObj.tagReady = true;
      }
    });
    apiQueryPost('/api/bookmark/getBookmarkList', {
      filters: { userId: user.id, type: 'all' },
    }).then((res) => {
      if (res.status === 200) {
        bookmark.bookmarkList = res.data.items;
      }
    });
    apiBasePost('/api/note/queryNoteList').then((res) => {
      if (res.status === 200) {
        bookmark.noteList = res.data;
        readyObj.noteReady = true;
      }
    });
    cloud.queryFieldList();
  }
  onMounted(() => {
    init();
  });

  watch(
    () => user.id,
    (val) => {
      if (val) {
        init();
      }
    },
  );
</script>

<style lang="less" scoped>
  .workbenches-container {
    height: 100%;
    width: 100%;
    padding: 20px;
    gap: 10px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  .quick-jump-container {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 20px;
    flex: 1;
  }
  .card-container {
    padding: 12px;
    border-radius: 12px;
    box-sizing: border-box;
    box-shadow:
      0 0 5px 0 rgba(0, 0, 0, 0.02),
      0 2px 10px 0 rgba(0, 0, 0, 0.06),
      0 0 1px 0 rgba(0, 0, 0, 0.3);
    background-color: var(--menu-body-bg-color);
  }
</style>
