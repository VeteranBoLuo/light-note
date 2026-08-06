<template>
  <div class="note-container" :class="{ 'note-container--mobile': bookmark.isMobile }">
    <div v-if="isReady">
      <NoteHeader
        :updateTime="updateTime"
        :readonly="readonly"
        :isStartEdit="isStartEdit || isLeaving"
        :save-status="saveStatus"
        @back="back"
        @focusout="titleBlur"
        :note="note"
        :note-type="note.type"
        :has-backup="hasSwitchBackup"
        :has-catalog="nStore.headings.length > 0"
        @del="delNote"
        @save="clickSaveNote"
        @retry-save="retryPendingSave"
        @switch-mode="triggerEditorSwitch"
        @undo-switch="triggerEditorUndo"
        @history="versionHistoryVisible = true"
        @save-as-template="saveTemplateVisible = true"
        @open-catalog="catalogDrawerOpen = true"
      />
      <div v-if="isOrganizingFromInbox" class="inbox-organize-banner">
        <span>{{ t('inbox.organizeEditorHint') }}</span>
        <BButton type="primary" size="small" :loading="completingInbox" @click="saveAndCompleteInbox">
          {{ t('inbox.saveAndComplete') }}
        </BButton>
      </div>
      <div class="note-body" :class="{ 'note-body--organizing': isOrganizingFromInbox }">
        <Catalog
          :class="{ 'catalog-panel': bookmark.isDesktop, 'is-animatable': catalogSettled }"
          :content="note.content"
          :note-type="note.type"
          :presume-headings="catalogPresumed"
          :drawer-open="catalogDrawerOpen"
          @markdown-heading-click="scrollToMarkdownHeading"
          @close="catalogDrawerOpen = false"
        />
        <div class="note-body-header editor-panel">
          <nav
            v-if="noteTreeReadEnabled && nodeType === 'edit' && detailBreadcrumb.length"
            class="note-detail-breadcrumb"
            :aria-label="t('note.currentDirectory')"
          >
            <template v-for="(item, index) in detailBreadcrumbDisplay" :key="item.key">
              <span v-if="index" class="note-detail-crumb-separator" aria-hidden="true">/</span>
              <BButton
                v-if="item.kind === 'root'"
                size="small"
                class="note-detail-crumb"
                @click="openBreadcrumbPage(null)"
              >
                {{ t('note.knowledgeRoot') }}
              </BButton>
              <span
                v-else-if="item.kind === 'ellipsis'"
                class="note-detail-crumb-ellipsis"
                :title="t('note.hiddenBreadcrumbs')"
                :aria-label="t('note.hiddenBreadcrumbs')"
              >
                …
              </span>
              <span
                v-else-if="item.id === note.id"
                class="note-detail-crumb is-current"
                :title="item.title || t('note.untitled')"
                aria-current="page"
              >
                {{ item.title || t('note.untitled') }}
              </span>
              <BButton
                v-else
                size="small"
                class="note-detail-crumb"
                :title="item.title || t('note.untitled')"
                @click="openBreadcrumbPage(item.id)"
              >
                {{ item.title || t('note.untitled') }}
              </BButton>
            </template>
          </nav>
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
            :resource-refs="resolvedResourceRefs"
            @set-note-id="onEditorSetNoteId"
            @ready="handleEditorReady"
            @markdown-rendered="refreshCatalog"
            @resource-refs-change="onEditorResourceRefsChange"
          />
          <NoteSubpageSection
            v-if="noteTreeReadEnabled && nodeType === 'edit' && note.id"
            :note-id="note.id"
            :readonly="readonly || !noteTreeWriteEnabled"
            :refresh-key="subpageRefreshKey"
            @create="createChildPage"
            @attach="openAttachPages"
            @move-self="openMoveSelf"
            @open="openSubpage"
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
      :current-note="note"
      @restored="onVersionRestored"
    />
    <SaveTemplateModal v-if="saveTemplateVisible" v-model:visible="saveTemplateVisible" :note="note" />
    <NoteAttachPagesModal
      v-if="noteTreeWriteEnabled && note.id"
      v-model:visible="attachPagesVisible"
      :target-note="{ id: note.id, title: note.title }"
      @attached="handlePagesAttached"
    />
    <NoteMoveModal
      v-if="noteTreeWriteEnabled && note.id"
      v-model:visible="moveSelfVisible"
      :note="moveSelfNote"
      @moved="handleSelfMoved"
    />
  </div>
</template>

