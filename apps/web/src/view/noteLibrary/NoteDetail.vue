<template>
  <div class="note-container">
    <div v-if="isReady">
      <NoteHeader
        :updateTime="updateTime"
        :nodeType="nodeType"
        :readonly="readonly"
        :isStartEdit="isStartEdit"
        @focusout="titleBlur"
        :note="note"
        :note-type="note.type"
        :has-backup="hasSwitchBackup"
        @del="delNote"
        @save="clickSaveNote"
        @switch-mode="triggerEditorSwitch"
        @undo-switch="triggerEditorUndo"
        @history="versionHistoryVisible = true"
      />
      <div class="note-body">
        <Catalog class="catalog-panel" :content="note.content" :note-type="note.type" />
        <div class="note-body-header editor-panel">
          <div class="note-body-title n-title">
            <a-input
              :disabled="readonly"
              v-model:value="note.title"
              @change="inputBlur"
              @focusout="focusout"
              :placeholder="$t('noteDetail.titlePlaceholder')"
            />
          </div>
          <editor
            ref="editorRef"
            class="editor-component"
            v-model:content="note.content"
            :type="note.type"
            @update:type="note.type = $event"
            @switch-backup-change="hasSwitchBackup = $event"
            :readonly="readonly"
            :note-id="note.id"
            :ensure-note-id="ensureNoteId"
            @set-note-id="onEditorSetNoteId"
            @ready="refreshCatalog"
          />
        </div>
        <AiReply class="ai-panel" v-if="!bookmark.isMobile" />
      </div>
    </div>
    <b-loading :loading="!isReady" style="z-index: -1" />
    <NoteVersionHistory
      v-if="versionHistoryVisible"
      v-model:visible="versionHistoryVisible"
      :note-id="note.id"
      :note-type="note.type"
      @restored="onVersionRestored"
    />
  </div>
</template>

