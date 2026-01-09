<template>
  <b-loading :loading="loading">
    <div class="note-library-container">
      <div class="note-library-header" v-if="bookmark.isMobileDevice">
        <div class="header-content">
          <div class="back-icon" @click="backRouterPage">
            <SvgIcon :src="icon.noteDetail.back" />
          </div>
          <div style="font-weight: 500; font-size: 20px" @click="getIndexNoteList">{{ $t('note.title') }}</div>
        </div>
        <div class="handle-btn-group">
          <TagFilterSelector v-if="currentViewMode === 'card'" :allTags="allTags" />
          <b-button
            type="primary"
            style="border-radius: 20px"
            @click="router.push('/noteLibrary/add')"
            v-click-log="OPERATION_LOG_MAP.noteLibrary.addNote"
          >
            + {{ $t('note.newNote') }}
          </b-button>
        </div>
      </div>
      <div v-else class="flex-align-center" style="justify-content: space-between; padding: 0 20px">
        <div style="font-weight: 500; font-size: 20px; cursor: pointer" @click="getIndexNoteList">{{
          $t('note.title')
        }}</div>
        <div class="handle-btn-group">
          <template v-if="hasCheck">
            <span class="deleteText" @click="batchDeleteNote" v-click-log="OPERATION_LOG_MAP.noteLibrary.deleteNote"
              ><svg-icon :src="icon.noteDetail.delete" />{{ $t('note.deleteSelected') }}</span
            >
            <b-button type="primary" style="border-radius: 20px" @click="exitBatch">
              {{ $t('note.exitBatch') }}
            </b-button>
          </template>
          <template v-else>
            <TagFilterSelector v-if="currentViewMode === 'card'" :allTags="allTags" />
            <ViewModeToggle />
            <div
              class="search-icon flex-center dom-hover"
              :class="searchActive ? 'normal-input' : 'icon-input'"
              @click="searchActive = true"
              v-click-log="OPERATION_LOG_MAP.noteLibrary.searchNote"
              :style="{ width: searchActive ? '200px' : '32px' }"
            >
              <b-input :placeholder="searchActive ? $t('note.searchNote') : ''" v-model:value="searchValue">
                <template #prefix>
                  <svg-icon color="#cccccc" :src="icon.navigation.search" size="16" @click="focusSearchInput" />
                </template>
              </b-input>
            </div>
            <b-button
              type="primary"
              style="border-radius: 20px"
              @click="router.push('/noteLibrary/add')"
              v-click-log="OPERATION_LOG_MAP.noteLibrary.addNote"
            >
              + {{ $t('note.newNote') }}
            </b-button>
          </template>
        </div>
      </div>
      <VueDraggable
        v-if="currentViewMode === 'card'"
        :disabled="bookmark.isMobileDevice"
        :animation="200"
        v-model="noteList"
        class="note-library-body"
        @start="onStart"
        @end="onEnd"
        :scroll-sensitivity="50"
        :forceFallback="true"
        :touchStartThreshold="10"
        :delay="100"
      >
        <note-card v-for="note in viewNoteList" :note="note" @nodeTypeChange="handleNodeTypeChange" />
      </VueDraggable>
      <div v-if="currentViewMode === 'list'" class="note-library-body-list">
        <div class="tag-sidebar">
          <div class="tag-item" :class="{ active: selectedTag === null }" @click="selectTag(null)">
            {{ $t('note.allNote') }}
          </div>
          <div class="tag-item" :class="{ active: selectedTag === 'null' }" @click="selectTag('null')">
            {{ $t('note.noTagNote') }}
          </div>
          <div
            v-for="tag in allTags"
            class="tag-item"
            :class="{ active: selectedTag === tag.id }"
            @click="selectTag(tag)"
          >
            {{ tag.name }}
          </div>
        </div>
        <VueDraggable
          :disabled="bookmark.isMobileDevice"
          :animation="200"
          ref="el"
          v-model="noteList"
          class="note-list"
          @start="onStart"
          @end="onEnd"
          :scroll-sensitivity="50"
          :forceFallback="true"
          :touchStartThreshold="10"
          :delay="100"
        >
          <note-list-item v-for="note in viewNoteList" :note="note" @nodeTypeChange="handleNodeTypeChange" />
        </VueDraggable>
      </div>
    </div>
  </b-loading>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import router from '@/router';
  import { apiBasePost } from '@/http/request.ts';
  import { computed, ref, watch } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { VueDraggable } from 'vue-draggable-plus';
  import TagFilterSelector from '@/components/noteLibrary/library/TagFilterSelector.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import NoteCard from '@/components/noteLibrary/library/NoteCard.vue';
  import NoteListItem from '@/components/noteLibrary/library/NoteListItem.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { message } from 'ant-design-vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { backRouterPage } from '@/utils/common';
  import ViewModeToggle from '@/components/base/ViewModeToggle.vue';
  const bookmark = bookmarkStore();
  const noteList = ref([]);
  const loading = ref(false);
  const user = useUserStore();
  const selectedTag = computed(() => router.currentRoute.value.query.tag || null);
  const currentViewMode = computed(() => (bookmark.isMobileDevice ? 'card' : user.preferences.noteViewMode));

  init();
  async function init() {
    loading.value = true;
    const res = await apiBasePost('/api/note/queryNoteList');
    if (res.status === 200) {
      noteList.value = res.data ?? [];
      user.noteTotal = noteList.value.length;
      await getAllTags();
      loading.value = false;
    }
  }

  async function getAllTags() {
    try {
      const res = await apiBasePost('/api/note/queryNoteTagList', { userId: user.id });
      if (res.status === 200) {
        allTags.value = res.data;
      }
    } catch (error) {
      console.warn('fetchNoteTags fallback', error);
    }
  }
  function getIndexNoteList() {
    router.push('/noteLibrary');
  }

  const searchValue = ref('');
  const debouncedSearch = ref('');
  const searchTimer = ref<number | null>(null);

  const toPlainText = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  watch(
    () => searchValue.value,
    (val) => {
      if (searchTimer.value) clearTimeout(searchTimer.value);
      searchTimer.value = window.setTimeout(() => {
        debouncedSearch.value = val.trim().toLowerCase();
      }, 200);
    },
    { immediate: true },
  );

  const viewNoteList = computed(() => {
    const keyword = debouncedSearch.value;

    const filteredNotes = noteList.value.filter((note) => {
      const title = (note.title || '').toLowerCase();
      const contentText = toPlainText(note.content || '').toLowerCase();

      if (!keyword) return true;
      return title.includes(keyword) || contentText.includes(keyword);
    });

    let tagFilter = router.currentRoute.value.query.tag;

    if (tagFilter === undefined || tagFilter === null) {
      return filteredNotes;
    }

    if (tagFilter === 'null') {
      return filteredNotes.filter((note) => !note.tags || note.tags.length === 0);
    }

    return filteredNotes.filter((note) => {
      if (!note.tags) return false;
      const parsed = note.tags;
      return Array.isArray(parsed) && parsed.some((t) => t.id === tagFilter);
    });
  });

  function focusSearchInput() {
    (document.querySelector('.b-input') as HTMLInputElement)?.focus();
  }

  const allTags = ref([]);

  const hasCheck = computed(() => {
    return viewNoteList.value.some((data) => data.isCheck === true);
  });

  function exitBatch() {
    viewNoteList.value.forEach((data) => {
      data.isCheck = false;
    });
  }

  function batchDeleteNote() {
    const delIds = viewNoteList.value.filter((data) => data.isCheck).map((item) => item.id) || [];
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除所选笔记？`,
      onOk() {
        apiBasePost('/api/note/delNote', {
          ids: delIds,
        }).then(() => {
          message.success('删除成功');
          init();
        });
      },
    });
  }

  const searchActive = ref(true);

  const handleNodeTypeChange = (tag) => {
    if (tag === null) {
      router.push('/noteLibrary');
    } else {
      router.push(`/noteLibrary?tag=${tag.id}`);
    }
  };

  function selectTag(tag) {
    if (tag === null) {
      router.push('/noteLibrary');
    } else if (tag === 'null') {
      router.push('/noteLibrary?tag=null');
    } else {
      router.push(`/noteLibrary?tag=${tag.id}`);
    }
  }

  function onStart() {
    document.body.style.userSelect = 'none';
  }

  async function onEnd() {
    document.body.style.userSelect = '';
    try {
      const sortedTags =
        noteList.value.map((note: any, index: number) => ({
          sort: index,
          id: note.id,
        })) || [];

      await apiBasePost('/api/note/updateNoteSort', { notes: sortedTags });
    } catch (error) {
      console.error('Error updating note sort:', error);
    }
  }
</script>

<style lang="less" scoped>
  .note-library-container {
    padding: 20px;
    width: 100%;
    height: 100%;
    border-top: 1px solid var(--notePage-topBody-border-color);
    box-sizing: border-box;
  }

  .note-library-header {
    position: fixed;
    left: 0;
    top: 0;
    width: 100%;
    height: 60px;
    padding: 0 20px;
    box-sizing: border-box;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .header-content {
      display: flex;
      align-items: center;
      gap: 20px;
    }
  }
  .note-library-body {
    height: calc(100% - 20px);
    width: 100%;
    padding: 20px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 30px;
    overflow: auto;
    box-sizing: border-box;
    align-content: start;
  }

  .note-library-body-list {
    display: flex;
    height: calc(100% - 20px);
    width: 100%;
    padding: 20px;
    box-sizing: border-box;
    gap: 20px;
    .tag-sidebar {
      width: 220px;
      background: var(--background-color);
      border: 1px solid var(--card-border-color);
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      overflow-y: auto;
      .tag-item {
        padding: 12px 16px;
        cursor: pointer;
        border-radius: 6px;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
        color: var(--text-color);
        &:hover {
          background-color: var(--hover-bg-color, #f0f0f0);
          color: #161824;
        }
        &.active {
          background-color: #605ce5;
          color: white;
          font-weight: 600;
        }
      }
    }
    .note-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 10px;
    }
  }

  @media (min-width: 2000px) {
    .note-library-body {
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    }
  }
  .back-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    height: 30px;
    width: 30px;
    cursor: pointer;
    border: 1px solid #e8eaf2;
  }
  .handle-btn-group {
    height: 32px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .deleteText {
    display: flex;
    align-items: center;
    cursor: pointer;
    font-size: 14px;
    color: #f54e4e;
    padding: 6px 12px;
    border-radius: 6px;
    background: rgba(245, 78, 78, 0.1);
    transition: all 0.2s;
    &:hover {
      background: rgba(245, 78, 78, 0.2);
    }
  }
  .search-icon {
    overflow: hidden; // 防止因为padding变化导致动画开始时的错位问题
    height: 32px;
    width: 32px;
    border-radius: 16px;
    border-color: var(--card-border-color) !important;
    transition: all 0.3s;
    :deep(.b-input) {
      border-radius: 16px;
    }
  }
  .icon-input {
    :deep(.b-input) {
      padding: 0 !important;
      cursor: pointer;
    }
    :deep(.prefix-icon) {
      left: 8px;
    }
    :deep(.icon-base64) {
      transition: color 0.3s !important;
    }
    &:hover {
      :deep(.b-input) {
        border-color: var(--primary-color);
      }
      :deep(.icon-base64) {
        color: var(--primary-color) !important;
      }
    }
  }
</style>
