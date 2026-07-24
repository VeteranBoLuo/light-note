<template>
  <div id="editor-container" class="note-editor">
    <!-- HTML 模式：TinyMCE -->
    <template v-if="currentType === 'html'">
      <div id="editor-toolbar" class="note-editor-toolbar" v-show="!readonly"></div>
      <div class="note-editor-scroll">
        <TinyMceEditor
          v-if="editorReady"
          :key="editorKey"
          v-model="content"
          tag-name="div"
          class="note-editor-body"
          :init="editorInit"
          license-key="gpl"
        />
      </div>
    </template>

    <!-- Markdown 模式：textarea + 预览 -->
    <template v-else>
      <div class="md-editor-container">
        <div class="md-editor-toolbar" v-if="!readonly">
          <BTabs v-model:active-tab="mdView" class="md-view-toggle" :options="mdViewOptions" variant="line" />
        </div>
        <div class="md-editor-body" :class="`md-view-${mdView}`">
          <div class="md-editor-pane" v-show="mdView === 'edit' || mdView === 'split'">
            <div v-if="mdView === 'split'" class="md-editor-label">{{ $t('note.mdEdit') }}</div>
            <BInput
              ref="mdTextareaInputRef"
              v-model:value="mdContent"
              class="md-textarea"
              type="textarea"
              @input="onMdInput"
              @scroll="syncMdScroll('edit')"
              @keydown="onMarkdownMentionKeydown"
              @focusout="closeInlineMention"
              :readonly="readonly"
              :placeholder="$t('note.mdPlaceholder')"
            />
          </div>
          <div class="md-preview-pane" v-show="mdView === 'preview' || mdView === 'split'">
            <div v-if="mdView === 'split'" class="md-editor-label">{{ $t('note.mdPreview') }}</div>
            <div
              ref="mdPreviewRef"
              class="md-preview"
              @scroll="syncMdScroll('preview')"
              @click="handleRenderedResourceLinkClick"
              v-html="renderedMd"
            ></div>
          </div>
        </div>
      </div>
    </template>
    <BPopover
      v-if="!isMobile"
      v-model:open="inlineMentionVisible"
      class="resource-mention-inline-anchor"
      :style="inlineMentionAnchorStyle"
      trigger="manual"
      placement="bottom-left"
      overlay-class-name="resource-mention-inline-popover"
    >
      <span aria-hidden="true"></span>
      <template #content>
        <ResourceMentionSuggestions
          ref="inlineMentionSuggestionsRef"
          :query="inlineMentionQuery"
          @select="insertInlineResourceMention"
          @open-full="openFullMentionPicker"
        />
      </template>
    </BPopover>
    <BModal
      v-model:visible="mentionPickerVisible"
      :title="t('note.resourceMention.title')"
      width="460px"
      :show-footer="false"
      @close="closeMentionPicker"
    >
      <ResourceMentionPicker @select="handleMentionPickerSelect" @close="closeMentionPicker" />
    </BModal>
    <BModal
      v-if="isMobile"
      v-model:visible="mobileResourcePreviewVisible"
      :title="t('note.resourceMention.resourceActionsTitle')"
      width="360px"
      :show-footer="false"
      @close="closeMobileResourcePreview"
    >
      <div v-if="mobileResourcePreview" class="resource-mention-mobile-preview">
        <div class="resource-mention-mobile-preview__summary">
          <strong>{{ mobileResourcePreviewTitle }}</strong>
          <span>{{ mobileResourcePreviewType }}</span>
        </div>
        <p
          class="resource-mention-mobile-preview__status"
          :class="{ 'is-unavailable': mobileResourcePreviewState?.available === false }"
        >
          {{ mobileResourcePreviewStatus }}
        </p>
        <div class="resource-mention-mobile-preview__actions">
          <BButton type="primary" :disabled="!mobileResourcePreviewCanOpen" @click="openMobileResourcePreviewTarget">
            {{ mobileResourcePreviewOpenLabel }}
          </BButton>
          <BButton v-if="canReplaceMobileResource" @click="startMobileResourceReplacement">
            {{ t('note.resourceMention.replaceResource') }}
          </BButton>
        </div>
      </div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    watch,
    watchEffect,
    type PropType,
  } from 'vue';
  import { useRouter } from 'vue-router';
  import TinyMceEditor from '@tinymce/tinymce-vue';
  import 'tinymce/tinymce';
  import 'tinymce/icons/default';
  import 'tinymce/themes/silver';
  import 'tinymce/models/dom';
  import 'tinymce/plugins/autolink';
  import 'tinymce/plugins/autoresize';
  import 'tinymce/plugins/code';
  import 'tinymce/plugins/emoticons';
  import 'tinymce/plugins/image';
  import 'tinymce/plugins/link';
  import 'tinymce/plugins/lists';
  import 'tinymce/plugins/table';
  import 'tinymce/plugins/codesample';
  import 'tinymce/plugins/searchreplace';
  import 'tinymce/plugins/wordcount';
  import 'tinymce/plugins/quickbars';
  import 'tinymce/skins/ui/oxide-dark/skin.min.css';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import i18n from '@/i18n';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { bookmarkStore } from '@/store';
  import icon from '@/config/icon';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import ResourceMentionPicker from '@/components/noteLibrary/detail/ResourceMentionPicker.vue';
  import ResourceMentionSuggestions from '@/components/noteLibrary/detail/ResourceMentionSuggestions.vue';
  import TurndownService from 'turndown';
  import { scrollIntoContainer } from '@/utils/zoom.ts';
  import { getRootZoom } from '@/utils/zoom.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { isResourceMentionTextTrigger } from '@/utils/noteMentionTrigger';
  import {
    applyResourceReferenceChipPresentation,
    buildResourceAnchorAttrs,
    buildResourceHref,
    collectResourceRefsFromHtml,
    decorateInternalResourceLinks,
    parseResourceHref,
    presentResourceReferenceChips,
    resourceRefKey,
    serializeResourceReferenceSnapshots,
    type ResourceRef,
  } from '@/utils/noteResourceRefs';
  import type { ResolvedResourceReference } from '@/api/noteReferences';
  import {
    resolveAiSourceNavigation,
    type AiSource,
    type AiSourceTarget,
  } from '@/components/aiAssistant/aiSourceNavigation';

  const CODE_LANGUAGES = [
    { value: 'plaintext', text: 'Plain Text' },
    { value: 'javascript', text: 'JavaScript' },
    { value: 'typescript', text: 'TypeScript' },
    { value: 'html', text: 'HTML' },
    { value: 'css', text: 'CSS' },
    { value: 'json', text: 'JSON' },
    { value: 'bash', text: 'Bash' },
    { value: 'python', text: 'Python' },
    { value: 'java', text: 'Java' },
    { value: 'go', text: 'Go' },
    { value: 'rust', text: 'Rust' },
    { value: 'cpp', text: 'C++' },
    { value: 'sql', text: 'SQL' },
  ];

  const props = defineProps({
    value: {
      type: String,
      default: () => '',
    },
    editable_root: {
      type: Boolean,
      default: true,
    },
    readonly: {
      type: Boolean,
      default: false,
    },
    noteId: {
      type: String,
      default: '',
    },
    // 父组件传入：新建笔记还没 id 时，先确保笔记已创建并返回其 id（守卫式，防重复建）
    ensureNoteId: {
      type: Function,
      default: null,
    },
    imageUploadMode: {
      type: String as () => 'api' | 'base64',
      default: 'api',
    },
    type: {
      type: String as () => 'html' | 'markdown',
      default: 'html',
    },
    // 父级在打开笔记时一次批量解析；Editor 只消费展示状态，不自行按 chip 发请求。
    resourceRefs: {
      type: Array as PropType<ResolvedResourceReference[]>,
      default: () => [],
    },
  });

  const emits = defineEmits([
    'update:modelValue',
    'setHtml',
    'setNoteId',
    'saveData',
    'ready',
    'update:type',
    'switch-backup-change',
    'markdown-rendered',
    'resource-refs-change',
  ]);
  const content = defineModel<string>('content');
  const editorRef = shallowRef<any>(null);
  const editorReady = ref(false);
  const editorKey = ref(0);
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const router = useRouter();
  const { t } = useI18n();
  const isMobile = computed(() => bookmark.isMobile);
  // 普通游客只能阅读已有引用；管理员进入“游客内容维护”工作区时沿用现有维护权限放行。
  const canEditResourceMentions = computed(() => !props.readonly && (user.role !== 'visitor' || user.visitorWorkspace));
  type MarkdownView = 'edit' | 'split' | 'preview';
  // MD 编辑器视图：edit / split / preview
  const mdView = ref<MarkdownView>(isMobile.value ? 'edit' : 'split');
  const mdViewOptions = computed(() => {
    const options = [
      { key: 'edit', label: t('note.mdEdit') },
      { key: 'split', label: t('note.mdEditPreview') },
      { key: 'preview', label: t('note.mdPreview') },
    ];
    return isMobile.value ? options.filter((option) => option.key !== 'split') : options;
  });
  watch(isMobile, (mobile) => {
    if (mobile && mdView.value === 'split') mdView.value = 'edit';
  });
  let visibilityObserver: IntersectionObserver | null = null;

  const currentType = ref(props.type);
  const switchBackup = ref<{ content: string; type: string } | null>(null);

  // 备份状态变化时通知父组件
  watch(
    switchBackup,
    (val) => {
      emits('switch-backup-change', !!val);
    },
    { immediate: true },
  );

  watch(
    () => props.type,
    (val) => {
      currentType.value = val;
    },
  );

  watch(
    () => props.resourceRefs,
    () => {
      if (currentType.value === 'markdown') {
        void renderMd();
        return;
      }
      window.setTimeout(() => decorateTinyMceResourceRefs(), 0);
    },
    { deep: true },
  );

  watch(
    () => props.noteId,
    () => {
      // 新建草稿拿到真实 id 后必须重新发布同一批链接，让父级用真实上下文批量解析。
      lastPublishedResourceRefSignature = '';
      if (currentType.value === 'markdown') {
        void renderMd();
        return;
      }
      window.setTimeout(() => {
        const editor = editorRef.value;
        if (!editor) return;
        publishResourceRefs(editor.getContent({ format: 'html' }));
        decorateTinyMceResourceRefs();
      }, 0);
    },
  );

  // Markdown 编辑器状态
  const mdContent = ref('');
  let markedLib: any = null;
  let dompurifyLib: any = null;
  const mentionPickerVisible = ref(false);
  const inlineMentionVisible = ref(false);
  const inlineMentionQuery = ref('');
  const mobileResourcePreviewVisible = ref(false);
  const mobileResourcePreview = ref<{ ref: ResourceRef; title: string } | null>(null);
  // 资源预览只在移动端保存本轮被点中的 chip 节点；“替换引用”复用该节点而不猜测同名/同 ID 的其他引用。
  let mobileResourcePreviewAnchor: HTMLAnchorElement | null = null;
  let mobileResourceReplacementAnchor: HTMLAnchorElement | null = null;
  const inlineMentionAnchorStyle = ref<Record<string, string>>({});
  const inlineMentionSuggestionsRef = ref<{ moveActive: (offset: number) => void; chooseActive: () => void } | null>(
    null,
  );
  let lastPublishedResourceRefSignature = '';

  function resourcePresentationOptions(liveEditor = false) {
    return {
      liveEditor,
      unavailableLabel: (snapshotTitle: string) => t('note.resourceRefUnavailable', { title: snapshotTitle }),
      linkTitle: (title: string, state: 'pending' | 'available' | 'unavailable') => {
        if (state === 'available') return t('note.resourceMention.openResource', { title });
        if (state === 'unavailable') return t('note.resourceMention.resourceUnavailable');
        return t('note.resourceMention.checkingResource');
      },
    };
  }

  function publishResourceRefs(html: string) {
    const refs = collectResourceRefsFromHtml(html).slice(0, 100);
    const signature = `${props.noteId}|${refs.map(resourceRefKey).join('|')}`;
    if (signature === lastPublishedResourceRefSignature) return;
    lastPublishedResourceRefSignature = signature;
    emits('resource-refs-change', refs);
  }

  // 只记录用户显式打开/插入这两个动作，不记录资源名称、URL、正文，也不在自动保存时刷日志。
  function recordResourceMentionOperation(operation: string) {
    void recordOperation({ module: '笔记', operation });
  }

  function decorateTinyMceResourceRefs() {
    const editor = editorRef.value;
    const body = editor?.getBody?.();
    if (!body) return;
    const apply = () =>
      applyResourceReferenceChipPresentation(body, props.resourceRefs, resourcePresentationOptions(true));
    // 展示层替换当前名称不能进入 TinyMCE undo 栈，也不能触发正文保存。
    if (editor.undoManager?.ignore) editor.undoManager.ignore(apply);
    else apply();
    editor.nodeChanged?.();
  }

  function resolvedResourceRef(ref: ResourceRef) {
    return props.resourceRefs.find((item) => item.type === ref.type && item.id === ref.id);
  }

  const mobileResourcePreviewState = computed(() => {
    const preview = mobileResourcePreview.value;
    return preview ? resolvedResourceRef(preview.ref) || null : null;
  });
  const mobileResourcePreviewTitle = computed(() => {
    const preview = mobileResourcePreview.value;
    if (!preview) return '';
    return mobileResourcePreviewState.value?.title || preview.title || preview.ref.id;
  });
  const mobileResourcePreviewType = computed(() => {
    const type = mobileResourcePreview.value?.ref.type;
    return type ? t(`ai.sourceTypes.${type}`) : '';
  });
  const mobileResourcePreviewCanOpen = computed(() => {
    const preview = mobileResourcePreview.value;
    const state = mobileResourcePreviewState.value;
    if (!preview || !state?.available) return false;
    return preview.ref.type !== 'bookmark' || Boolean(state.url);
  });
  const mobileResourcePreviewStatus = computed(() => {
    const preview = mobileResourcePreview.value;
    const state = mobileResourcePreviewState.value;
    if (!preview || !state || (preview.ref.type === 'bookmark' && !state.url)) {
      return t('note.resourceMention.checkingResource');
    }
    return state.available ? t('note.resourceMention.resourceReady') : t('note.resourceMention.resourceUnavailable');
  });
  const mobileResourcePreviewOpenLabel = computed(() => {
    const type = mobileResourcePreview.value?.ref.type;
    if (type === 'bookmark') return t('note.resourceMention.openWebsite');
    if (type === 'file') return t('note.resourceMention.openFile');
    return t('note.resourceMention.openNote');
  });
  const canReplaceMobileResource = computed(
    () =>
      canEditResourceMentions.value &&
      currentType.value === 'html' &&
      Boolean(mobileResourcePreview.value && mobileResourcePreviewAnchor),
  );

  function navigateResourceRef(ref: ResourceRef) {
    const state = resolvedResourceRef(ref);
    if (state && !state.available) {
      message.warning(t('note.resourceMention.resourceUnavailable'));
      return;
    }
    // 书签网址只能来自已完成归属校验的解析结果。解析尚未返回时不降级跳到编辑页，
    // 避免一次点击因竞态违背“打开原站”的引用语义。
    if (ref.type === 'bookmark' && !state?.url) return;
    const source: AiSource = {
      // 刚插入时批量解析尚未返回，也应能立即按 canonical href 打开；真正的数据权限仍由目标页面接口校验。
      type: ref.type,
      id: ref.id,
      title: state?.title || ref.id,
      url: state?.url,
      target: state?.navigation?.target as AiSourceTarget | undefined,
      fileId: state?.navigation?.fileId,
    };
    const navigation = resolveAiSourceNavigation(source);
    if (navigation.kind === 'external') {
      window.open(navigation.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (navigation.kind !== 'internal') return;
    if (typeof navigation.target === 'string') {
      void router.push(navigation.target);
    } else {
      void router.push(navigation.target);
    }
  }

  function showMobileResourcePreview(ref: ResourceRef, anchor: HTMLAnchorElement | null) {
    mobileResourcePreviewAnchor = anchor;
    mobileResourcePreview.value = {
      ref,
      title: String(anchor?.textContent || '').trim() || ref.id,
    };
    mobileResourcePreviewVisible.value = true;
  }

  function closeMobileResourcePreview() {
    mobileResourcePreviewVisible.value = false;
    mobileResourcePreview.value = null;
    mobileResourcePreviewAnchor = null;
  }

  function openMobileResourcePreviewTarget() {
    const preview = mobileResourcePreview.value;
    if (!preview) return;
    if (!mobileResourcePreviewCanOpen.value) {
      message.warning(mobileResourcePreviewStatus.value);
      return;
    }
    closeMobileResourcePreview();
    navigateResourceRef(preview.ref);
  }

  function startMobileResourceReplacement() {
    const editor = editorRef.value;
    const anchor = mobileResourcePreviewAnchor;
    const body = editor?.getBody?.() as HTMLElement | null;
    if (!canReplaceMobileResource.value || !anchor || !body?.contains(anchor)) {
      message.warning(t('note.resourceMention.insertFailed'));
      closeMobileResourcePreview();
      return;
    }
    mobileResourceReplacementAnchor = anchor;
    closeMobileResourcePreview();
    mentionPickerVisible.value = true;
  }

  function handleResourceRefClick(ref: ResourceRef, anchor: HTMLAnchorElement | null) {
    if (isMobile.value) {
      showMobileResourcePreview(ref, anchor);
      return;
    }
    navigateResourceRef(ref);
  }

  function handleRenderedResourceLinkClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    const ref = anchor ? parseResourceHref(anchor.getAttribute('href')) : null;
    if (!ref) return;
    event.preventDefault();
    event.stopPropagation();
    handleResourceRefClick(ref, anchor);
  }

  // 滚动同步
  type BInputExpose = {
    inputEl?: HTMLInputElement | HTMLTextAreaElement | null;
  };
  const mdTextareaInputRef = ref<BInputExpose | null>(null);
  const mdPreviewRef = ref<HTMLElement | null>(null);
  let isSyncingMdScroll = false;
  let isProgrammaticMdScroll = false;
  let mdScrollUnlockTimer: number | null = null;

  function scheduleProgrammaticMarkdownScrollUnlock(delay = 180) {
    if (mdScrollUnlockTimer) window.clearTimeout(mdScrollUnlockTimer);
    mdScrollUnlockTimer = window.setTimeout(() => {
      isProgrammaticMdScroll = false;
      mdScrollUnlockTimer = null;
    }, delay);
  }

  function getMdTextarea() {
    const element = mdTextareaInputRef.value?.inputEl;
    return element instanceof HTMLTextAreaElement ? element : null;
  }

  type MarkdownMentionRange = { start: number; end: number };
  type MarkdownMentionUndo = {
    before: string;
    after: string;
    start: number;
    end: number;
  };
  type HtmlMentionSelection = {
    range: Range;
    bookmark: any | null;
    markerId: string | null;
  };
  let markdownMentionRange: MarkdownMentionRange | null = null;
  // Markdown 的资源插入是受控值写入，浏览器不会把它加入 textarea 原生 undo 栈。
  // 这里只保留最近一次“提及替换”，且正文随后有任何改动便立刻失效，避免抢占普通文字撤回。
  let markdownMentionUndo: MarkdownMentionUndo | null = null;
  // 弹窗会把焦点从 TinyMCE iframe 移走。移动端额外放一个临时锚点在 @ 前面，
  // 让恢复逻辑能重新精确选中 @，而不是仅凭已经可能漂移的 Range/bookmark 猜位置。
  let htmlMentionSelection: HtmlMentionSelection | null = null;
  let htmlMentionMarkerSequence = 0;

  function escapeMarkdownLinkTitle(title: string) {
    return String(title || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/([\\\[\]])/g, '\\$1')
      .trim();
  }

  function escapeHtmlText(value: string) {
    return String(value || '').replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char,
    );
  }

  function rangeBelongsToTinyMce(editor: any, range: Range | null | undefined) {
    const body = editor?.getBody?.() as HTMLElement | null;
    return Boolean(body && range && body.contains(range.startContainer) && body.contains(range.endContainer));
  }

  function stripTransientMentionMarkers(html: string) {
    if (!html.includes('data-ln-resource-mention-marker')) return html;
    if (typeof DOMParser === 'undefined') {
      return html.replace(/<span\b[^>]*\bdata-ln-resource-mention-marker=["'][^"']*["'][^>]*><\/span>/giu, '');
    }
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    doc.body.querySelectorAll('[data-ln-resource-mention-marker]').forEach((marker) => marker.remove());
    return doc.body.innerHTML;
  }

  function findTinyMceMentionMarker(editor: any, markerId: string | null) {
    const body = editor?.getBody?.() as HTMLElement | null;
    if (!body || !markerId) return null;
    const markers = body.querySelectorAll<HTMLElement>('[data-ln-resource-mention-marker]');
    return (
      Array.from(markers).find((marker) => marker.getAttribute('data-ln-resource-mention-marker') === markerId) || null
    );
  }

  function getTinyMceMentionRangeFromMarker(editor: any, markerId: string | null) {
    const marker = findTinyMceMentionMarker(editor, markerId);
    const triggerNode = marker?.nextSibling;
    if (!marker || triggerNode?.nodeType !== Node.TEXT_NODE || !String(triggerNode.textContent || '').startsWith('@')) {
      return null;
    }
    try {
      const range = editor.dom.createRng();
      range.setStartAfter(marker);
      range.setEnd(triggerNode, 1);
      return range;
    } catch {
      return null;
    }
  }

  function selectionIsExactTinyMceMention(editor: any, range: Range | null | undefined) {
    return Boolean(rangeBelongsToTinyMce(editor, range) && range?.toString() === '@');
  }

  function clearTinyMceMentionSelection(editor = editorRef.value) {
    const marker = findTinyMceMentionMarker(editor, htmlMentionSelection?.markerId || null);
    marker?.remove();
    htmlMentionSelection = null;
  }

  function captureTinyMceMentionSelection(editor: any, replacementRange: Range): HtmlMentionSelection {
    let bookmark: any | null = null;
    let markerId: string | null = null;
    let selectionRange = replacementRange;
    try {
      const markerRange = replacementRange.cloneRange();
      markerRange.collapse(true);
      const marker = editor.getDoc?.().createElement('span') as HTMLElement | undefined;
      if (marker) {
        markerId = `ln-resource-mention-${Date.now()}-${++htmlMentionMarkerSequence}`;
        marker.setAttribute('data-ln-resource-mention-marker', markerId);
        marker.setAttribute('data-mce-bogus', 'all');
        marker.setAttribute('contenteditable', 'false');
        marker.setAttribute('aria-hidden', 'true');
        marker.style.display = 'none';
        markerRange.insertNode(marker);
        selectionRange = getTinyMceMentionRangeFromMarker(editor, markerId) || replacementRange;
      }
      // bookmark 必须记录“@”本身被选中的区间，而不是输入后的折叠光标；否则恢复后会留下 @。
      editor.selection.setRng(selectionRange);
      bookmark = editor.selection.getBookmark?.(2, true) ?? null;
    } catch {
      // 极少数 TinyMCE 版本不支持 path bookmark 时，下面的 Range 仍可作为同一轮会话的兜底。
      bookmark = null;
    }
    return { range: selectionRange, bookmark, markerId };
  }

  function restoreTinyMceMentionSelection(editor: any) {
    const selection = htmlMentionSelection;
    if (!selection) return false;

    const markerRange = getTinyMceMentionRangeFromMarker(editor, selection.markerId);
    if (selectionIsExactTinyMceMention(editor, markerRange)) {
      try {
        editor.selection.setRng(markerRange);
        return true;
      } catch {
        // 临时标记仍可能被 TinyMCE 的外部 setContent 清掉，继续走 bookmark/Range 兜底。
      }
    }

    if (selection.bookmark) {
      try {
        editor.selection.moveToBookmark(selection.bookmark);
        if (selectionIsExactTinyMceMention(editor, editor.selection.getRng?.())) return true;
      } catch {
        // bookmark 可能因编辑器被外部重置而失效，继续尝试本轮保存的原始 Range。
      }
    }

    if (!selectionIsExactTinyMceMention(editor, selection.range)) return false;
    try {
      editor.selection.setRng(selection.range);
      return true;
    } catch {
      return false;
    }
  }

  function moveTinyMceCaretAfterResourceMention(editor: any, item: ResourceRef) {
    const body = editor.getBody?.() as HTMLElement | null;
    if (!body) return;
    const anchor = Array.from(body.querySelectorAll<HTMLAnchorElement>('a[data-ln-resource-type][data-ln-resource-id]'))
      .reverse()
      .find(
        (element) =>
          element.getAttribute('data-ln-resource-type') === item.type &&
          element.getAttribute('data-ln-resource-id') === item.id,
      );
    if (!anchor) return;
    try {
      const range = editor.dom.createRng();
      range.setStartAfter(anchor);
      range.collapse(true);
      editor.selection.setRng(range);
    } catch {
      // 插入本身已成功；极少数浏览器无法定位光标时，不让这一步影响正文保存。
    }
  }

  function setInlineMentionAnchor(rect: Pick<DOMRect, 'top' | 'left' | 'height'>) {
    const zoom = getRootZoom();
    inlineMentionAnchorStyle.value = {
      position: 'fixed',
      left: `${rect.left / zoom}px`,
      top: `${rect.top / zoom}px`,
      width: '1px',
      height: `${Math.max(rect.height, 18) / zoom}px`,
      pointerEvents: 'none',
    };
  }

  function getMarkdownCaretRect(textarea: HTMLTextAreaElement) {
    const sourceRect = textarea.getBoundingClientRect();
    const style = getComputedStyle(textarea);
    const mirror = document.createElement('div');
    const marker = document.createElement('span');
    const copied = [
      'boxSizing',
      'width',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'letterSpacing',
      'lineHeight',
      'textTransform',
      'wordSpacing',
      'textIndent',
      'whiteSpace',
      'wordBreak',
      'overflowWrap',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
    ] as const;
    mirror.style.position = 'fixed';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.overflow = 'hidden';
    mirror.style.left = `${sourceRect.left}px`;
    mirror.style.top = `${sourceRect.top}px`;
    mirror.style.width = `${textarea.offsetWidth}px`;
    for (const key of copied) mirror.style[key] = style[key];
    mirror.textContent = textarea.value.slice(0, textarea.selectionStart);
    marker.textContent = '\u200b';
    mirror.append(marker);
    document.body.append(mirror);
    const markerRect = marker.getBoundingClientRect();
    mirror.remove();
    return {
      left: markerRect.left - textarea.scrollLeft,
      top: markerRect.top - textarea.scrollTop,
      height: markerRect.height || Number.parseFloat(style.lineHeight) || 20,
    };
  }

  function openFullMentionPicker() {
    mentionPickerVisible.value = true;
    inlineMentionVisible.value = false;
  }

  function closeInlineMention() {
    if (!inlineMentionVisible.value) return;
    inlineMentionVisible.value = false;
  }

  function closeMentionPicker() {
    mentionPickerVisible.value = false;
    markdownMentionRange = null;
    clearTinyMceMentionSelection();
    mobileResourceReplacementAnchor = null;
  }

  function tryOpenMarkdownMention() {
    if (!canEditResourceMentions.value || mentionPickerVisible.value || inlineMentionVisible.value) return;
    const textarea = getMdTextarea();
    if (!textarea) return;
    const caret = textarea.selectionStart;
    const value = textarea.value;
    if (!isResourceMentionTextTrigger(value, caret - 1)) return;
    markdownMentionRange = { start: caret - 1, end: caret };
    if (isMobile.value) mentionPickerVisible.value = true;
    else {
      inlineMentionQuery.value = '';
      setInlineMentionAnchor(getMarkdownCaretRect(textarea));
      inlineMentionVisible.value = true;
    }
    recordResourceMentionOperation('打开资源提及选择器');
  }

  function tryOpenTinyMceMention(editor: any) {
    if (!canEditResourceMentions.value || mentionPickerVisible.value || inlineMentionVisible.value) return;
    const range = editor.selection?.getRng?.() as Range | null;
    if (!range?.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE || range.startOffset < 1) return;
    if (editor.dom?.getParent?.(range.startContainer, 'pre,code,a')) return;
    const allBefore = editor.dom.createRng();
    allBefore.selectNodeContents(editor.getBody());
    allBefore.setEnd(range.startContainer, range.startOffset);
    const textBefore = allBefore.toString();
    if (!isResourceMentionTextTrigger(textBefore, textBefore.length - 1)) return;
    const replacementRange = range.cloneRange();
    replacementRange.setStart(range.startContainer, range.startOffset - 1);
    if (isMobile.value) {
      htmlMentionSelection = captureTinyMceMentionSelection(editor, replacementRange);
      mentionPickerVisible.value = true;
    } else {
      htmlMentionSelection = { range: replacementRange, bookmark: null, markerId: null };
      syncTinyMceInlineMention(editor);
      inlineMentionVisible.value = true;
    }
    recordResourceMentionOperation('打开资源提及选择器');
  }

  function syncMarkdownInlineMention() {
    if (!inlineMentionVisible.value || currentType.value !== 'markdown') return;
    const textarea = getMdTextarea();
    const range = markdownMentionRange;
    if (!textarea || !range || textarea.selectionStart < range.start + 1) return closeInlineMention();
    const query = textarea.value.slice(range.start + 1, textarea.selectionStart);
    if (/[\s@]/u.test(query)) return closeInlineMention();
    markdownMentionRange = { start: range.start, end: textarea.selectionStart };
    inlineMentionQuery.value = query;
    setInlineMentionAnchor(getMarkdownCaretRect(textarea));
  }

  function syncTinyMceInlineMention(editor: any) {
    if (!htmlMentionSelection) return;
    const currentRange = editor.selection?.getRng?.() as Range | null;
    if (!currentRange?.collapsed || !rangeBelongsToTinyMce(editor, currentRange)) return closeInlineMention();
    try {
      const mentionRange = htmlMentionSelection.range.cloneRange();
      mentionRange.setEnd(currentRange.startContainer, currentRange.startOffset);
      const text = mentionRange.toString();
      if (!text.startsWith('@') || /[\s@]/u.test(text.slice(1))) return closeInlineMention();
      htmlMentionSelection = { range: mentionRange, bookmark: null, markerId: null };
      inlineMentionQuery.value = text.slice(1);
      const caretRange = currentRange.cloneRange();
      caretRange.collapse(false);
      const caretRect = caretRange.getBoundingClientRect();
      // TinyMCE 的 Range rect 已是页面视口坐标；再次叠加 iframe 的 rect 会让浮层向下偏移一个编辑区高度。
      setInlineMentionAnchor({
        left: caretRect.left,
        top: caretRect.top,
        height: caretRect.height || 20,
      });
    } catch {
      closeInlineMention();
    }
  }

  function onMarkdownMentionKeydown(event: KeyboardEvent) {
    const isUndo = (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
    if (!event.isComposing && isUndo && undoMarkdownMentionInsertion()) {
      event.preventDefault();
      return;
    }
    if (!inlineMentionVisible.value || event.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      inlineMentionSuggestionsRef.value?.moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      inlineMentionSuggestionsRef.value?.moveActive(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      inlineMentionSuggestionsRef.value?.chooseActive();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeInlineMention();
    }
  }

  function replaceMarkdownMention(text: string) {
    const textarea = getMdTextarea();
    const range =
      markdownMentionRange || (textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : null);
    if (!range) return false;
    // 不使用 document.execCommand：它在 textarea 上的返回值无法保证受控状态已同步，
    // 弹窗关闭后的 Vue 渲染就可能把“看似已插入”的文本覆盖回去。
    const source = String(textarea?.value ?? mdContent.value ?? content.value ?? '');
    const start = Math.max(0, Math.min(range.start, source.length));
    const end = Math.max(start, Math.min(range.end, source.length));
    const next = `${source.slice(0, start)}${text}${source.slice(end)}`;
    markdownMentionUndo = { before: source, after: next, start, end };
    onMdInput(next);
    const caret = start + text.length;
    void nextTick().then(() => {
      const currentTextarea = getMdTextarea();
      if (!currentTextarea) return;
      currentTextarea.focus({ preventScroll: true });
      currentTextarea.setSelectionRange(caret, caret);
    });
    return true;
  }

  function undoMarkdownMentionInsertion() {
    const undo = markdownMentionUndo;
    if (!undo || mdContent.value !== undo.after || content.value !== undo.after) return false;
    markdownMentionUndo = null;
    mdContent.value = undo.before;
    content.value = undo.before;
    debounceRenderMd();
    void nextTick().then(() => {
      const textarea = getMdTextarea();
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(undo.end, undo.end);
    });
    return true;
  }

  function insertResourceMention(item: ResourceRef & { title: string }) {
    if (!canEditResourceMentions.value) return false;
    const href = buildResourceHref(item);
    if (!href) return false;
    if (currentType.value === 'markdown') {
      const title = escapeMarkdownLinkTitle(item.title) || item.id;
      const inserted = replaceMarkdownMention(`[${title}](${href})`);
      markdownMentionRange = null;
      if (inserted) recordResourceMentionOperation('插入资源提及成功');
      return inserted;
    }
    const editor = editorRef.value;
    if (!editor) return false;
    const attrs = buildResourceAnchorAttrs(item);
    const html = `<a href="${href}" contenteditable="false" data-ln-resource-type="${attrs['data-ln-resource-type']}" data-ln-resource-id="${attrs['data-ln-resource-id']}">${escapeHtmlText(item.title || item.id)}</a>`;
    let inserted = false;
    try {
      editor.focus();
      if (!restoreTinyMceMentionSelection(editor)) throw new Error('mention selection expired');
      const insert = () => {
        if (typeof editor.insertContent === 'function') {
          editor.insertContent(html);
        } else {
          editor.selection.setContent(html);
        }
        // 资源引用是原子 chip；显式把光标放到链接之后，之后输入自然成为普通文字。
        moveTinyMceCaretAfterResourceMention(editor, item);
      };
      if (editor.undoManager?.transact) editor.undoManager.transact(insert);
      else insert();

      // TinyMCE 的插入事件在不同版本中不一定会同步 v-model；显式更新正文事实源，
      // 保证“选中资源 → 看见链接 → 自动保存”是同一条闭环。
      const nextHtml = editor.getContent({ format: 'html' });
      if (!collectResourceRefsFromHtml(nextHtml).some((ref) => resourceRefKey(ref) === resourceRefKey(item))) {
        throw new Error('mention insertion missing from editor content');
      }
      content.value = nextHtml;
      inserted = true;
    } catch {
      message.warning(t('note.resourceMention.insertFailed'));
    } finally {
      clearTinyMceMentionSelection(editor);
    }
    if (!inserted) return false;
    recordResourceMentionOperation('插入资源提及成功');
    window.setTimeout(() => {
      publishResourceRefs(editor.getContent({ format: 'html' }));
      decorateTinyMceResourceRefs();
    }, 0);
    return true;
  }

  function replaceMobileResourceMention(item: ResourceRef & { title: string }) {
    const editor = editorRef.value;
    const anchor = mobileResourceReplacementAnchor;
    mobileResourceReplacementAnchor = null;
    const body = editor?.getBody?.() as HTMLElement | null;
    const href = buildResourceHref(item);
    if (!editor || !anchor || !body?.contains(anchor) || !href) {
      message.warning(t('note.resourceMention.insertFailed'));
      return false;
    }
    const attrs = buildResourceAnchorAttrs(item);
    const html = `<a href="${href}" contenteditable="false" data-ln-resource-type="${attrs['data-ln-resource-type']}" data-ln-resource-id="${attrs['data-ln-resource-id']}">${escapeHtmlText(item.title || item.id)}</a>`;
    let replaced = false;
    try {
      editor.focus();
      const range = editor.dom.createRng();
      range.selectNode(anchor);
      editor.selection.setRng(range);
      const replace = () => {
        if (typeof editor.insertContent === 'function') {
          editor.insertContent(html);
        } else {
          editor.selection.setContent(html);
        }
        moveTinyMceCaretAfterResourceMention(editor, item);
      };
      if (editor.undoManager?.transact) editor.undoManager.transact(replace);
      else replace();
      const nextHtml = editor.getContent({ format: 'html' });
      if (!collectResourceRefsFromHtml(nextHtml).some((ref) => resourceRefKey(ref) === resourceRefKey(item))) {
        throw new Error('resource mention replacement missing from editor content');
      }
      content.value = nextHtml;
      replaced = true;
    } catch {
      message.warning(t('note.resourceMention.insertFailed'));
    }
    if (!replaced) return false;
    recordResourceMentionOperation('替换资源提及成功');
    window.setTimeout(() => {
      publishResourceRefs(editor.getContent({ format: 'html' }));
      decorateTinyMceResourceRefs();
    }, 0);
    return true;
  }

  function handleMentionPickerSelect(item: ResourceRef & { title: string }) {
    if (mobileResourceReplacementAnchor) {
      replaceMobileResourceMention(item);
    } else {
      insertResourceMention(item);
    }
    // 一次选择只消费一次当前编辑器位置。即使位置已在弹窗期间失效，也关闭选择器并要求重新触发，
    // 避免用户继续点列表时复用过期的 Range/bookmark。
    closeMentionPicker();
  }

  function insertInlineResourceMention(item: ResourceRef & { title: string }) {
    insertResourceMention(item);
    inlineMentionVisible.value = false;
  }

  function syncMdScroll(source: 'edit' | 'preview') {
    if (isProgrammaticMdScroll) {
      // 平滑定位期间两个面板都会连续触发 scroll。等最后一次滚动真正结束后再解锁，
      // 避免百分比同步把刚刚精确定位到顶部的标题重新推回页面中部。
      scheduleProgrammaticMarkdownScrollUnlock();
      return;
    }
    if (isSyncingMdScroll) return;
    isSyncingMdScroll = true;

    const textarea = getMdTextarea();
    const preview = mdPreviewRef.value;
    if (!textarea || !preview) {
      isSyncingMdScroll = false;
      return;
    }

    if (source === 'edit') {
      // textarea → preview：按百分比同步
      const ratio = textarea.scrollHeight - textarea.clientHeight;
      if (ratio > 0) {
        preview.scrollTop = (textarea.scrollTop / ratio) * (preview.scrollHeight - preview.clientHeight);
      }
    } else {
      // preview → textarea：按百分比同步
      const ratio = preview.scrollHeight - preview.clientHeight;
      if (ratio > 0) {
        textarea.scrollTop = (preview.scrollTop / ratio) * (textarea.scrollHeight - textarea.clientHeight);
      }
    }

    requestAnimationFrame(() => {
      isSyncingMdScroll = false;
    });
  }

  // Markdown 模式下同步外部内容
  watch(
    [() => props.type, content],
    async ([type]) => {
      if (type === 'markdown' && content.value !== mdContent.value) {
        markdownMentionUndo = null;
        mdContent.value = content.value || '';
        if (!markedLib) await ensureMdLib();
        renderMd();
      }
    },
    { immediate: true },
  );

  // 懒加载 marked + dompurify
  async function ensureMdLib() {
    if (markedLib) return;
    const mods = await Promise.all([import('marked'), import('dompurify')]);
    markedLib = mods[0].marked;
    dompurifyLib = mods[1].default;
  }

  // MD → HTML 统一收口：marked 渲染 + DOMPurify 消毒 + 站内链接增强属性(N0)。
  // 集中一处避免多条渲染路径口径漂移；decorate 只给站内链接补 data-ln-*,无站内链接则原样返回(零改写)。
  // 调用方须先 await ensureMdLib()（本函数同步使用已加载的 markedLib/dompurifyLib）。
  function mdToSafeHtml(mdText: string): string {
    const raw = markedLib.parse(mdText || '');
    const safe = dompurifyLib ? dompurifyLib.sanitize(raw) : raw;
    return decorateInternalResourceLinks(safe);
  }

  const renderedMd = ref('');
  let mdRenderTimer: ReturnType<typeof setTimeout> | null = null;

  function onMdInput(value: string | number) {
    const val = String(value ?? '');
    if (markdownMentionUndo && val !== markdownMentionUndo.after) {
      markdownMentionUndo = null;
    }
    mdContent.value = val;
    content.value = val;
    debounceRenderMd();
    void nextTick().then(() => {
      if (inlineMentionVisible.value) syncMarkdownInlineMention();
      else tryOpenMarkdownMention();
    });
  }

  watch([mentionPickerVisible, inlineMentionVisible], ([modalOpen, inlineOpen]) => {
    if (modalOpen || inlineOpen) return;
    markdownMentionRange = null;
    clearTinyMceMentionSelection();
    inlineMentionQuery.value = '';
  });

  function debounceRenderMd() {
    if (mdRenderTimer) clearTimeout(mdRenderTimer);
    mdRenderTimer = setTimeout(() => {
      renderMd();
    }, 200);
  }

  async function renderMd() {
    if (!markedLib) await ensureMdLib();
    try {
      const safeHtml = mdToSafeHtml(mdContent.value || '');
      publishResourceRefs(safeHtml);
      renderedMd.value = presentResourceReferenceChips(safeHtml, props.resourceRefs, resourcePresentationOptions());
    } catch {
      renderedMd.value = '<p>' + t('note.renderError') + '</p>';
      publishResourceRefs('');
    }
    await nextTick();
    emits('markdown-rendered');
  }

  function measureTextareaOffset(textarea: HTMLTextAreaElement, sourceOffset: number) {
    const styles = window.getComputedStyle(textarea);
    const mirror = document.createElement('div');
    Object.assign(mirror.style, {
      position: 'fixed',
      top: '0',
      left: '-10000px',
      visibility: 'hidden',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      width: `${textarea.clientWidth}px`,
      minHeight: '0',
      padding: styles.padding,
      border: styles.border,
      font: styles.font,
      fontFamily: styles.fontFamily,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      fontStyle: styles.fontStyle,
      lineHeight: styles.lineHeight,
      letterSpacing: styles.letterSpacing,
      textTransform: styles.textTransform,
      textIndent: styles.textIndent,
      tabSize: styles.tabSize,
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word',
      wordBreak: styles.wordBreak,
    });
    mirror.append(document.createTextNode(textarea.value.slice(0, sourceOffset)));
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirror.append(marker);
    document.body.append(mirror);
    const top = marker.offsetTop;
    mirror.remove();
    return top;
  }

  function lockProgrammaticMarkdownScroll() {
    isProgrammaticMdScroll = true;
    // 若浏览器没有产生 scroll 事件，也能自动释放；有事件时会以上面的短防抖续期。
    scheduleProgrammaticMarkdownScrollUnlock(900);
  }

  async function scrollToMarkdownHeading(index: number, sourceOffset?: number) {
    if (currentType.value !== 'markdown') return false;
    await nextTick();

    const textarea = getMdTextarea();
    const preview = mdPreviewRef.value;
    const previewHeading = preview?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')[index];
    if (!textarea && (!preview || !previewHeading)) return false;

    lockProgrammaticMarkdownScroll();

    if (preview && previewHeading && preview.offsetParent !== null) {
      scrollIntoContainer(preview, previewHeading, 5);
    }

    if (textarea && typeof sourceOffset === 'number') {
      const safeOffset = Math.min(Math.max(0, sourceOffset), textarea.value.length);
      const targetTop = measureTextareaOffset(textarea, safeOffset);
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(safeOffset, safeOffset);
      window.requestAnimationFrame(() => {
        textarea.scrollTo({
          top: Math.max(0, targetTop - 8),
          behavior: 'smooth',
        });
      });
    }

    return true;
  }

  // 切换模式
  async function handleModeSwitch() {
    const targetType = currentType.value === 'html' ? 'markdown' : 'html';
    const backup = { content: content.value || '', type: currentType.value };

    // 移动端直接切，不弹框、不备份
    if (isMobile.value) {
      await doDirectSwitch(targetType, backup);
      return;
    }

    Alert.alert({
      title: targetType === 'markdown' ? t('note.switchToMd') : t('note.switchToHtml'),
      content: targetType === 'markdown' ? t('note.switchToMdTip') : t('note.switchToHtmlTip'),
      okText: t('note.confirmSwitch'),
      cancelText: t('common.cancel'),
      onOk: () => doSwitch(targetType, backup),
    });
  }

  async function doDirectSwitch(targetType: string, backup: { content: string; type: string }) {
    currentType.value = targetType;
    if (targetType === 'markdown') {
      await ensureMdLib();
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });
      mdContent.value = turndownService.turndown(backup.content || '');
      content.value = mdContent.value;
      await nextTick();
      renderMd();
    } else {
      await ensureMdLib();
      const mdText = backup.content || '';
      if (mdText.trim()) {
        try {
          content.value = mdToSafeHtml(mdText);
        } catch {
          content.value = mdText;
        }
      } else {
        content.value = '';
      }
      forceReinit();
    }
    emits('update:type', targetType);
  }

  async function doSwitch(targetType: string, backup: { content: string; type: string }) {
    switchBackup.value = backup;
    currentType.value = targetType;

    if (targetType === 'markdown') {
      // HTML → MD：用 turndown 转换
      await ensureMdLib();
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });
      mdContent.value = turndownService.turndown(backup.content || '');
      content.value = mdContent.value;
      await nextTick();
      renderMd();
    } else {
      // MD → HTML：用 marked 转换
      await ensureMdLib();
      const mdText = backup.content || '';
      if (mdText.trim()) {
        try {
          content.value = mdToSafeHtml(mdText);
        } catch {
          content.value = mdText;
        }
      } else {
        content.value = '';
      }
      // 重建 TinyMCE
      forceReinit();
    }

    emits('update:type', targetType);
  }

  function undoSwitch() {
    if (!switchBackup.value) return;
    const backup = switchBackup.value;
    const targetLabel = backup.type === 'html' ? 'HTML' : 'Markdown';
    Alert.alert({
      title: t('note.undoSwitchTitle'),
      content: t('note.undoSwitchConfirm', { mode: targetLabel }),
      okText: t('note.confirmUndo'),
      cancelText: t('common.cancel'),
      onOk: () => doUndo(backup),
    });
  }

  function doUndo(backup: { content: string; type: string }) {
    switchBackup.value = null;

    currentType.value = backup.type;

    if (backup.type === 'html') {
      content.value = backup.content;
      forceReinit();
    } else {
      mdContent.value = backup.content;
      content.value = backup.content;
      if (markedLib) renderMd();
    }

    emits('update:type', backup.type);
  }

  const ensureToolbar = async () => {
    await nextTick();
    const toolbarEl = document.getElementById('editor-toolbar');
    if (!toolbarEl) {
      editorKey.value += 1;
      editorReady.value = false;
      await nextTick();
    }
    editorReady.value = true;
  };

  const ensureToolbarRendered = async () => {
    if (props.readonly) return;
    await nextTick();
    const toolbar = document.querySelector('#editor-toolbar .tox-toolbar');
    if (!toolbar) {
      editorKey.value += 1;
      editorReady.value = false;
      await nextTick();
      editorReady.value = true;
    }
  };

  const currentLang = computed(() => i18n.global.locale.value);
  const isNightTheme = computed(() => user.currentTheme === 'night');

  const forceReinit = async () => {
    if (currentType.value !== 'html') return;
    editorKey.value += 1;
    editorReady.value = false;
    await nextTick();
    editorReady.value = true;
  };

  const resetUndoHistory = (editor: any) => {
    editor.undoManager?.clear?.();
    editor.undoManager?.add?.();
    editor.setDirty?.(false);
  };

  const focusToEnd = async () => {
    await nextTick();
    if (currentType.value === 'markdown') return;
    const editor = editorRef.value;
    if (!editor) return;
    editor.focus();
    const body = editor.getBody?.();
    if (body) {
      editor.selection.select(body, true);
      editor.selection.collapse(false);
    }
    editor.undoManager?.add();
    editor.nodeChanged?.();
  };

  const replaceContentWithUndo = async (value: string, inputType: 'html' | 'markdown' = 'html') => {
    await nextTick();
    if (currentType.value === 'markdown') {
      const md =
        inputType === 'markdown'
          ? value || ''
          : new TurndownService({
              headingStyle: 'atx',
              codeBlockStyle: 'fenced',
            }).turndown(value || '');
      // 用 execCommand('insertText') 替换 textarea 全文,让浏览器把这次替换记入原生撤销栈,
      // 使 AI 替换后能像 html(TinyMCE undoManager)一样 Ctrl+Z 撤回;不支持时退回直接赋值(内容正确,仅撤回失效)。
      const textarea = getMdTextarea();
      let undoable = false;
      if (textarea) {
        textarea.focus({ preventScroll: true });
        textarea.select();
        try {
          undoable = document.execCommand('insertText', false, md);
        } catch {
          undoable = false;
        }
      }
      if (undoable && textarea) {
        mdContent.value = textarea.value;
        content.value = textarea.value;
      } else {
        mdContent.value = md;
        content.value = md;
      }
      await renderMd();
      return true;
    }
    const editor = editorRef.value;
    if (!editor) return false;
    let html = value || '';
    if (inputType === 'markdown') {
      await ensureMdLib();
      html = mdToSafeHtml(html);
    }
    editor.undoManager?.transact(() => {
      editor.setContent(html);
    });
    // setContent 并不保证所有 TinyMCE 版本都会同步触发 v-model 事件；显式更新事实源，
    // 避免界面已替换但保存时仍提交旧正文。
    content.value = html;
    editor.nodeChanged?.();
    return true;
  };

  defineExpose({
    focusToEnd,
    replaceContentWithUndo,
    scrollToMarkdownHeading,
    hasSwitchBackup: switchBackup,
    triggerModeSwitch: () => handleModeSwitch(),
    triggerUndoSwitch: () => undoSwitch(),
  });

  const editorInit = computed(() => ({
    inline: true,
    menubar: false,
    branding: false,
    skin: isNightTheme.value ? 'oxide-dark' : 'oxide',
    skin_url: isNightTheme.value ? `/tinymce/skins/ui/oxide-dark` : `/tinymce/skins/ui/oxide`,
    statusbar: false,
    language: currentLang.value === 'zh-CN' ? 'zh_CN' : 'en',
    language_url: currentLang.value === 'zh-CN' ? '/tinymce/langs/zh_CN.js' : undefined,
    license_key: 'gpl',
    base_url: '/node_modules/tinymce',
    plugins: 'codesample searchreplace autolink autoresize code emoticons image link lists table wordcount quickbars',
    quickbars_selection_toolbar: 'aiEdit | myHeadingMenu |  bold italic forecolor backcolor | removeformat |quicklink',
    quickbars_insert_toolbar: false,
    codesample_languages: CODE_LANGUAGES.map((lang) => ({ text: lang.text, value: lang.value })),
    extended_valid_elements:
      'input[type|class|checked],a[href|contenteditable|title|data-ln-resource-type|data-ln-resource-id|data-ln-resource-snapshot-title|data-ln-resource-display-title|data-ln-resource-state|class|aria-disabled]',
    toolbar: props.readonly
      ? false
      : 'undo redo | blocks  | bold italic underline removeformat | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | todoCheckbox  table | link image emoticons |  codeBlock',
    fixed_toolbar_container: '#editor-toolbar',
    toolbar_persist: true,
    toolbar_mode: 'wrap',
    placeholder: t('note.contentPlaceholder'),
    readonly: false,
    content_css: false,
    emoticons_database_url: '/tinymce/plugins/emoticons/js/emojis.js',
    paste_data_images: true,
    convert_urls: false,
    automatic_uploads: props.imageUploadMode !== 'base64',
    ...(props.imageUploadMode === 'base64'
      ? {}
      : {
          images_upload_handler: (blobInfo: any) =>
            new Promise(async (resolve, reject) => {
              try {
                // 新建笔记还没 id 就粘贴图片时：先确保笔记已创建，拿到真实 noteId 再上传，
                // 后端因此不会走"noteId 为空就自动建一条笔记"的分支，避免建出多条笔记
                let nid = props.noteId;
                if (!nid && typeof props.ensureNoteId === 'function') {
                  nid = await (props.ensureNoteId as () => Promise<string>)();
                }
                const formData = new FormData();
                formData.append('file', blobInfo.blob(), blobInfo.filename());
                formData.append('noteId', nid || '');
                const res = await apiBasePost('/api/note/uploadImage', formData, {
                  headers: {
                    'Content-Type': 'multipart/form-data',
                  },
                });
                if (res.data?.noteId) {
                  emits('setNoteId', res.data.noteId);
                }
                if (res.data?.url) {
                  resolve(res.data.url);
                  return;
                }
                reject(t('note.uploadFailed'));
              } catch {
                reject(t('note.uploadFailed'));
              }
            }),
        }),
    setup: (editor: any) => {
      editorRef.value = editor;

      const refreshResourceReferences = () => {
        window.setTimeout(() => {
          if (editorRef.value !== editor) return;
          publishResourceRefs(editor.getContent({ format: 'html' }));
          decorateTinyMceResourceRefs();
        }, 0);
      };

      // chip 的实时名称/失效状态只属于展示层。TinyMCE 向 v-model 取正文时先还原快照，
      // 这样资源重命名不会无声改写用户笔记，手动改过的链接文字仍按用户输入保存。
      editor.on('GetContent', (event: { content?: string }) => {
        if (typeof event.content === 'string') {
          event.content = stripTransientMentionMarkers(serializeResourceReferenceSnapshots(event.content));
        }
      });
      editor.on('BeforeSetContent', (event: { content?: string }) => {
        if (typeof event.content === 'string') {
          event.content = stripTransientMentionMarkers(serializeResourceReferenceSnapshots(event.content));
        }
      });
      editor.on('SetContent change undo redo', refreshResourceReferences);
      editor.on('input', () => {
        refreshResourceReferences();
        window.setTimeout(() => {
          if (inlineMentionVisible.value) syncTinyMceInlineMention(editor);
          else tryOpenTinyMceMention(editor);
        }, 0);
      });
      editor.on('keydown', (event: KeyboardEvent) => {
        if (!inlineMentionVisible.value || event.isComposing) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          inlineMentionSuggestionsRef.value?.moveActive(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          inlineMentionSuggestionsRef.value?.moveActive(-1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          inlineMentionSuggestionsRef.value?.chooseActive();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeInlineMention();
        }
      });

      const todoCheckboxHtml = '<input type="checkbox" class="note-todo-checkbox" />';
      const getCurrentBlock = () => {
        const node = editor.selection ? editor.selection.getNode() : null;
        if (!node) return null;
        return editor.dom.getParent(node, 'p,div,li,td,th') as HTMLElement | null;
      };
      const getSelectedBlocks = () => {
        if (editor.selection?.getSelectedBlocks) {
          const blocks = editor.selection.getSelectedBlocks() as HTMLElement[] | null;
          if (blocks && blocks.length) return blocks;
        }
        const current = getCurrentBlock();
        return current ? [current] : [];
      };
      const isBlockEligible = (block: HTMLElement) => {
        const tagName = block.tagName.toLowerCase();
        if (!['p', 'div', 'td', 'th'].includes(tagName)) return false;
        const listParent = editor.dom.getParent(block, 'ul,ol,li');
        return !listParent;
      };
      const hasIneligibleSelection = (blocks: HTMLElement[]) =>
        blocks.length === 0 || blocks.some((block) => !isBlockEligible(block));
      const getLeadingCheckbox = (block: HTMLElement | null) => {
        if (!block) return null;
        let firstNode: ChildNode | null = block.firstChild;
        while (firstNode && firstNode.nodeType === 3 && !firstNode.textContent?.trim()) {
          firstNode = firstNode.nextSibling;
        }
        if (firstNode && firstNode.nodeType === 1) {
          const el = firstNode as HTMLElement;
          if (el.tagName === 'INPUT' && el.classList.contains('note-todo-checkbox')) {
            return el as HTMLInputElement;
          }
        }
        return null;
      };
      const removeLeadingCheckbox = (block: HTMLElement | null) => {
        if (!block) return;
        const checkbox = getLeadingCheckbox(block);
        if (!checkbox) return;
        const next = checkbox.nextSibling;
        editor.undoManager.transact(() => {
          if (next && next.nodeType === 3 && !next.textContent?.trim()) {
            block.removeChild(next);
          }
          block.removeChild(checkbox);
        });
      };
      const ensureTodoCheckbox = (block: HTMLElement | null) => {
        if (!block) return;
        if (getLeadingCheckbox(block)) return;
        const checkboxEl = editor.dom.create('input', {
          type: 'checkbox',
          class: 'note-todo-checkbox',
        }) as HTMLInputElement;
        const spacer = editor.dom.doc.createTextNode(' ');
        editor.undoManager.transact(() => {
          block.insertBefore(spacer, block.firstChild);
          block.insertBefore(checkboxEl, spacer);
        });
      };
      const splitTodoLineAtCursor = (block: HTMLElement | null) => {
        if (!block || !block.parentNode) return;
        const rng = editor.selection.getRng();
        // 有选区时先删掉选中内容，光标落到删除点
        if (!rng.collapsed) rng.deleteContents();
        // 取「光标 → 本行末尾」的内容（勾选框在光标之前，不会被带走）
        const tailRange = editor.dom.createRng();
        tailRange.selectNodeContents(block);
        tailRange.setStart(rng.startContainer, rng.startOffset);
        const tail = tailRange.extractContents();
        // 新建一行：勾选框 + 空格 + 光标之后的文字（光标在行中间时把后半段带过去）
        const tagName = block.tagName || 'P';
        const newBlock = editor.dom.create(tagName, {}) as HTMLElement;
        const checkboxEl = editor.dom.create('input', {
          type: 'checkbox',
          class: 'note-todo-checkbox',
        });
        const spacer = editor.dom.doc.createTextNode(' ');
        newBlock.appendChild(checkboxEl);
        newBlock.appendChild(spacer);
        if (tail && tail.childNodes.length) {
          newBlock.appendChild(tail);
        }
        editor.dom.insertAfter(newBlock, block);
        // 光标落到新行的文字开头（勾选框和空格之后、被带过来的文字之前）
        editor.selection.setCursorLocation(spacer, spacer.length);
      };

      editor.ui.registry.addIcon('todo-checkbox', icon.noteDetail.toolbar.todo);
      editor.ui.registry.addButton('todoCheckbox', {
        icon: 'todo-checkbox',
        tooltip: t('todo'),
        onSetup: (api) => {
          const refresh = () => {
            if (!editor.hasFocus()) {
              api.setEnabled(false);
              return;
            }
            const blocks = getSelectedBlocks();
            api.setEnabled(!hasIneligibleSelection(blocks));
          };
          refresh();
          editor.on('focus', refresh);
          editor.on('blur', refresh);
          editor.on('NodeChange', refresh);
          editor.on('SelectionChange', refresh);
          return () => {
            editor.off('focus', refresh);
            editor.off('blur', refresh);
            editor.off('NodeChange', refresh);
            editor.off('SelectionChange', refresh);
          };
        },
        onAction: () => {
          if (!editor.hasFocus()) return;
          const blocks = getSelectedBlocks();
          if (hasIneligibleSelection(blocks)) return;
          const eligibleBlocks = blocks.filter((block) => isBlockEligible(block));
          if (!eligibleBlocks.length) return;
          const allHaveCheckbox = eligibleBlocks.every((block) => getLeadingCheckbox(block));
          editor.undoManager.transact(() => {
            if (allHaveCheckbox) {
              eligibleBlocks.forEach((block) => removeLeadingCheckbox(block));
              return;
            }
            eligibleBlocks.forEach((block) => {
              if (!getLeadingCheckbox(block)) {
                ensureTodoCheckbox(block);
              }
            });
          });
        },
      });
      editor.ui.registry.addIcon('code-block', icon.noteDetail.toolbar.codeBlock);
      editor.ui.registry.addToggleButton('codeBlock', {
        icon: 'code-block',
        tooltip: t('noteDetail.editor.codeBlock'),
        onSetup: (api) => {
          const refresh = () => {
            const node = editor.selection ? editor.selection.getStart() : null;
            const isActive = node ? editor.dom.is(node, 'pre') : false;
            api.setActive(isActive);
          };
          refresh();
          editor.on('NodeChange', refresh);
          return () => editor.off('NodeChange', refresh);
        },
        onAction: () => editor.execCommand('FormatBlock', false, 'pre'),
      });
      editor.ui.registry.addMenuButton('myHeadingMenu', {
        text: t('noteDetail.editor.headingMenu'),
        fetch: function (callback) {
          const items = [
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading1'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h1'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading2'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h2'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading3'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h3'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading4'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h4'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading5'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h5'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading6'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h6'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.paragraph'),
              onAction: () => editor.execCommand('FormatBlock', false, 'p'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.codeBlock'),
              onAction: () => editor.execCommand('FormatBlock', false, 'pre'),
            },
          ];
          callback(items);
        },
      });

      // 划词 AI:选中文字后在浮动工具条点「AI」→ 就地润色/翻译/精简/扩写,结果替换选区
      const AI_SEL_TASK: Record<string, string> = {
        polish: '把下面这段文字润色得更通顺自然,保持原意和原语言',
        translate: '把下面这段文字在中文与英文之间翻译(中文内容译成英文,英文内容译成中文)',
        condense: '把下面这段文字精简得更短,只保留关键信息',
        expand: '把下面这段文字扩写得更充实,补充合理的细节',
      };
      const aiEditSelection = async (action: string) => {
        const raw = editor.selection ? editor.selection.getContent({ format: 'text' }) : '';
        const text = String(raw || '').trim();
        if (!text) {
          message.warning(t('noteDetail.editor.aiSelectFirst'));
          return;
        }
        editor.setProgressState(true);
        try {
          // 该 AI 端点始终以 SSE 流返回(stream:false 会拿到未解析的原始 SSE),故用流式并自行收集,与 AiReply 一致
          let full = '';
          let buffer = '';
          let processed = 0;
          const parseLine = (line: string) => {
            const l = line.trim();
            if (!l.startsWith('data:')) return;
            const ds = l.slice(5).trim();
            if (!ds || ds === '[DONE]') return;
            try {
              const d = JSON.parse(ds);
              const c = d.output?.text || d.text || d.content || '';
              if (c && typeof c === 'string') full += c;
            } catch {
              /* 跳过不完整片段 */
            }
          };
          await apiBasePost(
            '/api/note/assist',
            {
              message: `任务:${AI_SEL_TASK[action]}。只输出处理后的纯文本,不要任何解释、前后缀或 markdown 代码块。\n\n原文:\n${text}`,
              stream: true,
              sessionId: '',
            },
            {
              headers: { 'Content-Type': 'application/json' },
              responseType: 'text',
              onDownloadProgress: (progressEvent: any) => {
                const ev = progressEvent?.event ?? progressEvent;
                const rt = (ev?.target as XMLHttpRequest | null)?.responseText ?? '';
                if (!rt) return;
                const chunk = rt.slice(processed);
                processed = rt.length;
                if (!chunk) return;
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                lines.forEach(parseLine);
              },
            },
          );
          if (buffer) buffer.split('\n').forEach(parseLine); // 收尾残余
          const out = full.trim();
          if (out) {
            editor.selection.setContent(editor.dom.encode(out).replace(/\n/g, '<br>')); // 文本编码回填,防 HTML 注入,保留换行
          } else {
            message.info(t('noteDetail.editor.aiEmpty'));
          }
        } catch {
          message.info(t('noteDetail.editor.aiFailed'));
        } finally {
          editor.setProgressState(false);
        }
      };
      editor.ui.registry.addMenuButton('aiEdit', {
        text: 'AI',
        tooltip: t('noteDetail.editor.aiEditTip'),
        fetch: function (callback) {
          callback([
            { type: 'menuitem', text: t('noteDetail.editor.aiPolish'), onAction: () => aiEditSelection('polish') },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.aiTranslate'),
              onAction: () => aiEditSelection('translate'),
            },
            { type: 'menuitem', text: t('noteDetail.editor.aiCondense'), onAction: () => aiEditSelection('condense') },
            { type: 'menuitem', text: t('noteDetail.editor.aiExpand'), onAction: () => aiEditSelection('expand') },
          ]);
        },
      });

      const syncCheckboxAttribute = (target: EventTarget | null) => {
        if (!target) return;
        const el = target as HTMLElement;
        if (el.tagName !== 'INPUT' || !el.classList.contains('note-todo-checkbox')) return;
        const input = el as HTMLInputElement;
        if (input.checked) {
          editor.dom.setAttrib(input, 'checked', 'checked');
        } else {
          editor.dom.setAttrib(input, 'checked', null);
        }
      };

      editor.on('click', (event: MouseEvent) => {
        const target = event.target;
        const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
        const ref = anchor ? parseResourceHref(anchor.getAttribute('href')) : null;
        if (ref) {
          event.preventDefault();
          event.stopPropagation();
          handleResourceRefClick(ref, anchor);
          return;
        }
        syncCheckboxAttribute(event.target);
      });
      editor.on('change', (event: Event) => {
        syncCheckboxAttribute(event.target);
      });

      editor.on('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' || event.isComposing) return;
        const block = getCurrentBlock();
        if (!block) return;
        if (!getLeadingCheckbox(block)) return;
        event.preventDefault();
        editor.undoManager.transact(() => {
          splitTodoLineAtCursor(block);
        });
      });
      editor.on('init', async () => {
        if (editor.mode?.set) {
          editor.mode.set(props.readonly ? 'readonly' : 'design');
        } else if (editor.setMode) {
          editor.setMode(props.readonly ? 'readonly' : 'design');
        }
        await ensureToolbarRendered();
        window.setTimeout(() => {
          resetUndoHistory(editor);
          refreshResourceReferences();
          emits('ready');
        }, 0);
      });
    },
    content_style: [
      '.note-editor-body, .mce-content-body { font-family: inherit; background-color: var(--background-color); color: var(--text-color); padding: 5px 20px 20px; } .note-editor-body h1,.note-editor-body h2,.note-editor-body h3,.note-editor-body h4,.note-editor-body h5,.note-editor-body h6, .mce-content-body h1,.mce-content-body h2,.mce-content-body h3,.mce-content-body h4,.mce-content-body h5,.mce-content-body h6{ margin: 0.6em 0 0.4em; } .note-editor-body table, .mce-content-body table{ border-collapse: collapse; width: 100%; } .note-editor-body table td, .mce-content-body table th, .note-editor-body table td, .mce-content-body table th{ border: 1px solid #d9d9d9; padding: 6px 10px; } .note-editor-body pre.code-block, .mce-content-body pre.code-block, .note-editor-body pre[class*="language-"], .mce-content-body pre[class*="language-"]{ background: #f6f8fa; border: 1px solid #e5e7eb; padding: 12px 14px; border-radius: 10px; overflow: auto; } .note-editor-body pre.code-block code, .mce-content-body pre.code-block code, .note-editor-body pre[class*="language-"] code, .mce-content-body pre[class*="language-"] code{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 13px; white-space: pre; display: block; } .note-editor-body pre.code-block[data-language]::before, .mce-content-body pre.code-block[data-language]::before{ content: attr(data-language); display: inline-block; margin-bottom: 8px; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.02em; } .note-editor-body img, .mce-content-body img{ max-width: 100% !important; height: auto !important; box-sizing: border-box; object-fit: contain; } .note-editor-body .note-todo-checkbox, .mce-content-body .note-todo-checkbox{ vertical-align: middle; margin-right: 6px; } .note-editor-body a.ln-resource-link, .mce-content-body a.ln-resource-link{ display:inline-flex; align-items:center; max-width:100%; margin:0 2px; padding:1px 7px; border:1px solid color-mix(in srgb, var(--primary-color) 26%, transparent); border-radius:999px; background:color-mix(in srgb, var(--primary-color) 9%, transparent); color:var(--primary-color); line-height:1.55; text-decoration:none; vertical-align:baseline; cursor:pointer; } .note-editor-body a.ln-resource-link[data-ln-resource-state="unavailable"], .mce-content-body a.ln-resource-link[data-ln-resource-state="unavailable"]{ border-style:dashed; color:var(--desc-color); background:color-mix(in srgb, var(--desc-color) 8%, transparent); cursor:not-allowed; } .mce-content-body:not([dir=rtl])[data-mce-placeholder]:not(.mce-visualblocks)::before{ left: 10px; }',
      // 资源 chip 用普通 inline box，不参与行高计算；避免插入后把整行文字向下撑开。
      '.note-editor-body a.ln-resource-link, .mce-content-body a.ln-resource-link{ display:inline; margin:0 2px; padding:0 6px; line-height:inherit; vertical-align:baseline; overflow-wrap:anywhere; -webkit-box-decoration-break:clone; box-decoration-break:clone; }',
      bookmark.isMobile
        ? '.note-editor-body, .mce-content-body { max-width: 100%; overflow-wrap: anywhere; box-sizing: border-box; } .note-editor-body h1, .mce-content-body h1 { font-size: clamp(26px, 8vw, 38px); line-height: 1.2; overflow-wrap: anywhere; }'
        : '',
    ].join(' '),
  }));

  watchEffect(() => {
    if (!editorRef.value) return;
    if (editorRef.value.mode?.set) {
      editorRef.value.mode.set(props.readonly ? 'readonly' : 'design');
      return;
    }
    if (editorRef.value.setMode) {
      editorRef.value.setMode(props.readonly ? 'readonly' : 'design');
    }
  });

  onMounted(() => {
    ensureToolbar();
    const container = document.getElementById('editor-container');
    if (container && 'IntersectionObserver' in window) {
      visibilityObserver = new IntersectionObserver(async (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          await ensureToolbarRendered();
        }
      });
      visibilityObserver.observe(container);
    }
  });

  watch(currentLang, () => {
    if (!editorReady.value) return;
    forceReinit();
  });

  watch(isNightTheme, () => {
    if (!editorReady.value) return;
    forceReinit();
  });

  onBeforeUnmount(() => {
    if (mdRenderTimer) clearTimeout(mdRenderTimer);
    if (mdScrollUnlockTimer) window.clearTimeout(mdScrollUnlockTimer);
    if (visibilityObserver) {
      visibilityObserver.disconnect();
      visibilityObserver = null;
    }
    if (editorRef.value) {
      editorRef.value.remove();
    }
  });
