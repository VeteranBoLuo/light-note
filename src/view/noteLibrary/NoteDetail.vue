<template>
  <div class="note-container">
    <div v-show="isReady">
      <NoteHeader
        :updateTime="updateTime"
        :nodeType="nodeType"
        :readonly="readonly"
        :isStartEdit="isStartEdit"
        @focusout="titleBlur"
        :note="note"
        @del="delNote"
        @save="clickSaveNote"
        @saveTag="clickSaveNote"
      />
      <div class="note-body">
        <Catalog class="catalog-panel" :content="note.content" />
        <div class="note-body-header editor-panel">
          <div class="note-body-title n-title">
            <a-input
              :disabled="readonly"
              v-model:value="note.title"
              @change="inputBlur"
              @focusout="focusout"
              placeholder="请输入标题"
            />
          </div>
          <editor class="editor-component" v-model:content="note.content" :readonly="readonly" :note-id="note.id" />
        </div>
        <AiReply class="ai-panel" />
      </div>
    </div>
    <b-loading :loading="!isReady" style="z-index: -1" />
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, watch } from 'vue';
  import router from '@/router';
  import { cloneDeep } from 'lodash-es';
  import { apiBasePost } from '@/http/request.ts';
  import Catalog from '@/components/noteLibrary/detail/Catalog.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { message } from 'ant-design-vue';
  import { bookmarkStore, noteStore, useUserStore } from '@/store';
  import NoteHeader from '@/components/noteLibrary/detail/NoteHeader.vue';
  import Editor from '@/components/noteLibrary/detail/Editor.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import AiReply from '@/components/noteLibrary/detail/AiReply.vue';
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const note = reactive({
    id: '',
    title: '未命名文档',
    lastTitle: '未命名文档',
    content: '<p><br></p>',
    createBy: '',
  });

  provide('note', note);
  provide('triggerSave', () => saveFunc());
  provide('applyTitleFromAi', (newTitle: string) => {
    note.title = newTitle;
    note.lastTitle = cloneDeep(newTitle);
    if (!bookmark.isMobileDevice) {
      const el = document.getElementById('note-header-title');
      if (el) {
        el.innerText = newTitle;
      }
    }
  });
  const nodeType = ref<'edit' | 'add' | 'share'>('edit');

  const readonly = computed(() => {
    if (user.role === 'root') {
      return false;
    } else if (nodeType.value === 'share') {
      return true;
    } else if (nodeType.value === 'add') {
      return false;
    } else {
      return userId !== note.createBy;
    }
  });
  function inputBlur() {
    nextTick(() => {
      if (note.title && note.title !== note.lastTitle) {
        if (!bookmark.isMobileDevice) {
          document.getElementById('note-header-title').innerText = note.title;
        }
        note.lastTitle = cloneDeep(note.title);
        saveFunc();
      }
    });
  }

  function focusout() {
    if (!note.title) {
      note.title = note.lastTitle;
      if (!bookmark.isMobileDevice) {
        document.getElementById('note-header-title').innerText = note.title;
      }
      return;
    }
  }

  function titleBlur() {
    nextTick(() => {
      const title = document.getElementById('note-header-title');
      const text = title.innerText;
      if (!text || text === '\n') {
        note.title = note.lastTitle;
        title.innerText = note.lastTitle;
        return;
      }
      if (text !== note.lastTitle) {
        note.title = text;
        note.lastTitle = cloneDeep(note.title);
        saveFunc();
      }
    });
  }

  const isStartEdit = ref(false);
  const isCurrentSave = ref(false);
  const updateTime = ref('');
  function setUpdateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    updateTime.value = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  async function saveNote(isMsg?: boolean) {
    isStartEdit.value = true;
    isCurrentSave.value = true;
    const params: any = cloneDeep(note);
    delete params.lastTitle;
    let res;
    const startTime = Date.now();

    if (params.id) {
      delete params.createBy;
      delete params.updateTime;
      res = await apiBasePost('/api/note/updateNote', params);
    } else {
      res = await apiBasePost('/api/note/addNote', params);
    }
    if (res.status === 200) {
      if (res.data.id) {
        note.id = res.data.id;
        router.push(`/noteLibrary/${note.id}`).then();
      }
      const elapsedTime = Date.now() - startTime;
      const delay = Math.max(500 - elapsedTime, 0);
      setTimeout(() => {
        isStartEdit.value = false;
        timer.value = null;
        if (isMsg) {
          message.success('保存成功');
        }
        setUpdateTime();
        clearTimeout(timer.value);
      }, delay);
    }
  }

  function clickSaveNote() {
    saveFunc(true);
  }

  const timer: any = ref(null);
  function saveFunc(isMsg?: boolean) {
    if (!['admin', 'root'].includes(user.role)) {
      message.warn('没有操作权限.请登录！！！');
      return;
    }
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      saveNote(isMsg);
    }, 300);
  }

  function delNote() {
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除此笔记？`,
      onOk() {
        apiBasePost('/api/note/delNote', {
          ids: [note.id],
        }).then((res) => {
          if (res.status) {
            message.success('删除成功');
            router.push('/noteLibrary');
          }
        });
      },
    });
  }

  const handleKeyDown = (event) => {
    // 检查是否按下了ctrl+s
    if (event.ctrlKey && event.key === 's') {
      event.preventDefault(); // 阻止默认的保存行为
      saveFunc(true);
    }
  };

  function back() {
    if (nodeType.value === 'add') {
      router.push('/noteLibrary');
    } else if (nodeType.value === 'share') {
      router.push('/home');
    } else {
      router.back();
    }
  }
  const userId = localStorage.getItem('userId');
  const isReady = ref(true);
  const a = ref();
  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
    if (router.currentRoute.value.params.id !== 'add') {
      isReady.value = false;
      apiBasePost('/api/note/getNoteDetail', {
        id: router.currentRoute.value.params.id,
      })
        .then((res) => {
          if (res.status === 200) {
            Object.assign(note, res.data);
            note.lastTitle = cloneDeep(note.title);
            if (!bookmark.isMobileDevice) {
              document.getElementById('note-header-title').innerText = note.title;
            }
            updateTime.value = res.data?.updateTime ?? res.data?.createTime;
          }
        })
        .finally(() => {
          isReady.value = true;
          if (userId !== note.createBy) {
            nodeType.value = 'share';
            const observer = new MutationObserver(() => {
              const el: any = document.querySelector('.tox-editor-header');
              if (el) {
                el.style.display = 'none';
                observer.disconnect();
              }
            });
            const config = { childList: true, subtree: true };
            observer.observe(document.body, config);
          }
          watch(
            () => note.content,
            () => {
              saveFunc();
            },
          );
        });
    } else {
      isReady.value = true;
      nodeType.value = 'add';
      saveFunc();
      watch(
        () => note.content,
        () => {
          saveFunc();
        },
      );
    }
  });
  const nStore = noteStore();
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
    nStore.headings = [];
  });
</script>

<style lang="less">
  .note-container {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    position: fixed !important;
    top: 0 !important;
    display: flex;
    flex-direction: column;
  }
  .note-body-title {
    .ant-input {
      height: 50px;
      padding: 0 15px;
      display: flex;
      align-items: center;
      border-radius: 0;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.1s linear;
      background-color: var(--bl-input-bg-color);
      color: var(--bl-input-color);
      font-weight: 600;
      border: none;
      box-shadow: unset !important;
      font-size: 25px;
      &:focus {
        border: none;
      }
    }
  }
  .note-body {
    display: flex;
    padding: 20px;
    flex-direction: row;
    gap: 20px;
    box-sizing: border-box;
    height: calc(100% - 60px);
    position: fixed;
    top: 60px;
    width: 100%;
  }
  .catalog-panel {
    flex: 0 0 240px;
    min-width: 200px;
    max-width: 280px;
  }
  .editor-panel {
    flex: 1 1 auto;
    min-width: 480px;
  }
  .editor-component {
    flex: 1 1 auto;
    min-height: 0;
  }
  .ai-panel {
    flex: 0 0 320px;
    min-width: 280px;
    max-width: 360px;
  }
  .back-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 50%;
    height: 30px;
    width: 30px;
    cursor: pointer;
    border: 1px solid #e8eaf2;
    transition: border-color 0.1s linear;
    &:hover {
      border-color: var(--primary-color);
    }
  }
  .note-body-header {
    height: calc(100% - 80px);
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .tag-container {
    padding-left: 15px;
    .note-tag {
      height: 20px;
      box-sizing: border-box;
      cursor: pointer;
      line-height: 16px;
      width: max-content;
      color: #9395ab;
      font-size: 12px;
      font-weight: 550;
      padding: 2px 6px;
      background-color: #edeff5;
      border-radius: 4px;
    }
  }
  @media (max-width: 1920px) {
    .note-body-header {
      min-width: 1160px;
    }
  }
  @media (max-width: 1000px) {
    .note-body-header {
      width: 90%;
      min-width: unset;
    }
    .note-body {
      flex-direction: column;
    }
    .catalog-panel,
    .ai-panel {
      flex: 0 0 auto;
      max-width: 100%;
    }
  }
</style>
