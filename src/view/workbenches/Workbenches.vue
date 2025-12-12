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
    <div class="flex-align-center-gap" style="height: 324px; flex: 1; flex-grow: 0">
      <CommonDataTable :tableData="tableData" />
      <UpdateLogList />
    </div>
    <div style="flex: 1" class="card-container flex-center"> 敬请期待... </div>
  </div>
</template>

<script lang="ts" setup>
  import BookmarkDistribution from '@/components/workbenches/BookmarkDistribution.vue';
  import PlatformOverview from '@/components/workbenches/dataCard/WorkTagCard.vue';
  import WorkBookmarkCard from '@/components/workbenches/dataCard/WorkBookmarkCard.vue';
  import { computed, onMounted, reactive, ref, watch } from 'vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import WorkNoteCard from '@/components/workbenches/dataCard/WorkNoteCard.vue';
  import WorkCloudSpaceCard from '@/components/workbenches/dataCard/WorkCloudSpaceCard.vue';
  import useUser from '@/store/useUser.ts';
  import UpdateLogList from '@/components/workbenches/UpdateLogList.vue';
  import BeginnerGuide from '@/components/workbenches/BeginnerGuide.vue';
  import NoteDistribution from '@/components/workbenches/NoteDistribution.vue';
  import CommonDataTable from '@/components/workbenches/CommonDataTable.vue';

  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const user = useUser();
  const readyObj = reactive({
    tagReady: false,
    noteReady: false,
  });
  const tableData = ref([]);
  function init() {
    readyObj.tagReady = false;
    readyObj.noteReady = false;
    fetchTagList();
    fetchBookmarkList();
    fetchNoteList();
    fetchCommonBookmarks();
    cloud.queryFieldList();
  }

  // 获取标签列表
  function fetchTagList() {
    apiQueryPost('/api/bookmark/queryTagList', {
      filters: { userId: user.id },
    })
      .then((res) => {
        if (res.status === 200) {
          bookmark.tagList = res.data;
          readyObj.tagReady = true;
        }
      })
       .catch(() => {});
  }

  // 获取书签列表
  function fetchBookmarkList() {
    apiQueryPost('/api/bookmark/getBookmarkList', {
      filters: { userId: user.id, type: 'all' },
    })
      .then((res) => {
        if (res.status === 200) {
          bookmark.bookmarkList = res.data.items;
        }
      })
      .catch(() => {});
  }

  // 获取笔记列表
  function fetchNoteList() {
    apiBasePost('/api/note/queryNoteList')
      .then((res) => {
        if (res.status === 200) {
          bookmark.noteList = res.data;
          readyObj.noteReady = true;
        }
      })
      .catch(() => {
        readyObj.noteReady = true;
      });
  }

  // 获取常用书签
  function fetchCommonBookmarks() {
    apiBasePost('/api/bookmark/getCommonBookmarks')
      .then((res) => {
        if (res.status === 200 && Array.isArray(res.data.items)) {
          tableData.value = res.data.items.map((item, index) => ({ ...item, index: index + 1 }));
        } else {
          tableData.value = [];
        }

      })
      .catch(() => {
        tableData.value = [];
      });
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
