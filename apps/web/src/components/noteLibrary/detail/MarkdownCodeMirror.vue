<template>
  <div ref="hostRef" class="markdown-codemirror" :class="{ 'is-mobile': mobile }"></div>
</template>

<script lang="ts">
  import type { EditResult } from '@/utils/markdownEditing';

  export interface MarkdownCodeMirrorExpose {
    getValue: () => string;
    getSelection: () => { from: number; to: number };
    focus: (options?: FocusOptions) => void;
    setSelection: (from: number, to?: number) => void;
    applyEdit: (result: EditResult) => void;
    replaceRange: (from: number, to: number, text: string, selectionFrom?: number, selectionTo?: number) => void;
    replaceAll: (value: string, addToHistory?: boolean) => void;
    undo: () => boolean;
    redo: () => boolean;
    canUndo: () => boolean;
    canRedo: () => boolean;
    getSelectedText: () => string;
    runSearch: (request: MarkdownSearchRequest, direction?: 'next' | 'previous') => number;
    clearSearch: () => void;
    replaceSearchMatch: (request: MarkdownSearchRequest) => number;
    replaceAllSearchMatches: (request: MarkdownSearchRequest) => number;
    coordsAtPos: (position: number) => DOMRect | null;
    getScrollElement: () => HTMLElement | null;
    scrollToPosition: (position: number, selectionEnd?: number, behavior?: ScrollBehavior) => void;
  }

  export interface MarkdownSearchRequest {
    query: string;
    replacement: string;
    matchCase: boolean;
    wholeWord: boolean;
  }
