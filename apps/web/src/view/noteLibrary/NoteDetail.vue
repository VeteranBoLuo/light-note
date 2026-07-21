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
        @save-as-template="saveTemplateVisible = true"
      />
      <div v-if="isOrganizingFromInbox" class="inbox-organize-banner">
        <span>{{ t('inbox.organizeEditorHint') }}</span>
        <BButton type="primary" size="small" :loading="completingInbox" @click="saveAndCompleteInbox">
          {{ t('inbox.saveAndComplete') }}
        </BButton>
      </div>
      <div class="note-body" :class="{ 'note-body--organizing': isOrganizingFromInbox }">
        <Catalog
          class="catalog-panel"
          :content="note.content"
          :note-type="note.type"
          @markdown-heading-click="scrollToMarkdownHeading"
        />
        <div class="note-body-header editor-panel">
          <div class="note-body-title n-title">
            <BInput
              v-if="bookmark.isMobile"
              class="note-title-mobile"
              height="50px"
              :disabled="readonly"
              v-model:value="note.title"
              @change="inputBlur"
              @focusout="focusout"
              :placeholder="$t('noteDetail.titlePlaceholder')"
            />
            <BInput
              v-else
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
            @markdown-rendered="refreshCatalog"
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
    <SaveTemplateModal v-if="saveTemplateVisible" v-model:visible="saveTemplateVisible" :note="note" />
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
  import SaveTemplateModal from '@/components/noteLibrary/detail/SaveTemplateModal.vue';
  import { renderNoteTemplate } from '@/utils/noteTemplate.ts';
  import { findBuiltinNoteTemplate, pickTemplateLocale } from '@/config/noteTemplates.ts';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { markNoteDraftPromoted } from '@/utils/routeViewKey';
  import { recordOperation } from '@/api/commonApi.ts';
  import { normalizeNoteContentResourceUrls } from '@/utils/common.ts';
  import { useGuestGuard } from '@/composables/useGuestGuard';
  import { useInboxOrganizer } from '@/composables/useInboxOrganizer';
  import TurndownService from 'turndown';
  const AiReply = defineAsyncComponent(() => import('@/components/noteLibrary/detail/AiReply.vue'));
  const bookmark = bookmarkStore();
  const { t, locale } = useI18n();
  const user = useUserStore();
  const { guardWrite } = useGuestGuard();
  const { isOrganizingFromInbox, completingInbox, completeInboxResource } = useInboxOrganizer();
  const DEFAULT_NOTE_TITLE = '未命名文档';
  const DEFAULT_NOTE_CONTENT = '<p><br></p>';
  // 新建笔记时必须在 Editor 子组件挂载前就按 query(显式 type 或内置模板的 type)同步定好编辑器类型:
  // 子组件挂载早于父 onMounted,若此刻仍是默认富文本(html),随后灌入的 markdown 模板正文会经 TinyMCE,
  // 其中的 `>` 等被 HTML 转义成 &gt; 再回写存库。编辑已有笔记时该初值会被加载覆盖,不受影响。
  const resolveInitialNoteType = (): 'html' | 'markdown' => {
    const query = router.currentRoute.value.query;
    if (query.type === 'markdown') return 'markdown';
    if (query.builtin) {
      const tpl = findBuiltinNoteTemplate(String(query.builtin));
      if (tpl?.type === 'markdown') return 'markdown';
    }
    return 'html';
  };
  const initialNoteType = resolveInitialNoteType();
  const note = reactive({
    id: '',
    title: DEFAULT_NOTE_TITLE,
    lastTitle: DEFAULT_NOTE_TITLE,
    content: initialNoteType === 'markdown' ? '' : DEFAULT_NOTE_CONTENT,
    createBy: '',
    type: initialNoteType,
  });
  const editorRef = ref<InstanceType<typeof Editor> | null>(null);
  const hasSwitchBackup = ref(false);
  const versionHistoryVisible = ref(false);

  type NoteType = 'html' | 'markdown';
  const normalizeNoteType = (type?: string): NoteType => (type === 'markdown' || type === 'md' ? 'markdown' : 'html');
  const normalizeLoadedContent = (content: string, rawType?: string) => {
    const normalized = normalizeNoteContentResourceUrls(content || '');
    // 早期 Markdown 笔记使用 type=md，正文实际存的是 HTML；加载时转回 Markdown 源文本。
    if (rawType !== 'md' || !/^\s*<(?:h[1-6]|p|ul|ol|blockquote|pre|div)\b/i.test(normalized)) return normalized;
    return new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    }).turndown(normalized);
  };

  // 历史版本恢复后:回写标题/正文并刷新编辑器与目录
  async function onVersionRestored(data: any) {
    if (!data) return;
    // 恢复的版本可能是不同编辑模式(md/html):模式变了直接重载,保证编辑器与内容一致(罕见路径)
    const restoredType = normalizeNoteType(data.type || note.type);
    if (restoredType !== note.type) {
      window.location.reload();
      return;
    }
    if (typeof data.title === 'string') {
      note.title = data.title;
      note.lastTitle = cloneDeep(note.title);
      syncHeaderTitle();
    }
    if (typeof data.content === 'string') {
      const content = normalizeLoadedContent(data.content, data.type);
      const applied = await editorRef.value?.replaceContentWithUndo?.(content, restoredType);
      if (!applied) {
        note.content = content;
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
  provide('applyContentFromAi', async (content: string, type: 'html' | 'markdown') => {
    const applied = await editorRef.value?.replaceContentWithUndo?.(content, type);
    if (!applied) {
      note.content = content;
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
  // 把当前笔记标题同步给 note store,供全局 AI 抽屉「@当前页面」显示真实笔记名
  // (抽屉是全局组件、拿不到详情页的响应式 note;离开笔记页后该值不再被读到,无需清理)。
  watch(
    () => note.title,
    (title) => {
      nStore.currentTitle = title || '';
    },
    { immediate: true },
  );
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

  function scrollToMarkdownHeading(index: number) {
    const heading = nStore.headings[index];
    if (!heading) return;
    editorRef.value?.scrollToMarkdownHeading?.(index, heading.sourceOffset);
  }

  // —— 模板实例化(新建时从 query 读取模板并预填标题/正文) ——
  const saveTemplateVisible = ref(false);
  let appliedTemplateName = ''; // 创建成功日志附带模板名,便于区分模板使用情况
  let templateTitleApplied = false; // 预填了标题时,isReady 后需同步桌面端 header 标题
  // 不静默回落:明确告知加载失败,让用户选择返回还是从空白继续,避免不知情下当成模板在编辑;
  // 接口非 200 与网络异常(catch)两个失败分支共用
  function promptTemplateLoadFailure() {
    Alert.alert({
      title: t('common.defaultTitle'),
      content: t('note.tplLoadFailedChoice'),
      onOk() {
        router.push('/noteLibrary');
      },
    });
  }
  async function applyTemplateFromQuery(query: Record<string, any>) {
    const isUserTemplate = Boolean(query.templateId);
    try {
      let rawTitle = '';
      let rawContent = '';
      let tplType: NoteType = note.type as NoteType;
      if (query.builtin) {
        const tpl = findBuiltinNoteTemplate(String(query.builtin));
        if (!tpl) return;
        const tplLocale = pickTemplateLocale(String(locale.value));
        rawTitle = tpl.titleTemplate[tplLocale];
        rawContent = tpl.content[tplLocale];
        tplType = tpl.type;
        appliedTemplateName = t(tpl.nameKey);
      } else if (query.templateId) {
        const res = await apiBasePost('/api/note/getNoteTemplateDetail', { id: String(query.templateId) });
        if (res.status !== 200 || !res.data) {
          promptTemplateLoadFailure();
          return;
        }
        // 默认标题优先用 titleTemplate(与模板库显示名 name 语义分离),老数据无该字段时回退 name
        rawTitle = res.data.titleTemplate || res.data.name || '';
        rawContent = res.data.content || '';
        tplType = normalizeNoteType(res.data.type);
        appliedTemplateName = res.data.name || '';
      } else {
        return;
      }
      const opts = { locale: String(locale.value) };
      note.type = tplType;
      note.content = renderNoteTemplate(rawContent, opts);
      const renderedTitle = renderNoteTemplate(rawTitle, opts).trim();
      if (renderedTitle) {
        note.title = renderedTitle;
        note.lastTitle = cloneDeep(note.title);
        templateTitleApplied = true;
      }
    } catch (e) {
      console.error('应用笔记模板失败:', e);
      // 用户模板走网络请求,异常(断网/超时)同样明确提示,不静默留在空白页;内置模板为本地常量,异常仅记录
      if (isUserTemplate) promptTemplateLoadFailure();
    }
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
          // 先登记「草稿已提升」再改地址:让 router-view key 保持不变,新建首存不重挂载编辑器子树(不闪)
          markNoteDraftPromoted(note.id as string);
          router.replace(`/noteLibrary/${note.id}`).then();
          recordOperation({
            module: '笔记',
            operation: `新建笔记成功【${note.title}】${appliedTemplateName ? `（模板：${appliedTemplateName}）` : ''}`,
          });
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
      markNoteDraftPromoted(note.id);
      router.replace(`/noteLibrary/${note.id}`).then();
    }
  }

  async function saveNote(isMsg?: boolean) {
    if (!note.title || !note.title.trim()) {
      message.warning(t('noteDetail.titleRequired'));
      return false;
    }
    if (!isMsg && !note.id && !hasNewNoteDraft()) {
      return false;
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
    return ok;
  }

  async function saveAndCompleteInbox() {
    if (!guardWrite(undefined, 'save-note') || !note.id) return;
    if (timer.value) {
      clearTimeout(timer.value);
      timer.value = null;
    }
    const saved = await saveNote(false);
    if (!saved) return;
    const completed = await completeInboxResource('note', note.id);
    if (!completed) {
      message.warning(t('inbox.completeFailed'));
      return;
    }
    recordOperation({ module: '笔记', operation: `保存并完成整理笔记【${note.title}】` });
    message.success(t('inbox.saveAndCompleteSuccess'));
    router.push('/inbox');
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
            const rawType = res.data?.type;
            Object.assign(note, {
              ...res.data,
              type: normalizeNoteType(rawType),
              content: normalizeLoadedContent(res.data?.content || '', rawType),
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
      const query = router.currentRoute.value.query;
      // 编辑器类型已在 note 初始化时按 query 同步定好(早于 Editor 挂载,避免 markdown 模板正文被富文本转义),此处只预填正文。
      // 模板预填必须先于注册 content watch:预填本身不触发自动保存,选模板后不编辑直接退出便不会创建笔记。
      applyTemplateFromQuery(query).finally(() => {
        isReady.value = true;
        if (templateTitleApplied) {
          nextTick(() => syncHeaderTitle());
        }
        watch(
          () => note.content,
          () => {
            saveFunc();
          },
        );
      });
    }
  });
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
    nStore.headings = [];
    // 离开笔记时清除「草稿已提升」登记,避免影响下一篇/新建笔记的 key 判断
    markNoteDraftPromoted(null);
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
    height: 56px;
    flex-shrink: 0;
    box-sizing: border-box;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--note-editor-header-bg);
    transition: background-color 0.18s ease;

    &:focus-within {
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 4%, var(--note-editor-header-bg));
    }

    .input-container {
      height: 100%;
    }

    .b-input {
      height: 100%;
      padding: 0 16px !important;
      border: 0 !important;
      border-radius: 0;
      outline: none;
      box-shadow: none !important;
      background: transparent !important;
      color: var(--bl-input-color);
      font-size: 21px;
      font-weight: 650;

      &:hover,
      &:focus,
      &:focus-visible {
        background: transparent !important;
      }
    }
  }
  .note-title-mobile {
    width: 100%;

    .b-input {
      border-radius: 0;
      padding: 0 15px !important;
      background: transparent !important;
      color: var(--bl-input-color);
      font-size: 25px;
      font-weight: 600;
      text-overflow: ellipsis;

      &:hover,
      &:focus,
      &:focus-visible {
        background: transparent !important;
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
  .inbox-organize-banner {
    position: fixed;
    top: 60px;
    left: 0;
    z-index: 12;
    width: 100%;
    height: 48px;
    padding: 0 20px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--desc-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
    border-bottom: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--card-border-color));
    font-size: 13px;
  }
  .note-body.note-body--organizing {
    top: 108px;
    height: calc(100% - 108px);
  }
  .catalog-panel {
    flex: 2;
    min-width: 0;
  }
  .editor-panel {
    --note-editor-header-bg: var(--w-e-toolbar-bg-color, var(--surface-panel-bg));

    flex: 10;
    min-width: 0;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--background-color);
  }

  .ai-panel {
    flex: 3;
    min-width: 310px;
    width: 0;
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
    min-height: 0;
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

  @media (max-width: 767px) {
    .editor-panel {
      border-right: 0;
      border-left: 0;
      border-radius: 0;
    }

    .note-body-header {
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }

    .note-body-title {
      height: 50px;
      width: 100%;
      padding-right: 52px;
      box-sizing: border-box;

      .b-input {
        font-size: 20px;
      }
    }
  }
</style>