<script lang="ts" setup>
  import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, provide, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import { cloneDeep } from 'lodash-es';
  import { apiBasePost } from '@/http/request.ts';
  import Catalog from '@/components/noteLibrary/detail/Catalog.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { bookmarkStore, noteStore, useUserStore } from '@/store';
  import NoteHeader from '@/components/noteLibrary/detail/NoteHeader.vue';
  import Editor from '@/components/noteLibrary/detail/Editor.vue';
  import NoteVersionHistory from '@/components/noteLibrary/detail/NoteVersionHistory.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import { normalizeNoteContentResourceUrls } from '@/utils/common.ts';
  import { useGuestGuard } from '@/composables/useGuestGuard';
  const AiReply = defineAsyncComponent(() => import('@/components/noteLibrary/detail/AiReply.vue'));
  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const user = useUserStore();
  const { guardWrite } = useGuestGuard();
  const DEFAULT_NOTE_TITLE = '未命名文档';
  const DEFAULT_NOTE_CONTENT = '<p><br></p>';
  const note = reactive({
    id: '',
    title: DEFAULT_NOTE_TITLE,
    lastTitle: DEFAULT_NOTE_TITLE,
    content: DEFAULT_NOTE_CONTENT,
    createBy: '',
    type: 'html',
  });
  const editorRef = ref<InstanceType<typeof Editor> | null>(null);
  const hasSwitchBackup = ref(false);
  const versionHistoryVisible = ref(false);

  // 历史版本恢复后:回写标题/正文并刷新编辑器与目录
  async function onVersionRestored(data: any) {
    if (!data) return;
    // 恢复的版本可能是不同编辑模式(md/html):模式变了直接重载,保证编辑器与内容一致(罕见路径)
    if (data.type && data.type !== note.type) {
      window.location.reload();
      return;
    }
    if (typeof data.title === 'string') {
      note.title = data.title;
      note.lastTitle = cloneDeep(note.title);
      syncHeaderTitle();
    }
    if (typeof data.content === 'string') {
      const html = normalizeNoteContentResourceUrls(data.content);
      const applied = await editorRef.value?.replaceContentWithUndo?.(html);
      if (!applied) {
        note.content = html;
      }
    }
    setUpdateTime();
    nextTick(() => refreshCatalog());
  }

  function triggerEditorSwitch() {
    // Editor.vue 的 triggerModeSwitch 会自己处理 Alert 确认
    if (editorRef.value?.triggerModeSwitch) {
      editorRef.value.triggerModeSwitch();
    }
  }

  function triggerEditorUndo() {
    if (editorRef.value?.triggerUndoSwitch) {
      editorRef.value.triggerUndoSwitch();
    }
  }

  provide('note', note);
  provide('triggerSave', () => saveFunc());
  provide('applyTitleFromAi', (newTitle: string) => {
    note.title = newTitle;
    note.lastTitle = cloneDeep(newTitle);
    syncHeaderTitle();
  });
  provide('focusEditorToEnd', () => {
    editorRef.value?.focusToEnd?.();
  });
  provide('applyContentFromAi', async (html: string) => {
    const applied = await editorRef.value?.replaceContentWithUndo?.(html);
    if (!applied) {
      note.content = html;
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
      return user.id !== note.createBy;
    }
  });
  function inputBlur() {
    nextTick(() => {
      if (note.title && note.title !== note.lastTitle) {
        syncHeaderTitle();
        note.lastTitle = cloneDeep(note.title);
        saveFunc();
      }
    });
  }

  function focusout() {
    if (!note.title) {
      note.title = note.lastTitle;
      syncHeaderTitle();
      return;
    }
  }

  function titleBlur() {
    nextTick(() => {
      const title = document.getElementById('note-header-title');
      if (!title) return;
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
  const nStore = noteStore();
  async function syncHeaderTitle() {
    if (bookmark.isMobile) return;
    await nextTick();
    const title = document.getElementById('note-header-title');
    if (title) {
      title.innerText = note.title;
    }
  }

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

  function isBlankNoteContent(content?: string) {
    const wrap = document.createElement('div');
    wrap.innerHTML = content || '';
    const text = (wrap.textContent || '').replace(/\u00a0/g, '').trim();
    if (text) return false;
    return !wrap.querySelector('img, video, audio, iframe, table, input, canvas, pre, blockquote');
  }

  function hasNewNoteDraft() {
    return note.title.trim() !== DEFAULT_NOTE_TITLE || !isBlankNoteContent(note.content);
  }

  function refreshCatalog() {
    nStore.generateTOC(note.content, note.type);
  }

  // 守卫式创建：同一时刻只允许一次"新建笔记"请求在途。
  // 新建笔记时若并发触发（自动保存 + 粘贴图片同时想建），都复用这一个 Promise，绝不会建出多条。
  // 建成后写回 note.id，之后一律走 updateNote。
  let createPromise: Promise<string> | null = null;
  function createNote(): Promise<string> {
    if (note.id) return Promise.resolve(note.id);
    if (createPromise) return createPromise;
    const params: any = cloneDeep(note);
    delete params.lastTitle;
    if (!params.title || !params.title.trim()) {
      params.title = '未命名文档';
    }
    createPromise = apiBasePost('/api/note/addNote', params)
      .then((res) => {
        if (res.status === 200 && res.data?.id) {
          note.id = res.data.id;
          note.createBy = user.id;
          if (!note.title || !note.title.trim()) {
            note.title = params.title;
          }
          nodeType.value = 'edit';
          router.replace(`/noteLibrary/${note.id}`).then();
          recordOperation({ module: '笔记', operation: `新建笔记成功【${note.title}】` });
          return note.id as string;
        }
        throw new Error('创建笔记失败');
      })
      .finally(() => {
        createPromise = null;
      });
    return createPromise;
  }
  // 供编辑器在“新建笔记还没 id 就粘贴图片”时调用：先确保笔记已创建，返回其 id，让图片带真实 noteId 上传
  async function ensureNoteId(): Promise<string> {
    if (note.id) return note.id;
    return await createNote();
  }
  // 兜底：编辑器若从后端拿回 noteId（历史自动建笔记逻辑），本地还没 id 时采纳它，避免各建各的
  function onEditorSetNoteId(id: string) {
    if (id && !note.id) {
      note.id = id;
      note.createBy = user.id;
      nodeType.value = 'edit';
      router.replace(`/noteLibrary/${note.id}`).then();
    }
  }

  async function saveNote(isMsg?: boolean) {
    if (!note.title || !note.title.trim()) {
      message.warning(t('noteDetail.titleRequired'));
      return;
    }
    if (!isMsg && !note.id && !hasNewNoteDraft()) {
      return;
    }
    isStartEdit.value = true;
    isCurrentSave.value = true;
    const startTime = Date.now();
    let ok = false;

    if (note.id) {
      const params: any = cloneDeep(note);
      delete params.lastTitle;
      delete params.createBy;
      delete params.updateTime;
      const res = await apiBasePost('/api/note/updateNote', params);
      ok = res.status === 200;
      if (ok && isMsg) {
        recordOperation({ module: '笔记', operation: `保存笔记成功【${note.title}】` });
      }
    } else {
      // 新建统一走守卫式创建（与粘贴图片共用同一个在途 Promise，绝不并发建多条）
      try {
        await createNote();
        ok = !!note.id;
      } catch {
        ok = false;
      }
    }

    if (ok) {
      const elapsedTime = Date.now() - startTime;
      const delay = Math.max(500 - elapsedTime, 0);
      setTimeout(() => {
        isStartEdit.value = false;
        timer.value = null;
        if (isMsg) {
          message.success(t('common.saveSuccess'));
        }
        setUpdateTime();
        clearTimeout(timer.value);
      }, delay);
    }
  }

  function clickSaveNote(flag?: boolean) {
    saveFunc(flag);
  }

  const timer: any = ref(null);
  function saveFunc(isMsg?: boolean) {
    if (!guardWrite(undefined, 'save-note')) {
      return;
    }
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      saveNote(isMsg);
    }, 500);
  }

  function delNote() {
    if (!guardWrite(undefined, 'delete-note')) {
      return;
    }
    Alert.alert({
      title: t('common.defaultTitle'),
      content: t('noteDetail.deleteConfirm'),
      onOk() {
        apiBasePost('/api/note/delNote', {
          ids: [note.id],
        }).then((res) => {
          if (res.status) {
            message.success(t('common.deleteSuccess'));
            recordOperation({ module: '笔记', operation: `删除笔记成功【${note.title}】` });
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
  const isReady = ref(false);
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
            Object.assign(note, {
              ...res.data,
              content: normalizeNoteContentResourceUrls(res.data?.content || ''),
            });
            note.lastTitle = cloneDeep(note.title);
            updateTime.value = res.data?.updateTime ?? res.data?.createTime;
          }
        })
        .finally(async () => {
          isReady.value = true;
          await syncHeaderTitle();
          if (user.id !== note.createBy) {
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
      nodeType.value = 'add';
      // 从 query 读取类型，默认 html
      const qType = router.currentRoute.value.query.type;
      note.type = qType === 'markdown' ? 'markdown' : 'html';
      if (note.type === 'markdown') {
        note.content = '';
      }
      isReady.value = true;
      watch(
        () => note.content,
        () => {
          saveFunc();
        },
      );
    }
  });
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
    min-width: 0;
  }
  .catalog-panel {
    flex: 2;
    min-width: 0;
  }
  .editor-panel {
    flex: 10;
    min-width: 0;
  }

  .ai-panel {
    /* 固定宽度:不随 AI 回答内容伸缩,避免挤压左侧笔记区(内容在面板内部换行/滚动) */
    flex: 0 0 340px;
    width: 340px;
    min-width: 340px;
    max-width: 340px;
  }
  .editor-component {
    flex: 1 1 auto;
    min-height: 0;
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
    display: flex;
    flex-direction: column;
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

  @media (max-width: 1024px) {
    .note-body {
      padding: 0;
    }
    .note-body-header {
      width: calc(100% - 40px);
    }
    .catalog-panel {
      flex: unset !important;
      width: 0;
      min-width: none !important;
    }
    #editor-toolbar .tox-toolbar {
      flex-wrap: nowrap !important;
      overflow-x: auto;
    }
  }
</style>