</script>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
  import { defaultKeymap, history, historyKeymap, redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import {
    bracketMatching,
    defaultHighlightStyle,
    HighlightStyle,
    indentOnInput,
    syntaxHighlighting,
  } from '@codemirror/language';
  import { lintKeymap } from '@codemirror/lint';
  import {
    findNext,
    findPrevious,
    highlightSelectionMatches,
    replaceAll as replaceAllSearchMatches,
    replaceNext as replaceNextSearchMatch,
    search as codeMirrorSearch,
    SearchQuery,
    setSearchQuery,
  } from '@codemirror/search';
  import { Compartment, EditorState, Prec, Transaction } from '@codemirror/state';
  import {
    crosshairCursor,
    drawSelection,
    dropCursor,
    EditorView,
    highlightActiveLine,
    highlightSpecialChars,
    keymap,
    placeholder as codeMirrorPlaceholder,
    rectangularSelection,
    type KeyBinding,
  } from '@codemirror/view';
  import { GFM } from '@lezer/markdown';
  import { tags } from '@lezer/highlight';

  const props = withDefaults(
    defineProps<{
      modelValue: string;
      readonly?: boolean;
      mobile?: boolean;
      locale?: string;
      placeholder?: string;
    }>(),
    { modelValue: '', readonly: false, mobile: false, locale: 'zh-CN', placeholder: '' },
  );

  const emit = defineEmits<{
    'update:modelValue': [value: string];
    input: [value: string];
    paste: [event: ClipboardEvent];
    keydown: [event: KeyboardEvent];
    command: [command: string];
    'selection-change': [];
    scroll: [];
    blur: [];
    ready: [];
    'history-change': [state: { canUndo: boolean; canRedo: boolean }];
  }>();

  const hostRef = ref<HTMLElement | null>(null);
  let view: EditorView | null = null;
  const editableCompartment = new Compartment();
  const phrasesCompartment = new Compartment();
  const wrappingCompartment = new Compartment();
  let scrollbarIdleTimer: number | null = null;

  const markdownHighlightStyle = HighlightStyle.define([
    {
      tag: tags.strong,
      fontWeight: '700',
    },
    {
      tag: [tags.link, tags.url],
      color: 'var(--note-editor-link-color, var(--info-color, var(--primary-color)))',
      textDecoration: 'underline',
    },
  ]);

  function searchPhrases(locale: string) {
    if (!locale.toLowerCase().startsWith('zh')) return {};
    return {
      Find: '查找',
      Replace: '替换为',
      next: '下一个',
      previous: '上一个',
      all: '全选匹配',
      'match case': '区分大小写',
      regexp: '正则表达式',
      'by word': '全字匹配',
      replace: '替换',
      'replace all': '全部替换',
      close: '关闭搜索',
    };
  }

  const markdownShortcutBindings: KeyBinding[] = [
    ['Mod-b', 'bold'],
    ['Mod-i', 'italic'],
    ['Mod-k', 'link'],
    ['Mod-f', 'findReplace'],
    ['F4', 'repeatLastAction'],
    ['Mod-Alt-r', 'repeatLastAction'],
    ['Mod-Shift-x', 'strike'],
    ['Mod-e', 'inlineCode'],
    ['Mod-Shift-7', 'orderedList'],
    ['Mod-Shift-8', 'bulletList'],
    ...Array.from({ length: 6 }, (_, index) => [`Mod-Alt-${index + 1}`, `heading${index + 1}`]),
  ].map(([shortcut, command]) => ({
    key: shortcut,
    preventDefault: true,
    run: () => {
      if (props.readonly) return false;
      emit('command', command);
      return true;
    },
  }));

  // 显式声明编辑能力，避免 basicSetup 默认带回行号与折叠 gutter；轻笺保持写作型编辑器的纯正文边界。
  const editorSetup = [
    highlightSpecialChars(),
    history(),
    codeMirrorSearch(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    syntaxHighlighting(markdownHighlightStyle),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap]),
  ];

  const editorTheme = EditorView.theme({
    '&': {
      height: '100%',
      minHeight: '0',
      backgroundColor: 'var(--surface-page-bg, var(--background-color))',
      color: 'var(--text-color)',
      fontSize: '13px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      minHeight: '0',
      overflow: 'auto',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
      lineHeight: '22px',
      overscrollBehavior: 'contain',
      WebkitOverflowScrolling: 'touch',
    },
    '.cm-content': {
      minHeight: '100%',
      // 保留一段可继续下滚的写作空间，避免光标长期贴在视口最后一行。
      padding: '14px 12px clamp(160px, 35vh, 360px)',
      caretColor: 'var(--text-color)',
    },
    '.cm-line': {
      minHeight: '22px',
      padding: '0 4px',
      lineHeight: '22px',
    },
    '.cm-activeLine': {
      // 选区绘制层位于正文行下方；实色当前行背景会把单行拖选完全盖住。
      backgroundColor: 'rgba(97, 92, 237, 0.045)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--selection-background, rgba(97, 92, 237, 0.24)) !important',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary-color)' },
    '.cm-panels': {
      borderColor: 'var(--surface-border-color)',
      backgroundColor: 'var(--surface-panel-bg, var(--background-color))',
      color: 'var(--text-color)',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid var(--surface-border-color)',
      backgroundColor: 'var(--workspace-panel-bg-color, var(--surface-panel-bg))',
      boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
    },
    '.cm-searchMatch': {
      outline: '1px solid var(--primary-color)',
      backgroundColor: 'rgba(97, 92, 237, 0.16)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      outline: '2px solid var(--primary-color)',
      backgroundColor: 'rgba(97, 92, 237, 0.26)',
    },
    '.cm-tooltip': {
      border: '1px solid var(--surface-border-color)',
      backgroundColor: 'var(--card-background, var(--background-color))',
      color: 'var(--text-color)',
    },
  });

  function historyState() {
    if (!view) return { canUndo: false, canRedo: false };
    return { canUndo: undoDepth(view.state) > 0, canRedo: redoDepth(view.state) > 0 };
  }

  function emitHistoryState() {
    emit('history-change', historyState());
  }

  function createEditor() {
    if (!hostRef.value || view) return;
    view = new EditorView({
      parent: hostRef.value,
      doc: props.modelValue || '',
      extensions: [
        editorSetup,
        // 放在默认 keymap 之上，确保 ⌘/Ctrl+B 等编辑命令不落到浏览器默认行为。
        Prec.highest(keymap.of(markdownShortcutBindings)),
        markdown({ extensions: [GFM] }),
        phrasesCompartment.of(EditorState.phrases.of(searchPhrases(props.locale))),
        // 桌面端保持一行一个逻辑行；移动端屏幕窄，继续自动换行避免横向拖动。
        wrappingCompartment.of(props.mobile ? EditorView.lineWrapping : []),
        codeMirrorPlaceholder(props.placeholder),
        editorTheme,
        editableCompartment.of([EditorState.readOnly.of(props.readonly), EditorView.editable.of(!props.readonly)]),
        EditorView.contentAttributes.of({
          'aria-label': props.placeholder,
          spellcheck: 'true',
          autocapitalize: 'sentences',
        }),
        EditorView.domEventHandlers({
          paste(event) {
            emit('paste', event);
            return event.defaultPrevented;
          },
          keydown(event) {
            emit('keydown', event);
            return event.defaultPrevented;
          },
          blur() {
            emit('blur');
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const value = update.state.doc.toString();
            emit('update:modelValue', value);
            emit('input', value);
            emitHistoryState();
          }
          if (update.selectionSet) emit('selection-change');
        }),
      ],
    });
    view.scrollDOM.addEventListener('scroll', handleScroll, { passive: true });
    view.scrollDOM.classList.add('auto-scrollbar');
    emitHistoryState();
    emit('ready');
  }

  function handleScroll() {
    const scrollElement = view?.scrollDOM;
    if (scrollElement) {
      scrollElement.classList.add('is-scrolling');
      if (scrollbarIdleTimer) window.clearTimeout(scrollbarIdleTimer);
      scrollbarIdleTimer = window.setTimeout(() => {
        scrollElement.classList.remove('is-scrolling');
        scrollbarIdleTimer = null;
      }, 700);
    }
    emit('scroll');
  }

  function safePosition(position: number) {
    return Math.max(0, Math.min(position, view?.state.doc.length || 0));
  }

  function setSelection(from: number, to = from) {
    if (!view) return;
    const safeFrom = safePosition(from);
    const safeTo = safePosition(to);
    view.dispatch({ selection: { anchor: safeFrom, head: safeTo } });
  }

  function replaceRange(from: number, to: number, text: string, selectionFrom?: number, selectionTo?: number) {
    if (!view || props.readonly) return;
    const safeFrom = safePosition(from);
    const safeTo = safePosition(to);
    const fallbackCaret = safeFrom + text.length;
    view.dispatch({
      changes: { from: safeFrom, to: safeTo, insert: text },
      selection: {
        anchor: selectionFrom ?? fallbackCaret,
        head: selectionTo ?? selectionFrom ?? fallbackCaret,
      },
      scrollIntoView: true,
    });
    view.focus();
  }

  function applyEdit(result: EditResult) {
    replaceRange(result.rangeStart, result.rangeEnd, result.text, result.selectionStart, result.selectionEnd);
  }

  function replaceAll(value: string, addToHistory = true) {
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: value.length },
      annotations: addToHistory ? undefined : Transaction.addToHistory.of(false),
    });
  }

  function focus(options?: FocusOptions) {
    if (!view) return;
    if (options?.preventScroll) {
      view.contentDOM.focus({ preventScroll: true });
      return;
    }
    view.focus();
    view?.dom.scrollIntoView({ block: 'nearest' });
  }

  function scrollToPosition(position: number, selectionEnd = position, behavior: ScrollBehavior = 'smooth') {
    if (!view) return;
    const from = safePosition(position);
    const to = safePosition(selectionEnd);
    view.dispatch({ selection: { anchor: from, head: to } });
    view.focus();
    const lineTop = view.lineBlockAt(from).top;
    view.scrollDOM.scrollTo({ top: Math.max(0, lineTop - 12), behavior });
  }

  function createExternalSearchQuery(request: MarkdownSearchRequest) {
    return new SearchQuery({
      search: request.query,
      replace: request.replacement,
      caseSensitive: request.matchCase,
      wholeWord: request.wholeWord,
    });
  }

  function configureExternalSearch(request: MarkdownSearchRequest) {
    if (!view) return null;
    const query = createExternalSearchQuery(request);
    view.dispatch({ effects: setSearchQuery.of(query) });
    return query;
  }

  function countExternalSearchMatches(query: SearchQuery | null) {
    if (!view || !query?.valid || !query.search) return 0;
    const cursor = query.getCursor(view.state);
    let count = 0;
    while (!cursor.next().done) count += 1;
    return count;
  }

  function runExternalSearch(request: MarkdownSearchRequest, direction: 'next' | 'previous' = 'next') {
    const query = configureExternalSearch(request);
    const count = countExternalSearchMatches(query);
    if (!view || count <= 0) return count;
    if (direction === 'previous') findPrevious(view);
    else findNext(view);
    return count;
  }

  function clearExternalSearch() {
    if (!view) return;
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: '', replace: '', caseSensitive: false, wholeWord: false })),
    });
  }

  function replaceExternalSearchMatch(request: MarkdownSearchRequest) {
    const query = configureExternalSearch(request);
    if (!view || !query?.valid || !query.search) return 0;
    replaceNextSearchMatch(view);
    return countExternalSearchMatches(createExternalSearchQuery(request));
  }

  function replaceAllExternalSearchMatches(request: MarkdownSearchRequest) {
    const query = configureExternalSearch(request);
    if (!view || !query?.valid || !query.search) return 0;
    replaceAllSearchMatches(view);
    return 0;
  }

  watch(
    () => props.modelValue,
    (value) => {
      if (!view || value === view.state.doc.toString()) return;
      replaceAll(value || '', false);
    },
  );

  watch(
    () => props.readonly,
    (readonly) => {
      view?.dispatch({
        effects: editableCompartment.reconfigure([
          EditorState.readOnly.of(readonly),
          EditorView.editable.of(!readonly),
        ]),
      });
    },
  );

  watch(
    () => props.locale,
    (locale) => {
      if (!view) return;
      view.dispatch({ effects: phrasesCompartment.reconfigure(EditorState.phrases.of(searchPhrases(locale))) });
    },
  );

  watch(
    () => props.mobile,
    (mobile) => {
      view?.dispatch({ effects: wrappingCompartment.reconfigure(mobile ? EditorView.lineWrapping : []) });
    },
  );

  onMounted(() => nextTick(createEditor));

  onBeforeUnmount(() => {
    if (scrollbarIdleTimer) window.clearTimeout(scrollbarIdleTimer);
    view?.scrollDOM.removeEventListener('scroll', handleScroll);
    view?.destroy();
    view = null;
  });

  defineExpose<MarkdownCodeMirrorExpose>({
    getValue: () => view?.state.doc.toString() || '',
    getSelection: () => {
      const selection = view?.state.selection.main;
      return { from: selection?.from || 0, to: selection?.to || 0 };
    },
    focus,
    setSelection,
    applyEdit,
    replaceRange,
    replaceAll,
    undo: () => Boolean(view && undo(view)),
    redo: () => Boolean(view && redo(view)),
    canUndo: () => Boolean(view && undoDepth(view.state) > 0),
    canRedo: () => Boolean(view && redoDepth(view.state) > 0),
    getSelectedText: () => {
      const selection = view?.state.selection.main;
      return selection ? view?.state.sliceDoc(selection.from, selection.to) || '' : '';
    },
    runSearch: runExternalSearch,
    clearSearch: clearExternalSearch,
    replaceSearchMatch: replaceExternalSearchMatch,
    replaceAllSearchMatches: replaceAllExternalSearchMatches,
    coordsAtPos: (position: number) => {
      if (!view) return null;
      const coords = view.coordsAtPos(safePosition(position));
      return coords
        ? new DOMRect(
            coords.left,
            coords.top,
            Math.max(0, coords.right - coords.left),
            Math.max(0, coords.bottom - coords.top),
          )
        : null;
    },
    getScrollElement: () => view?.scrollDOM || null,
    scrollToPosition,
  });
