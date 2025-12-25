<template>
  <div class="workbenches-container">
    <div style="display: flex; gap: 10px; height: 350px">
      <div class="quick-jump-container card-container" style="flex: 0.5">
        <WorkTagCard />
        <WorkBookmarkCard />
        <WorkNoteCard />
        <WorkCloudSpaceCard />
      </div>

      <div class="card-container" style="flex: 1">
        <CommonDataTable
          :tableData="tableData"
          :columns="[
            {
              title: '排名',
              key: 'index',
            },
            {
              title: '书签',
              key: 'name',
              width: '400px',
            },
            {
              title: '访问次数',
              key: 'count',
            },
          ]"
        />
      </div>
    </div>
    <div class="card-container" style="height: 450px">
      <CommonDataTable :tableData="userStatsData" :columns="userStatsColumns" title="用户统计" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import WorkTagCard from '@/components/workbenches/dataCard/WorkTagCard.vue';
  import WorkBookmarkCard from '@/components/workbenches/dataCard/WorkBookmarkCard.vue';
  import { onMounted, reactive, ref, watch } from 'vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import WorkNoteCard from '@/components/workbenches/dataCard/WorkNoteCard.vue';
  import WorkCloudSpaceCard from '@/components/workbenches/dataCard/WorkCloudSpaceCard.vue';
  import useUser from '@/store/useUser.ts';
  import CommonDataTable from '@/components/workbenches/CommonDataTable.vue';
  import { useRouter } from 'vue-router';

  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const user = useUser();
  const readyObj = reactive({
    tagReady: false,
    noteReady: false,
  });
  const tableData = ref([]);
  const userStatsData = ref([]);
  const userStatsColumns = ref([
    { title: 'ID', key: 'id' },
    { title: '别名', key: 'alias' },
    { title: '邮箱', key: 'email' },
    { title: '手机号', key: 'phoneNumber' },
    { title: '注册时间', key: 'createTime' },
    { title: '书签数', key: 'bookmarkTotal' },
    { title: '笔记数', key: 'noteTotal' },
    { title: '云空间使用量 (MB)', key: 'storageUsed' },
  ]);

  const router = useRouter();
  function init() {
    if (user.role !== 'root') {
      router.push('/');
      return;
    }
    readyObj.tagReady = false;
    readyObj.noteReady = false;
    fetchTagList();
    fetchBookmarkList();
    fetchNoteList();
    fetchCommonBookmarks();
    apiBasePost('/api/user/getUserStats').then((res) => {
      if (res.status === 200) {
        userStatsData.value = res.data;
      }
    });
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