<script lang="ts" setup>
  import {
    computed,
    defineAsyncComponent,
    h,
    nextTick,
    onMounted,
    onUnmounted,
    provide,
    reactive,
    ref,
    watch,
  } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
  import router from '@/router';
  import { cloneDeep } from 'lodash-es';
  import { apiBasePost } from '@/http/request.ts';
  import Catalog from '@/components/noteLibrary/detail/Catalog.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { bookmarkStore, noteStore, useUserStore } from '@/store';
  import { contentLikelyHasHeadings } from '@/store/note';
  import NoteHeader from '@/components/noteLibrary/detail/NoteHeader.vue';
  import Editor from '@/components/noteLibrary/detail/Editor.vue';
  import NoteVersionHistory from '@/components/noteLibrary/detail/NoteVersionHistory.vue';
  import NoteSubpageSection from '@/components/noteLibrary/detail/NoteSubpageSection.vue';
  import NoteAttachPagesModal from '@/components/noteLibrary/tree/NoteAttachPagesModal.vue';
  import NoteMoveModal from '@/components/noteLibrary/tree/NoteMoveModal.vue';
  import SaveTemplateModal from '@/components/noteLibrary/detail/SaveTemplateModal.vue';
  import { renderNoteTemplate } from '@/utils/noteTemplate.ts';
  import { findBuiltinNoteTemplate, pickTemplateLocale } from '@/config/noteTemplates.ts';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { markNoteDraftPromoted } from '@/utils/routeViewKey';
  import { recordOperation } from '@/api/commonApi.ts';
  import { recordNoteTreeProductEvent } from '@/api/noteTreeTelemetry';
  import {
    DISABLED_NOTE_TREE_FEATURES,
    fetchNoteDeletePreview,
    fetchNoteTreeFeatures,
    type NoteTreeFeatures,
  } from '@/api/noteTree';
  import { normalizeNoteContentResourceUrls } from '@/utils/common.ts';
  import { useGuestGuard } from '@/composables/useGuestGuard';
  import { useInboxOrganizer } from '@/composables/useInboxOrganizer';
  import { resolveNoteResourceRefs, type ResolvedResourceReference } from '@/api/noteReferences';
  import { buildResourceHref, resourceRefKey, type ResourceRef } from '@/utils/noteResourceRefs';
  import { normalizeMarkdownBlockquoteEntities } from '@lightnote/shared';
  import { noteHtmlToMarkdown } from '@/utils/noteHtmlToMarkdown';
  import type { NoteBreadcrumbItem } from '@/types/noteTree';
  import { buildNoteBreadcrumbDisplay } from '@/utils/noteBreadcrumb';
  import { resolveNoteLibraryListPath } from '@/utils/noteDetailNavigation';
  /*
   * AI 助手面板按需加载,但 chunk 到达前若什么都不渲染,note-body 会先按「右边没有面板」
   * 分配一次宽度,等它挂上再重排一次 —— 表现为进笔记后正文和目录轻轻抖一下
   * (实测面板晚 330ms 挂载,正文宽度从 1150px 缩到 875px、左边界从 270 挪到 215)。
   *
   * 占位是个空 div,宽度全由父级 .ai-panel 决定(flex: 3 + min-width: 310px),
   * 首帧就把位置占住,组件到位后原地填充,布局自始至终不变。
   * delay: 0 不能省 —— defineAsyncComponent 默认等 200ms 才显示 loading 组件
   * (为了避免快速加载时闪一下),那样占位会迟到,等于问题只解决一半。
   */
  const AiPanelPlaceholder = { render: () => h('div', { class: 'ai-panel-skeleton' }) };
  const AiReply = defineAsyncComponent({
    loader: () => import('@/components/noteLibrary/detail/AiReply.vue'),
    loadingComponent: AiPanelPlaceholder,
    delay: 0,
  });
  const bookmark = bookmarkStore();
  const { t, locale } = useI18n();
  const user = useUserStore();
  const { guardWrite } = useGuestGuard();
  const { isOrganizingFromInbox, completingInbox, completeInboxResource } = useInboxOrganizer();
  const DEFAULT_NOTE_TITLE = t('note.untitledDoc');
  const DEFAULT_NOTE_CONTENT = '<p><br></p>';
  const routeQueryValue = (value: unknown) => {
    const raw = Array.isArray(value) ? value[0] : value;
    return String(raw ?? '').trim();
  };
  const noteLibraryFallback = () => {
    const parent = routeQueryValue(router.currentRoute.value.query.parent);
    return parent ? { path: '/noteLibrary', query: { parent } } : { path: '/noteLibrary' };
  };
  const sourceNoteLibraryPath = () => resolveNoteLibraryListPath(router.currentRoute.value.query.from);
  const detailSourceQuery = () => {
    const from = sourceNoteLibraryPath();
    return from ? { from } : {};
  };
  const returnToSourceDirectory = () => router.push(sourceNoteLibraryPath() || noteLibraryFallback());
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
    parentId: null as string | null,
  });
  const noteTreeFeatures = ref<NoteTreeFeatures>({ ...DISABLED_NOTE_TREE_FEATURES });
  const noteTreeReadEnabled = computed(() => noteTreeFeatures.value.note_tree_read);
  const noteTreeWriteEnabled = computed(() => noteTreeFeatures.value.note_tree_write);
  const noteTreeSubtreeTrashEnabled = computed(
    () => noteTreeWriteEnabled.value && noteTreeFeatures.value.note_tree_subtree_trash,
  );
  const editorRef = ref<InstanceType<typeof Editor> | null>(null);
  const hasSwitchBackup = ref(false);
  const versionHistoryVisible = ref(false);
  const catalogDrawerOpen = ref(false);
  const resolvedResourceRefs = ref<ResolvedResourceReference[]>([]);
  const detailBreadcrumb = ref<NoteBreadcrumbItem[]>([]);
  const detailBreadcrumbDisplay = computed(() => buildNoteBreadcrumbDisplay(detailBreadcrumb.value, bookmark.isMobile));
  let resourceResolveVersion = 0;
  let lastResourceRefSignature = '';
  let currentEditorResourceRefs: ResourceRef[] = [];

  async function loadNoteTreeFeatureSnapshot() {
    try {
      noteTreeFeatures.value = await fetchNoteTreeFeatures();
    } catch {
      noteTreeFeatures.value = { ...DISABLED_NOTE_TREE_FEATURES };
    }
    if (noteTreeReadEnabled.value && note.id) void loadDetailBreadcrumb(String(note.id));
  }

  const noteTreeFeaturePromise = loadNoteTreeFeatureSnapshot();

  async function resolveEditorResourceRefs(refs: ResourceRef[], force = false) {
    const normalized = refs.slice(0, 100);
    const signature = `${note.id}|${normalized.map(resourceRefKey).join('|')}`;
    if (!force && signature === lastResourceRefSignature) return;
    lastResourceRefSignature = signature;
    const request = ++resourceResolveVersion;
    if (!normalized.length) {
      resolvedResourceRefs.value = [];
      return;
    }
    // 内容改动时先清掉旧映射，避免新链接短暂套用旧资源的可用状态或标题。
    resolvedResourceRefs.value = [];
    try {
      const resolved = await resolveNoteResourceRefs(normalized);
      if (request === resourceResolveVersion) {
        resolvedResourceRefs.value = resolved;
      }
    } catch {
      if (request === resourceResolveVersion) {
        resolvedResourceRefs.value = [];
      }
    }
  }

  async function onEditorResourceRefsChange(refs: ResourceRef[]) {
    currentEditorResourceRefs = refs.slice(0, 100);
    await resolveEditorResourceRefs(currentEditorResourceRefs);
  }

  function refreshEditorResourceRefs() {
    if (document.visibilityState === 'hidden' || !currentEditorResourceRefs.length) return;
    void resolveEditorResourceRefs(currentEditorResourceRefs, true);
  }

  function handleResourceRefVisibilityChange() {
    if (document.visibilityState === 'visible') refreshEditorResourceRefs();
  }

  watch(
    () => note.id,
    () => {
      catalogDrawerOpen.value = false;
      lastResourceRefSignature = '';
      resolvedResourceRefs.value = [];
    },
  );

  type NoteType = 'html' | 'markdown';
  const normalizeNoteType = (type?: string): NoteType => (type === 'markdown' || type === 'md' ? 'markdown' : 'html');
  const normalizeLoadedContent = (content: string, rawType?: string) => {
    const raw = content || '';
    // Markdown 源文本(type='markdown')绝不能过 normalizeNoteContentResourceUrls:
    // 它用 innerHTML 往返做图片 URL 归一化,DOM 序列化会把文本节点里的 `>` 转成 `&gt;`
    // ——这是「日报模板引用块被转义」反复复发的真正根因(加载即污染显示,一保存就污染入库)。
    // md 的图片是 ![](url) 语法,DOM 方式本也处理不到,跳过无损失。老 'md' 类型正文实际存 HTML,仍需归一化。
    if (rawType !== 'md' && normalizeNoteType(rawType) === 'markdown') {
      // 已污染的历史正文也要在编辑区立即恢复为真正的 Markdown 源码；
      // 规范函数只处理语义明确的行首引用标记，不会把普通 HTML 实体整体解码。
      return normalizeMarkdownBlockquoteEntities(raw);
    }
    const normalized = normalizeNoteContentResourceUrls(raw);
    // 早期 Markdown 笔记使用 type=md，正文实际存的是 HTML；加载时转回 Markdown 源文本。
    if (rawType !== 'md' || !/^\s*<(?:h[1-6]|p|ul|ol|blockquote|pre|div)\b/i.test(normalized)) return normalized;
    return noteHtmlToMarkdown(normalized);
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
    nextTick(() => void refreshCatalog());
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
    syncHeaderTitle();
  });
  provide('focusEditorToEnd', () => {
    editorRef.value?.focusToEnd?.();
  });
  provide('applyContentFromAi', async (content: string, type: 'html' | 'markdown') => {
    const normalizedContent = type === 'markdown' ? normalizeMarkdownBlockquoteEntities(content) : content;
    const applied = await editorRef.value?.replaceContentWithUndo?.(normalizedContent, type);
    if (!applied) {
      note.content = normalizedContent;
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
    if (note.title?.trim() && note.title !== note.lastTitle) {
      void syncHeaderTitle();
      void saveImmediately();
    }
  }

  function focusout() {
    if (!note.title?.trim()) {
      note.title = note.lastTitle;
      void syncHeaderTitle();
      return;
    }
  }

  function syncDesktopTitleToNote() {
    const title = document.getElementById('note-header-title');
    if (!title) return false;
    const text = title.innerText;
    if (!text?.trim()) {
      note.title = note.lastTitle;
      title.innerText = note.lastTitle;
      return false;
    }
    if (text === note.title) return false;
    note.title = text;
    return true;
  }

  function titleBlur() {
    const titleChanged = syncDesktopTitleToNote();
    if (titleChanged || (note.title?.trim() && note.title !== note.lastTitle)) {
      void saveImmediately();
    }
  }

  const isStartEdit = ref(false);
  const saveStatus = ref<'saved' | 'pending' | 'saving' | 'offline' | 'error'>('saved');
  const isLeaving = ref(false);
  const updateTime = ref('');
  const timer = ref<ReturnType<typeof setTimeout> | null>(null);
  const SAVE_DEBOUNCE_DELAY = 500;
  let requestedSaveVersion = 0;
  let persistedSaveVersion = 0;
  let latestRequestedTitle = note.title;
  let skipSaveOnLeave = false;
  let saveQueue: Promise<boolean> = Promise.resolve(true);
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

  /*
   * 进笔记时目录那一下「闪」的两处根因,分开治:
   *
   * 一是版面。generateTOC 要等编辑器把内容铺进 DOM 才解析得出标题(富文本还带重试),
   * 那之前 headings 是空的 —— 照此渲染,正文先占满整宽,一百多毫秒后目录解析出来又把它推回去。
   * 但内容在 isReady 之前就已经拿到了,所以先按字符串粗判有没有标题(catalogPresumed),
   * 首帧就把目录该占的位置留出来,解析完成后这个预判即失效,一切以真实 headings 为准。
   *
   * 二是过渡。那 0.26s 的展开是给「编辑时新打一个标题」准备的,首屏定型不该表演一次,
   * 所以过渡等首屏解析完再开(catalogTransitionReady)。
   * 不用 requestAnimationFrame 挂这个开关:后台标签页里 rAF 不触发,
   * 在新标签打开的笔记会永远开不了过渡 —— 首帧版面既然已经摆对,这里直接开即可。
   */
  const catalogSettled = ref(false);
  const catalogPresumed = computed(() => !catalogSettled.value && contentLikelyHasHeadings(note.content, note.type));

  async function refreshCatalog() {
    await nStore.generateTOC(note.content, note.type);
    catalogSettled.value = true;
  }

  async function handleEditorReady() {
    // 不 await:目录解析最长要等 6 次重试，focusRef 定位不该被它拖着
    void refreshCatalog();
    const raw = String(router.currentRoute.value.query.focusRef || '');
    const separator = raw.indexOf(':');
    if (separator <= 0) return;
    const href = buildResourceHref({
      type: raw.slice(0, separator) as ResourceRef['type'],
      id: raw.slice(separator + 1),
    });
    if (!href) return;
    await nextTick();
    await editorRef.value?.scrollToResourceRef?.(href);
  }

  function scrollToMarkdownHeading(index: number) {
    const heading = nStore.headings[index];
    if (!heading) return;
    editorRef.value?.scrollToMarkdownHeading?.(index, heading.sourceOffset);
  }

  const attachPagesVisible = ref(false);
  const moveSelfVisible = ref(false);
  const subpageRefreshKey = ref(0);
  const moveSelfNote = computed(() => ({
    id: note.id,
    title: note.title,
    parentId: note.parentId || detailBreadcrumb.value.at(-2)?.id || null,
  }));

  function createChildPage() {
    if (!noteTreeWriteEnabled.value || !note.id || readonly.value) return;
    router.push({
      path: '/noteLibrary/add',
      query: { type: 'html', parent: note.id, ...detailSourceQuery() },
    });
  }

  function openAttachPages() {
    if (!noteTreeWriteEnabled.value || !note.id || readonly.value) return;
    attachPagesVisible.value = true;
  }

  function handlePagesAttached() {
    attachPagesVisible.value = false;
    subpageRefreshKey.value += 1;
    void loadDetailBreadcrumb(note.id);
  }

  function openMoveSelf() {
    if (!noteTreeWriteEnabled.value || !note.id || readonly.value) return;
    moveSelfVisible.value = true;
  }

  function handleSelfMoved(result: { parentId?: string | null } | null) {
    moveSelfVisible.value = false;
    if (result && Object.prototype.hasOwnProperty.call(result, 'parentId')) {
      note.parentId = result.parentId || null;
    }
    subpageRefreshKey.value += 1;
    void loadDetailBreadcrumb(note.id);
  }

  function openNoteDetailPage(id: string) {
    if (!id) return;
    return router.push({
      path: `/noteLibrary/${encodeURIComponent(id)}`,
      query: detailSourceQuery(),
    });
  }

  function openSubpage(id: string) {
    void openNoteDetailPage(id);
  }

  function openBreadcrumbPage(pageId: string | null) {
    if (!pageId) {
      void router.push('/noteLibrary');
      return;
    }
    void openNoteDetailPage(pageId);
  }

  async function loadDetailBreadcrumb(noteId: string) {
    if (!noteTreeReadEnabled.value || !noteId) {
      detailBreadcrumb.value = [];
      return;
    }
    try {
      const response = await apiBasePost('/api/note/queryNoteBreadcrumb', { noteId }, { silent: true });
      detailBreadcrumb.value =
        response.status === 200 && Array.isArray(response.data?.items) ? response.data.items : [];
      if (detailBreadcrumb.value.length) note.parentId = detailBreadcrumb.value.at(-2)?.id || null;
    } catch {
      detailBreadcrumb.value = [];
    }
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
        returnToSourceDirectory();
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
      const renderedContent = renderNoteTemplate(rawContent, opts);
      note.content = tplType === 'markdown' ? normalizeMarkdownBlockquoteEntities(renderedContent) : renderedContent;
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
      params.title = DEFAULT_NOTE_TITLE;
    }
    createPromise = noteTreeFeaturePromise
      .then(() => {
        const parentId = noteTreeWriteEnabled.value ? routeQueryValue(router.currentRoute.value.query.parent) : '';
        if (parentId) params.parentId = parentId;
        return apiBasePost('/api/note/addNote', params);
      })
      .then((res) => {
        if (res.status === 200 && res.data?.id) {
          note.id = res.data.id;
          note.createBy = user.id;
          note.parentId = params.parentId || null;
          if (!note.title || !note.title.trim()) {
            note.title = params.title;
          }
          nodeType.value = 'edit';
          // 先登记「草稿已提升」再改地址:让 router-view key 保持不变,新建首存不重挂载编辑器子树(不闪)。
          // replace 保留原 query(type/builtin):万一组件仍被重挂(旧版本页面/共键失效),
          // resolveInitialNoteType 也能拿到 markdown,不再落回 html 打开 TinyMCE 竞态转义窗口(日报模板 &gt; 案根因)
          markNoteDraftPromoted(note.id as string);
          void loadDetailBreadcrumb(note.id as string);
          router.replace({ path: `/noteLibrary/${note.id}`, query: router.currentRoute.value.query }).then();
          recordOperation({
            module: '笔记',
            operation: `新建笔记成功【${note.title}】${appliedTemplateName ? `（模板：${appliedTemplateName}）` : ''}`,
          });
          if (params.parentId) {
            void recordNoteTreeProductEvent('note_tree_child_created', {
              surface: bookmark.isMobile ? 'mobile' : 'desktop',
              subtreeSize: 1,
              result: 'success',
            });
          }
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
      router.replace({ path: `/noteLibrary/${note.id}`, query: router.currentRoute.value.query }).then();
    }
  }

  function clearScheduledSave() {
    if (timer.value) {
      clearTimeout(timer.value);
      timer.value = null;
    }
  }

  function requestSaveVersion() {
    requestedSaveVersion += 1;
    latestRequestedTitle = note.title;
    saveStatus.value = navigator.onLine ? 'pending' : 'offline';
    return requestedSaveVersion;
  }

  async function saveNote(isMsg?: boolean) {
    if (!note.title || !note.title.trim()) {
      message.warning(t('noteDetail.titleRequired'));
      return false;
    }
    if (!isMsg && !note.id && !hasNewNoteDraft()) {
      saveStatus.value = 'saved';
      return false;
    }
    if (!navigator.onLine) {
      saveStatus.value = 'offline';
      return false;
    }
    isStartEdit.value = true;
    saveStatus.value = 'saving';
    const titleAtSave = note.title;
    let ok = false;

    try {
      if (note.id) {
        const params: any = cloneDeep(note);
        delete params.lastTitle;
        delete params.createBy;
        delete params.updateTime;
        const res = await apiBasePost('/api/note/updateNote', params);
        ok = res.status === 200;
        if (ok && isMsg) {
          recordOperation({ module: '笔记', operation: `保存笔记成功【${titleAtSave}】` });
        }
      } else {
        // 新建统一走守卫式创建（与粘贴图片共用同一个在途 Promise，绝不并发建多条）
        await createNote();
        ok = !!note.id;
      }
      if (ok) {
        // 只在服务端确认成功后才推进已保存标题，避免失败时把草稿误认为已落库。
        note.lastTitle = cloneDeep(titleAtSave);
        if (isMsg) {
          message.success(t('common.saveSuccess'));
        }
        setUpdateTime();
        saveStatus.value = 'saved';
      } else {
        saveStatus.value = 'error';
      }
    } catch (error) {
      console.error('保存笔记失败:', error);
      ok = false;
      saveStatus.value = navigator.onLine ? 'error' : 'offline';
    } finally {
      isStartEdit.value = false;
    }
    return ok;
  }

  function queueSave(version: number, isMsg?: boolean) {
    const task = saveQueue
      .catch(() => false)
      .then(async () => {
        if (version <= persistedSaveVersion) return true;
        const snapshotVersion = requestedSaveVersion;
        // 空白新建笔记没有需要落库的数据，允许直接离开，不因一次被取消的编辑而拦截用户。
        if (!isMsg && !note.id && !hasNewNoteDraft()) {
          persistedSaveVersion = Math.max(persistedSaveVersion, snapshotVersion);
          return true;
        }
        const saved = await saveNote(isMsg);
        if (saved) {
          persistedSaveVersion = Math.max(persistedSaveVersion, snapshotVersion);
        }
        return saved;
      });
    saveQueue = task;
    return task;
  }

  function saveImmediately(isMsg?: boolean) {
    if (!guardWrite(undefined, 'save-note')) {
      return Promise.resolve(false);
    }
    clearScheduledSave();
    return queueSave(requestSaveVersion(), isMsg);
  }

  async function flushPendingSave() {
    clearScheduledSave();
    let targetVersion = requestedSaveVersion;
    while (targetVersion > persistedSaveVersion) {
      const saved = await queueSave(targetVersion);
      if (!saved) return false;
      targetVersion = requestedSaveVersion;
    }
    return true;
  }

  async function saveAndCompleteInbox() {
    if (!guardWrite(undefined, 'save-note') || !note.id) return;
    const saved = await saveImmediately(false);
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
    void saveImmediately(flag);
  }

  async function retryPendingSave() {
    if (!navigator.onLine) {
      saveStatus.value = 'offline';
      return;
    }
    if (requestedSaveVersion <= persistedSaveVersion) requestSaveVersion();
    const saved = await flushPendingSave();
    if (!saved && navigator.onLine) message.error(t('noteDetail.saveFailed'));
  }

  function handleNetworkOffline() {
    if (requestedSaveVersion > persistedSaveVersion || isStartEdit.value) saveStatus.value = 'offline';
  }

  function handleNetworkOnline() {
    if (requestedSaveVersion > persistedSaveVersion) void retryPendingSave();
  }

  function saveFunc(isMsg?: boolean) {
    if (!guardWrite(undefined, 'save-note')) {
      return;
    }
    clearScheduledSave();
    const version = requestSaveVersion();
    timer.value = setTimeout(() => {
      timer.value = null;
      void queueSave(version, isMsg);
    }, SAVE_DEBOUNCE_DELAY);
  }

  async function delNote() {
    if (!guardWrite(undefined, 'delete-note')) {
      return;
    }
    if (!noteTreeSubtreeTrashEnabled.value) {
      Alert.alert({
        title: t('note.deleteOneTitle'),
        content: t('note.deleteOneConfirm', { title: note.title || t('note.untitled') }),
        okText: t('note.moveToTrash'),
        async onOk() {
          const res = await apiBasePost('/api/note/delNote', { ids: [String(note.id)] });
          if (res.status === 409 && res.data?.code === 'NOTE_HAS_CHILDREN') {
            message.warning(res.msg || t('note.deleteScopeChanged'));
            return;
          }
          if (res.status !== 200) return;
          message.success(t('common.deleteSuccess'));
          recordOperation({ module: '笔记', operation: `删除笔记成功【${note.title}】` });
          if (noteTreeReadEnabled.value) {
            void recordNoteTreeProductEvent('note_tree_subtree_deleted', {
              surface: bookmark.isMobile ? 'mobile' : 'desktop',
              depth: detailBreadcrumb.value.length,
              subtreeSize: 1,
              result: 'success',
            });
          }
          skipSaveOnLeave = true;
          clearScheduledSave();
          returnToSourceDirectory();
        },
      });
      return;
    }
    let preview;
    try {
      preview = await fetchNoteDeletePreview(note.id);
    } catch (error) {
      console.warn('[note-detail] delete preview failed', error);
      message.error(t('note.deletePreviewFailed'));
      return;
    }
    // 与笔记库卡片删除保持一致:统一"移入回收站、可恢复"口径(此前笔记详情用的是老的"确认删除/确定",没提回收站)
    Alert.alert({
      title: t('note.deleteOneTitle'),
      content: preview.descendantCount
        ? t('note.deleteSubtreeConfirm', {
            title: note.title || t('note.untitled'),
            descendants: preview.descendantCount,
          })
        : t('note.deleteOneConfirm', { title: note.title || t('note.untitled') }),
      okText:
        preview.totalCount > 1 ? t('note.moveItemsToTrash', { count: preview.totalCount }) : t('note.moveToTrash'),
      async onOk() {
        const res = await apiBasePost('/api/note/deleteNoteSubtree', {
          id: preview.id,
          expectedDescendantCount: preview.descendantCount,
        });
        if (res.status === 409 && res.data?.code === 'NOTE_TREE_DELETE_CONFLICT') {
          message.warning(t('note.deleteScopeChanged'));
          void delNote();
          return;
        }
        if (res.status !== 200) return;
        message.success(t('common.deleteSuccess'));
        const deletedCount = Number(res.data?.deletedCount || preview.totalCount);
        recordOperation({ module: '笔记', operation: `删除笔记成功【${note.title}，共${deletedCount}篇】` });
        void recordNoteTreeProductEvent('note_tree_subtree_deleted', {
          surface: bookmark.isMobile ? 'mobile' : 'desktop',
          depth: detailBreadcrumb.value.length,
          subtreeSize: deletedCount,
          result: 'success',
        });
        // 删除已在服务端成功完成，离开时不能再把排队中的旧草稿写回已删除笔记。
        skipSaveOnLeave = true;
        clearScheduledSave();
        returnToSourceDirectory();
      },
    });
  }

  const handleKeyDown = (event) => {
    // 检查是否按下了ctrl+s
    if (event.ctrlKey && event.key === 's') {
      event.preventDefault(); // 阻止默认的保存行为
      void saveImmediately(true);
    }
  };

  function captureTitleBeforeLeave() {
    if (!bookmark.isMobile) {
      syncDesktopTitleToNote();
    }
    if (!note.title?.trim()) {
      note.title = note.lastTitle;
      void syncHeaderTitle();
    }
  }

  async function persistBeforeLeave() {
    captureTitleBeforeLeave();
    // 返回发生在失焦事件之前时，主动把当前标题纳入保存队列；不能依赖事件时序。
    if (note.title?.trim() && note.title !== note.lastTitle && note.title !== latestRequestedTitle) {
      const titleSaved = await saveImmediately();
      if (!titleSaved) {
        message.error(t('noteDetail.saveFailed'));
        return false;
      }
    }
    const saved = await flushPendingSave();
    if (!saved) {
      message.error(t('noteDetail.saveFailed'));
    }
    return saved;
  }

  async function back() {
    if (isLeaving.value) return;
    isLeaving.value = true;
    const saved = await persistBeforeLeave();
    if (!saved) {
      isLeaving.value = false;
      return;
    }
    const parentId =
      nodeType.value === 'add'
        ? routeQueryValue(router.currentRoute.value.query.parent)
        : note.parentId || detailBreadcrumb.value.at(-2)?.id || '';
    if (parentId) {
      void openNoteDetailPage(parentId);
    } else if (nodeType.value === 'add' || sourceNoteLibraryPath()) {
      returnToSourceDirectory();
    } else {
      router.back();
    }
  }

  onBeforeRouteLeave(async () => {
    if (skipSaveOnLeave) return true;
    return await persistBeforeLeave();
  });

  onBeforeRouteUpdate(async (to) => {
    if (skipSaveOnLeave) return true;
    // 新建笔记首次保存时会把 /add 替换为真实 id；此时同一草稿正在完成保存，不能反向等待自己。
    if (String(to.params.id || '') === note.id) return true;
    return await persistBeforeLeave();
  });
  const isReady = ref(false);
  const a = ref();
  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleResourceRefVisibilityChange);
    window.addEventListener('focus', refreshEditorResourceRefs);
    window.addEventListener('pageshow', refreshEditorResourceRefs);
    window.addEventListener('offline', handleNetworkOffline);
    window.addEventListener('online', handleNetworkOnline);
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
            void loadDetailBreadcrumb(String(note.id));
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
    document.removeEventListener('visibilitychange', handleResourceRefVisibilityChange);
    window.removeEventListener('focus', refreshEditorResourceRefs);
    window.removeEventListener('pageshow', refreshEditorResourceRefs);
    window.removeEventListener('offline', handleNetworkOffline);
    window.removeEventListener('online', handleNetworkOnline);
    clearScheduledSave();
    nStore.headings = [];
    // 离开笔记时清除「草稿已提升」登记,避免影响下一篇/新建笔记的 key 判断
    markNoteDraftPromoted(null);
  });
