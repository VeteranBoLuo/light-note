<template>
  <b-loading :loading="loading">
    <div class="note-library-container">
      <div class="note-library-header" v-if="bookmark.isMobileDevice">
        <div class="header-content">
          <div class="back-icon" @click="back">
            <SvgIcon :src="icon.noteDetail.back" />
          </div>
          <div style="font-weight: 500; font-size: 20px" @click="getIndexNoteList">{{ $t('note.title') }}</div>
        </div>
        <div class="handle-btn-group">
          <TagFilterSelector :allTags="allTags" />
          <b-button
            type="primary"
            style="border-radius: 20px"
            @click="router.push('/noteLibrary/add')"
            v-click-log="OPERATION_LOG_MAP.noteLibrary.addNote"
          >
            + {{$t('note.newNote')}}
          </b-button>
        </div>
      </div>
      <div v-else class="flex-align-center" style="justify-content: space-between; padding: 0 20px">
        <div style="font-weight: 500; font-size: 20px; cursor: pointer" @click="getIndexNoteList">{{ $t('note.title') }}</div>
        <div class="handle-btn-group">
          <template v-if="hasCheck">
            <span class="deleteText" @click="batchDeleteNote" v-click-log="OPERATION_LOG_MAP.noteLibrary.deleteNote"
              ><svg-icon :src="icon.noteDetail.delete" />删除所选</span
            >
            <b-button type="primary" style="border-radius: 20px" @click="exitBatch"> 退出批量操作 </b-button>
          </template>
          <template v-else>
            <TagFilterSelector :allTags="allTags" />
            <div
              class="search-icon flex-center dom-hover"
              :class="searchActive ? 'normal-input' : 'icon-input'"
              @click="searchActive = true"
              v-click-log="OPERATION_LOG_MAP.noteLibrary.searchNote"
              :style="{ width: searchActive ? '200px' : '32px' }"
            >
              <b-input :placeholder="searchActive ? '搜索笔记' : ''" v-model:value="searchValue">
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
              + {{$t('note.newNote')}}
            </b-button>
          </template>
        </div>
      </div>
      <VueDraggable
        :disabled="bookmark.isMobileDevice"
        :animation="200"
        ref="el"
        v-model="noteList"
        class="note-library-body"
        @end="onEnd"
      >
        <note-card v-for="note in viewNoteList" :note="note" @nodeTypeChange="handleNodeTypeChange" />
      </VueDraggable>
    </div>
  </b-loading>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import router from '@/router';
  import { apiBasePost } from '@/http/request.ts';
  import { computed, onMounted, ref, watch } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { VueDraggable } from 'vue-draggable-plus';
  import TagFilterSelector from '@/components/noteLibrary/library/TagFilterSelector.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import NoteCard from '@/components/noteLibrary/library/NoteCard.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { message } from 'ant-design-vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  const bookmark = bookmarkStore();
  const noteList = ref([]);
  const loading = ref(false);
  const user = useUserStore();
  init();
  async function init() {
    loading.value = true;
    const res = await apiBasePost('/api/note/queryNoteList');
    if (res.status === 200) {
      noteList.value = res.data ?? [];
      user.noteTotal = noteList.value.length;
      noteList.value.forEach((data) => {
        const tags = data.tags ? JSON.parse(data.tags) : null;
        if (tags) {
          tags.forEach((tag) => {
            if (!allTags.value.includes(tag)) {
              allTags.value.push(tag);
            }
          });
        }
      });
      loading.value = false;
    }
  }

  function getIndexNoteList() {
    router.push('/noteLibrary');
  }

  const searchValue = ref('');

  const viewNoteList = computed(() => {
    const filteredNotes = noteList.value.filter(
      (note) =>
        note.title.includes(searchValue.value) ||
        note.content.includes(searchValue.value) ||
        note.tags?.includes(searchValue.value),
    );
    const tag = router.currentRoute.value.query.tag;

    if (tag === undefined) {
      return filteredNotes;
    }

    if (tag === 'null') {
      return filteredNotes.filter((note) => !note.tags);
    }

    return filteredNotes.filter((note) => note.tags && JSON.parse(note.tags)?.includes(tag));
  });

  function focusSearchInput() {
    (document.querySelector('.b-input') as HTMLInputElement)?.focus();
  }

  const allTags = ref([]);

  function back() {
    if (bookmark.isMobileDevice) {
      router.push('/personCenter');
    } else {
      router.back();
    }
  }

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

  const searchActive = ref(false);

  watch(
    () => searchActive.value,
    (val) => {
      if (val) {
        document.addEventListener(
          'click',
          (e) => {
            if (!(e.target as Element).matches('.search-icon *')) {
              searchActive.value = false;
            }
          },
          true,
        );
      } else {
        document.removeEventListener(
          'click',
          (e) => {
            if (!(e.target as Element).matches('.search-icon *')) {
              searchActive.value = false;
            }
          },
          true,
        );
      }
    },
  );

  const handleNodeTypeChange = (tag) => {
    router.push(`/noteLibrary?tag=${tag}`);
  };

  async function onEnd() {
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