</script>

<style scoped lang="less">
  .markdown-codemirror {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /*
   * 组件根节点在 Editor 中同时作为 flex 容器使用；CodeMirror 自己的根节点
   * 默认按正文的最大行宽计算尺寸，会表现成「输入底色随最长一行变宽」。
   * 让编辑面明确填满宿主，模板编辑和普通笔记编辑即可共用同一尺寸语义。
   */
  .markdown-codemirror :deep(.cm-editor) {
    width: 100%;
    min-width: 0;
    flex: 1 1 auto;
  }

  /* CodeMirror 的 drawSelection 使用独立图层而不是浏览器原生 ::selection。
     用完整层级选择器覆盖默认主题，保证鼠标拖选、双击和三击都显示同一底色。 */
  .markdown-codemirror :deep(.cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground) {
    background-color: rgba(97, 92, 237, 0.36) !important;
  }

  .markdown-codemirror.is-mobile :deep(.cm-content) {
    padding: 16px 14px max(140px, 32vh, calc(32px + env(safe-area-inset-bottom)));
    font-size: 15px;
    line-height: 1.7;
    -webkit-user-select: text;
    user-select: text;
  }

  .markdown-codemirror.is-mobile :deep(.cm-scroller) {
    -webkit-touch-callout: default;
    touch-action: pan-x pan-y;
  }
</style>