</script>

<style lang="less">
  #editor-container.note-editor {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    height: auto;
    min-height: 0;
    overflow: hidden;
  }
  .note-editor-toolbar {
    flex-shrink: 0;
    overflow: hidden;
    border-bottom: 1px solid var(--surface-border-color);
    background-color: var(--note-editor-header-bg, var(--w-e-toolbar-bg-color));
  }
  .note-editor-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .note-editor-body {
    outline: none;
    overflow: visible;
    background-color: var(--background-color);
    color: var(--text-color);
    padding: 5px 10px 20px;
    min-height: 100%;
  }

  .resource-mention-mobile-preview {
    display: grid;
    gap: 14px;
    min-width: min(300px, calc(90vw - 32px));

    &__summary {
      display: grid;
      gap: 4px;

      strong {
        overflow: hidden;
        color: var(--text-color);
        font-size: 16px;
        line-height: 1.4;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      span {
        color: var(--desc-color, #737782);
        font-size: 13px;
      }
    }

    &__status {
      margin: 0;
      color: var(--desc-color, #737782);
      font-size: 13px;
      line-height: 1.5;

      &.is-unavailable {
        color: var(--error-color, #e5484d);
      }
    }

    &__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }
  }

  /* 模式切换栏 */
  .editor-mode-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--card-border-color, #e8eaf2);
    background: var(--background-color);
  }
  .mode-pill {
    display: inline-flex;
    align-items: center;
    padding: 0 10px;
    height: 22px;
    border-radius: 11px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: background 0.15s;
    user-select: none;
    background: var(--common-tag-bg-color, #f0f0f0);
    color: var(--desc-color, #666);
    &.is-markdown {
      background: #615ced20;
      color: #615ced;
    }
    &.is-html {
      background: #00a88420;
      color: #00a884;
    }
    &:hover {
      opacity: 0.8;
    }
  }
  .undo-switch-btn {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
    height: 22px;
    border: 1px solid var(--card-border-color, #e8eaf2);
    border-radius: 6px;
    background: transparent;
    color: var(--text-color);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
    &:hover {
      background: var(--common-tag-bg-color, #f0f0f0);
      border-color: var(--primary-color, #615ced);
      color: var(--primary-color, #615ced);
    }
  }

  /* Markdown 编辑器工具栏 */
  .md-editor-toolbar {
    display: flex;
    align-items: center;
    min-height: 40px;
    padding: 0 12px;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--note-editor-header-bg, var(--surface-panel-bg, var(--background-color)));
    flex-shrink: 0;
  }
  .md-view-toggle {
    flex: 1 1 auto;
    width: 100%;
    gap: 0;
    margin: 0;
    padding: 0;
    border-bottom: 0;

    .tab {
      flex: 1 1 0;
      min-width: 0;
      justify-content: center;
      padding: 9px 14px 8px;
      color: var(--desc-color);
      font-size: 12px;
    }

    .tab.is-active {
      color: var(--resource-note-color, #00a884);
      font-weight: 650;
    }

    .underline {
      height: 2px;
      border-radius: 0;
      background: var(--resource-note-color, #00a884);
    }
  }

  /* Markdown 编辑器 */
  .md-editor-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .md-editor-body {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
    &.md-view-edit .md-preview-pane,
    &.md-view-preview .md-editor-pane {
      display: none;
    }
  }
  .md-editor-pane,
  .md-preview-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }
  .md-editor-pane {
    border-right: 1px solid var(--card-border-color, #e8eaf2);
  }
  .md-editor-label {
    padding: 4px 10px;
    font-size: 11px;
    color: var(--desc-color, #888);
    border-bottom: 1px solid var(--card-border-color, #e8eaf2);
    flex-shrink: 0;
  }
  .md-textarea {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;

    .b-textarea {
      flex: 1;
      min-height: 0;
      height: 100%;
      resize: none;
      border: none !important;
      border-radius: 0;
      outline: none;
      padding: 15px !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
      background: var(--background-color) !important;
      color: var(--text-color);

      &::placeholder {
        color: var(--desc-color, #999);
      }
    }
  }
  .md-preview {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px;
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.7;
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 0.6em 0 0.4em;
    }
    pre {
      border: 1px solid var(--card-border-color, #e5e7eb);
      border-radius: 8px;
      padding: 10px 12px;
      overflow: auto;
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
        font-size: 13px;
      }
    }
    code {
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      th,
      td {
        border: 1px solid var(--card-border-color, #d9d9d9);
        padding: 6px 10px;
      }
    }
    blockquote {
      border-left: 3px solid var(--primary-color, #615ced);
      margin: 0;
      padding: 4px 12px;
      color: var(--desc-color, #666);
      background: var(--common-tag-bg-color, #f9f9f9);
      border-radius: 0 6px 6px 0;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    ul,
    ol {
      padding-left: 20px;
    }
    a.ln-resource-link {
      // inline 的 border 不参与行高计算，标签不会再把同一行文本顶开。
      display: inline;
      margin: 0 2px;
      padding: 0 6px;
      border: 1px solid color-mix(in srgb, var(--primary-color) 26%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--primary-color) 9%, transparent);
      color: var(--primary-color);
      line-height: inherit;
      text-decoration: none;
      vertical-align: baseline;
      cursor: pointer;
      overflow-wrap: anywhere;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;

      &[data-ln-resource-state='unavailable'] {
        border-style: dashed;
        background: color-mix(in srgb, var(--desc-color) 8%, transparent);
        color: var(--desc-color);
        cursor: not-allowed;
      }
    }
  }

  .note-editor .tox .tox-toolbar,
  .note-editor .tox .tox-toolbar__primary,
  .note-editor .tox .tox-toolbar__overflow {
    background-color: var(--note-editor-header-bg, var(--w-e-toolbar-bg-color)) !important;
    border: none !important;
    box-shadow: none !important;
  }
  .note-editor .tox .tox-editor-header {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background-color: var(--note-editor-header-bg, var(--w-e-toolbar-bg-color)) !important;
  }
  .note-editor .tox .tox-toolbar__group {
    border: none !important;
    box-shadow: none !important;
  }
  .note-editor .tox .tox-tbtn svg {
    fill: var(--w-e-toolbar-color) !important;
  }
  .note-editor .tox .tox-tbtn--disabled svg {
    fill: #999 !important;
  }
  .note-editor .tox .tox-collection__item-label {
    font-size: 12px;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .note-editor .tox .tox-edit-area,
  .note-editor .tox .tox-edit-area__iframe {
    background-color: var(--background-color) !important;
  }
  [data-theme='night'] {
    .note-editor-toolbar {
      border-bottom-color: var(--surface-border-color);
      background-color: var(--note-editor-header-bg, #25262b);
    }

    .note-editor .tox .tox-toolbar,
    .note-editor .tox .tox-toolbar__primary,
    .note-editor .tox .tox-toolbar__overflow,
    .note-editor .tox .tox-editor-header {
      background-color: var(--note-editor-header-bg, #25262b) !important;
    }

    .note-editor .tox .tox-toolbar__group {
      background-color: transparent !important;
      border-right: 1px solid #3a3d46 !important;
    }

    .note-editor .tox .tox-tbtn,
    .note-editor .tox .tox-mbtn {
      color: #d5d8e1 !important;
      background-color: #343741 !important;
      border: 1px solid #474b56 !important;
    }

    .note-editor .tox .tox-tbtn__select-label,
    .note-editor .tox .tox-mbtn__select-label {
      color: #d5d8e1 !important;
    }

    .note-editor .tox .tox-tbtn svg,
    .note-editor .tox .tox-mbtn svg {
      fill: #d5d8e1 !important;
    }

    .note-editor .tox .tox-tbtn:hover,
    .note-editor .tox .tox-tbtn:focus,
    .note-editor .tox .tox-mbtn:hover,
    .note-editor .tox .tox-mbtn:focus {
      background-color: #414654 !important;
      border-color: #596073 !important;
      color: #f5f7ff !important;
    }

    .note-editor .tox .tox-tbtn:hover svg,
    .note-editor .tox .tox-tbtn:focus svg,
    .note-editor .tox .tox-mbtn:hover svg,
    .note-editor .tox .tox-mbtn:focus svg {
      fill: #f5f7ff !important;
    }

    .note-editor .tox .tox-tbtn.tox-tbtn--enabled,
    .note-editor .tox .tox-tbtn.tox-tbtn--enabled:hover {
      background-color: #59637d !important;
      border-color: #7480a0 !important;
      color: #ffffff !important;
    }

    .note-editor .tox .tox-tbtn.tox-tbtn--enabled svg,
    .note-editor .tox .tox-tbtn.tox-tbtn--enabled:hover svg {
      fill: #ffffff !important;
    }

    .note-editor .tox .tox-tbtn--disabled,
    .note-editor .tox .tox-tbtn--disabled:hover {
      background-color: #2b2d33 !important;
      border-color: #3a3d46 !important;
      color: #767d8f !important;
    }

    .note-editor .tox .tox-tbtn--disabled svg {
      fill: #767d8f !important;
    }

    .note-editor .tox .tox-collection,
    .note-editor .tox .tox-menu,
    .note-editor .tox .tox-collection--list,
    .note-editor .tox .tox-collection--grid {
      background-color: #2c2f37 !important;
      border: 1px solid #444955 !important;
      color: #dfe3ee !important;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35) !important;
    }

    .note-editor .tox .tox-collection__item,
    .note-editor .tox .tox-collection__item-label {
      color: #dfe3ee !important;
    }

    .note-editor .tox .tox-collection__item--active,
    .note-editor .tox .tox-collection__item--enabled:hover,
    .note-editor .tox .tox-collection__item--enabled:focus {
      background-color: #414654 !important;
      color: #ffffff !important;
    }

    .note-editor .tox .tox-collection--list .tox-collection__item,
    .note-editor .tox .tox-collection--list .tox-collection__item-label,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h1,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h2,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h3,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h4,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h5,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h6,
    .note-editor .tox .tox-collection--list .tox-collection__item-label p,
    .note-editor .tox .tox-collection--list .tox-collection__item-label pre {
      color: #dfe3ee !important;
    }

    .note-editor .tox .tox-collection--list .tox-collection__item--active,
    .note-editor .tox .tox-collection--list .tox-collection__item--enabled:hover,
    .note-editor .tox .tox-collection--list .tox-collection__item--enabled:focus,
    .note-editor .tox .tox-collection--list .tox-collection__item--selected {
      background-color: #4a5163 !important;
      color: #ffffff !important;
    }

    .note-editor .tox .tox-collection--list .tox-collection__item--state-disabled,
    .note-editor .tox .tox-collection--list .tox-collection__item--state-disabled .tox-collection__item-label,
    .note-editor .tox .tox-collection--list .tox-collection__item--state-disabled .tox-collection__item-label * {
      color: #7b8294 !important;
    }

    .tox .tox-collection--list .tox-collection__item--active,
    .tox .tox-collection--list .tox-collection__item--enabled:hover,
    .tox .tox-collection--list .tox-collection__item--enabled:focus,
    .tox .tox-collection--list .tox-collection__item--selected {
      background-color: #4a5163 !important;
      color: #ffffff !important;
    }

    .tox .tox-collection--list .tox-collection__item--enabled:not(.tox-collection__item--state-disabled) {
      background-color: #2f3442 !important;
      color: #dfe3ee !important;
    }

    .tox .tox-collection--list .tox-collection__item--active:not(.tox-collection__item--state-disabled),
    .tox .tox-collection--list .tox-collection__item--active.tox-collection__item--state-disabled {
      background-color: #4a5163 !important;
      color: #ffffff !important;
    }
  }
  code[data-mce-selected='inline-boundary'] {
    background-color: unset !important;
  }
  .note-editor-body pre[class*='language-'],
  .mce-content-body pre[class*='language-'] {
    text-shadow: none !important;
  }
  .tox .tox-collection__item {
    cursor: pointer;
    height: 24px;
  }
  .tox-collection__item-label {
    h1 {
      font-size: 17px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h2 {
      font-size: 16px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h3 {
      font-size: 15px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h4 {
      font-size: 14px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h5 {
      font-size: 13px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h6 {
      font-size: 12px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    p {
      font-size: 11px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    pre {
      color: var(--text-color) !important;
      font-family: 微软雅黑 !important;
      font-size: 12px !important;
      background-color: transparent !important;
      border: none !important;
      overflow: hidden !important;
    }
  }

  @media (max-width: 767px) {
    .note-editor-body,
    .md-preview {
      max-width: 100%;
      overflow-wrap: anywhere;
      box-sizing: border-box;
    }

    .note-editor-body img,
    .md-preview img {
      max-width: 100% !important;
      height: auto !important;
      object-fit: contain;
    }

    .note-editor-body h1,
    .md-preview h1 {
      font-size: clamp(26px, 8vw, 38px);
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
  }

  /* 移动端 MD 视图由选项数据移除分栏，只保留编辑和预览。 */
  @media (max-width: 1024px) {
    /* 富文本工具栏(TinyMCE inline + fixed_toolbar_container):窄屏下默认会把 9 个按钮组挤压,
       组内按钮再竖向堆叠,呈现"网格状"多行错乱(真机移动端亦如此)。这里强制单行 + 横向滚动:
       组不收缩(flex-shrink:0)、组内不换行(nowrap),整条工具栏超宽时横向滚动。
       用 @media 按视口宽度即时生效,切换尺寸/真机都无需刷新。 */
    .note-editor .tox-editor-header {
      grid-template-columns: 100% !important;
      grid-template-rows: auto !important;
    }
    .note-editor .tox-toolbar {
      flex-wrap: nowrap !important;
      overflow-x: auto !important;
    }
    .note-editor .tox-toolbar__group {
      flex-wrap: nowrap !important;
      flex-shrink: 0 !important;
    }
  }
</style>