</script>

<style lang="less">
  .note-container {
    --note-detail-header-height: 60px;

    width: 100%;
    height: 100%;
    box-sizing: border-box;
    position: fixed !important;
    top: 0 !important;
    display: flex;
    flex-direction: column;
  }
  .note-container--mobile {
    --note-detail-header-height: 48px;
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
  .note-detail-breadcrumb {
    min-width: 0;
    height: 30px;
    padding: 0 12px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 3px;
    overflow: hidden;
    border-bottom: 1px solid var(--surface-border-color);
    color: var(--muted-text-color, var(--desc-color));
    background: var(--surface-page-bg, var(--background-color));
    font-size: 11px;
  }

  .note-detail-crumb {
    min-width: 0;
    max-width: 180px;
    height: 22px;
    padding: 0 3px;
    display: inline-flex;
    align-items: center;
    overflow: hidden;
    color: var(--desc-color);
    border: 0 !important;
    border-radius: 4px;
    background: transparent !important;
    font-size: 11px;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover,
    &:focus-visible {
      color: var(--resource-note-color, #00a884);
      background: transparent !important;
    }

    &.is-current {
      color: var(--resource-note-color, #00a884);
      font-weight: 650;
    }
  }

  .note-detail-crumb-separator {
    flex: 0 0 auto;
    color: var(--muted-text-color, var(--desc-color));
    opacity: 0.65;
  }

  .note-detail-crumb-ellipsis {
    flex: 0 0 auto;
    padding: 0 3px;
    color: var(--muted-text-color, var(--desc-color));
    font-weight: 650;
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
    height: calc(100% - var(--note-detail-header-height));
    position: fixed;
    top: var(--note-detail-header-height);
    width: 100%;
    min-width: 0;
  }
  .inbox-organize-banner {
    position: fixed;
    top: var(--note-detail-header-height);
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
    top: calc(var(--note-detail-header-height) + 48px);
    height: calc(100% - var(--note-detail-header-height) - 48px);
  }
  .catalog-panel {
    flex: 2;
    min-width: 0;
  }

  /*
   * 目录「从无到有 / 从有到无」时平滑让出空间（新打一个标题就会触发）。
   *
   * 动 flex-grow 而不是 width：.catalog-panel 的 flex-basis 是 0%，宽度完全由 grow
   * 决定，动它编辑区会跟着连续变宽；动 width 反而要和 flex 打架。
   *
   * margin-right 抵掉 .note-body 的 20px gap——折叠到 0 宽后那道空隙还在，
   * 编辑区就还差 20px 没补上，等于问题只解决了一半。
   *
   * 挂在 .is-animatable 上而不是 .catalog-panel：进入笔记时的「空目录 → 有目录」
   * 是首屏定型，不该表演一次展开。这个类由 NoteDetail 在首屏目录落定后才加。
   */
  .catalog-panel.is-animatable {
    transition:
      flex-grow 0.26s ease,
      margin-right 0.26s ease,
      opacity 0.18s ease;
  }

  .catalog-panel.is-collapsed {
    flex-grow: 0;
    // 抵掉 .note-body 的 20px gap，否则折叠到 0 宽后编辑区还差 20px 没补上
    margin-right: -20px;
    opacity: 0;
    // 折叠过程中不要冒出滚动条(.toc-container 本身是 overflow: auto)
    overflow: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    /* 选择器要和上面等特异性，否则 .catalog-panel.is-animatable 会把这条盖掉 */
    .catalog-panel.is-animatable {
      transition: none;
    }
  }
  .editor-panel {
    --note-editor-header-bg: var(--surface-panel-bg);

    flex: 10;
    min-width: 0;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-page-bg, var(--background-color));
  }

  .ai-panel {
    flex: 3;
    min-width: 310px;
    width: 0;
  }

  /*
   * AI 面板加载期的占位。必须复刻 AiReply 内 .ai-container 的盒模型
   * (padding + border + border-box) —— flex-basis: 0% 只把 content-box 归零,
   * padding 16 + border 1 这 34px 仍要占位并参与分配:
   *   宽度 = 34 + 3/15 × (可分配空间 - 34)
   * 所以带盒模型的面板比光板 div 宽 27px 左右(1680 视口下 347 vs 320)。
   * 这 27px 就是「正文先宽一截、AI 组件到位后又缩回去」的来源
   * (表现为编辑区滚动条先贴上 AI 面板左边框,再弹回原位)。
   * 约 1494px 以下两者都被 min-width: 310 顶平,看不出差别 —— 别据此以为不必对齐,
   * 1536 起就会显形(实测 1280~3440 共 11 档,对齐后差值恒为 0)。
   * 顺带把背景和圆角也照搬:加载过程于是变成「空面板 → 填入内容」,而不是「空白 → 面板冒出来」。
   */
  .ai-panel-skeleton {
    height: 100%;
    padding: 16px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
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
    border: 1px solid var(--surface-border-color);
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
      color: var(--desc-color);
      font-size: 12px;
      font-weight: 550;
      padding: 2px 6px;
      background-color: var(--common-tag-bg-color);
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
    .note-body {
      // 移动端没有目录和 AI 助手侧栏，保留桌面列间距会在左侧形成无效留白。
      gap: 0;
    }

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
      box-sizing: border-box;

      .b-input {
        font-size: 20px;
      }
    }
  }
</style>
