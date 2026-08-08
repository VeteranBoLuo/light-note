import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import icon from '@/config/icon';
import { getNoteTreePageIcon, isMarkdownNoteTreePage } from '@/utils/noteTreePresentation';

const editorSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/Editor.vue'), 'utf8');
const codeMirrorSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/MarkdownCodeMirror.vue'),
  'utf8',
);
const toolbarSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/EditorToolbarV2.vue'),
  'utf8',
);
const findBarSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/EditorFindBar.vue'),
  'utf8',
);
const commonStylesSource = readFileSync(resolve(process.cwd(), 'src/assets/css/common.less'), 'utf8');
const themeStylesSource = readFileSync(resolve(process.cwd(), 'src/assets/css/theme.less'), 'utf8');
const aiReplySource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/AiReply.vue'), 'utf8');
const noteDetailSource = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteDetail.vue'), 'utf8');

function sourceBetween(source: string, startText: string, endText: string) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('编辑器 V2 交互回归', () => {
  it('外置工具栏不再检查不存在的 TinyMCE 内置工具栏并循环重建编辑器', () => {
    const guard = sourceBetween(editorSource, 'const ensureToolbarRendered', 'const currentLang');
    expect(guard).not.toMatch(/querySelector\([^)]*tox-toolbar/u);
    expect(guard).not.toContain('editorKey.value += 1');
    expect(guard).not.toContain('editorReady.value = false');
  });

  it('CodeMirror 拖选有独立高对比选区层，当前行底色不会遮住它', () => {
    expect(codeMirrorSource).toContain('.cm-selectionLayer .cm-selectionBackground');
    expect(codeMirrorSource).toMatch(/background-color:\s*rgba\(97, 92, 237, 0\.36\)\s*!important/u);
    expect(codeMirrorSource).toMatch(/'\.cm-activeLine':\s*\{[\s\S]*rgba\(97, 92, 237, 0\.045\)/u);
  });

  it('工具栏启用态与禁用态具有不同的文字、边框和透明度', () => {
    expect(toolbarSource).toMatch(/editor-toolbar-v2__button\)[\s\S]*color:\s*var\(--text-color\)/u);
    expect(toolbarSource).toMatch(/editor-toolbar-v2__button\.disabled\)[\s\S]*opacity:\s*0\.4/u);
  });

  it('目录树 Markdown 与 HTML 都使用可直接识别格式的独立图标', () => {
    expect(getNoteTreePageIcon('markdown')).not.toBe(getNoteTreePageIcon('html'));
    expect(getNoteTreePageIcon('html')).toBe(icon.resource.noteHtml);
    expect(getNoteTreePageIcon('markdown')).toBe(icon.resource.noteMarkdown);
    expect(isMarkdownNoteTreePage('markdown')).toBe(true);
    expect(isMarkdownNoteTreePage('html')).toBe(false);
    expect(getNoteTreePageIcon('html')).toContain('<rect');
    expect(getNoteTreePageIcon('markdown')).toContain('<rect');
  });

  it('Markdown 不挂载行号和折叠 gutter，正文保持纯写作边界', () => {
    expect(codeMirrorSource).not.toContain('lineNumbers()');
    expect(codeMirrorSource).not.toContain('highlightActiveLineGutter()');
    expect(codeMirrorSource).not.toContain('foldGutter(');
    expect(codeMirrorSource).not.toContain('foldKeymap');
    expect(codeMirrorSource).not.toContain('.cm-foldGutter');
    expect(codeMirrorSource).not.toContain('.cm-gutters');
    expect(codeMirrorSource).not.toContain('ln-cm-fold-marker');
    expect(codeMirrorSource).toContain('wrappingCompartment.of(props.mobile ? EditorView.lineWrapping : [])');
  });

  it('Markdown 链接在源码和预览中共用高对比主题色', () => {
    expect(codeMirrorSource).toContain('const markdownHighlightStyle = HighlightStyle.define');
    expect(codeMirrorSource).toContain('var(--note-editor-link-color');
    expect(editorSource).toContain('a:not(.ln-resource-link)');
    expect(themeStylesSource).toContain('--note-editor-link-color: #315bc7');
    expect(themeStylesSource).toContain('--note-editor-link-color: #8ab4ff');
  });

  it('格式转换由 revision 与预览指纹约束的父级持久化回调完成', () => {
    expect(editorSource).toContain('buildNoteFormatConversionAnalysisHash');
    expect(editorSource).toContain('props.persistModeConversion({');
    expect(editorSource).toContain('baseRevision: conversionBaseRevision.value');
    expect(editorSource).toContain("emits('mode-converted', persisted)");
    expect(noteDetailSource).toContain("apiBasePost('/api/note/convertMode'");
    expect(noteDetailSource).toContain(':persist-mode-conversion="persistEditorModeConversion"');
    expect(noteDetailSource).toContain('@mode-converted="onEditorModeConverted"');
  });

  it('笔记草稿由 IndexedDB 主存储，并防止异步恢复覆盖已经切换的笔记', () => {
    expect(noteDetailSource).toContain('readNoteDraftFromDb');
    expect(noteDetailSource).toContain('writeNoteDraftToDb');
    expect(noteDetailSource).toContain('promoteNoteDraftInDb');
    expect(noteDetailSource).toContain('activeDraftNoteId !== draftNoteId');
    expect(noteDetailSource).toContain('currentDraftIdentityKey() !== identityKey');
    expect(noteDetailSource).not.toContain('window.localStorage, currentDraftIdentityKey()');
  });

  it('富文本划词 AI 只提交选段协议，并在原选区未变化时安全写回', () => {
    const selectionAi = sourceBetween(
      editorSource,
      '// 划词 AI 是一条独立的「选段改写」链路',
      'const syncCheckboxAttribute',
    );
    expect(selectionAi).toContain('selectionAction: action');
    expect(selectionAi).toContain('selectionText: text');
    expect(selectionAi).toContain("responseFormat: 'plain'");
    expect(selectionAi).toContain('getBookmark?.(2, true)');
    expect(selectionAi).toContain('moveToBookmark?.(bookmark)');
    expect(selectionAi).toContain('currentSelection !== text');
    expect(selectionAi).toContain('editor.undoManager.transact');
    expect(selectionAi).toContain('editor.dom.encode(out)');
  });

  it('续写仍是右侧全文动作，读取完整笔记并要求保留原文后追加', () => {
    const continuation = sourceBetween(aiReplySource, 'const ACTION_INSTRUCTION', 'const buildFormatHint');
    expect(continuation).toContain('continueWrite');
    expect(continuation).toContain('完整保留原文');
    expect(continuation).toContain('原文 + 续写');
    expect(aiReplySource).toContain('内容：${note?.content}');
  });

  it('富文本 Mermaid 仅隐藏相邻源码视图，并保留按钮/双击编辑入口', () => {
    expect(commonStylesSource).toMatch(
      /pre\[class\*='language-mermaid'\]:has\(\+ \.mermaid-figure--companion\)[\s\S]*display:\s*none/u,
    );
    expect(editorSource).toContain('v-model:visible="richMermaidEditorVisible"');
    expect(editorSource).toContain('v-model:value="richMermaidSource"');
    expect(editorSource).toContain('addEventListener(MERMAID_EDIT_EVENT, openRichMermaidEditor)');
    expect(editorSource).toContain('editor.undoManager.transact');
    expect(editorSource).toContain('sourceElement.textContent = nextSource');
  });

  it('富文本图表作为一个原子内容块选择，Backspace/Delete 同步删除源码和渲染伴随块', () => {
    const deletion = sourceBetween(editorSource, 'const deleteSelectedMermaidFigure', "editor.on('remove'");
    expect(deletion).toContain("event.key !== 'Backspace' && event.key !== 'Delete'");
    expect(deletion).toContain('source?.matches(\'pre[class*="language-mermaid"]\')');
    expect(deletion).toContain('editor.undoManager.transact');
    expect(deletion).toContain('figure.remove()');
    expect(deletion).toContain('source.remove()');
    expect(commonStylesSource).toMatch(
      /\.mermaid-figure--companion[\s\S]*?&\.is-selected[\s\S]*?border-color:\s*var\(--primary-color/u,
    );
  });

  it('Markdown 与富文本都保留可滚过末行的底部写作空间', () => {
    expect(codeMirrorSource).toContain("padding: '14px 12px clamp(160px, 35vh, 360px)'");
    expect(codeMirrorSource).toContain('max(140px, 32vh, calc(32px + env(safe-area-inset-bottom)))');
    expect(editorSource).toContain('padding: 12px 20px clamp(180px, 35vh, 380px)');
    expect(editorSource).toContain('padding: 10px 10px clamp(160px, 35vh, 360px)');
  });

  it('笔记内部滚动容器使用滚动时显隐的统一滚动条行为', () => {
    expect(editorSource).toContain('<div v-auto-scrollbar class="note-editor-scroll">');
    expect(editorSource).toMatch(/ref="mdPreviewRef"\s+v-auto-scrollbar/u);
    expect(codeMirrorSource).toContain("view.scrollDOM.classList.add('auto-scrollbar')");
    expect(codeMirrorSource).toContain("scrollElement.classList.add('is-scrolling')");
  });

  it('富文本与 Markdown 共用顶部搜索栏，并显式兼容 Ctrl 与 Command', () => {
    const richSearch = sourceBetween(editorSource, 'type RichFindDirection', 'type MarkdownMentionRange');
    expect(findBarSource).toContain('(event.ctrlKey || event.metaKey)');
    expect(findBarSource).toContain("event.key.toLowerCase() === 'f'");
    expect(editorSource).toContain('openRichFind(editor)');
    expect(editorSource.match(/<EditorFindBar\s/gu)).toHaveLength(2);
    expect(findBarSource).toContain('class="editor-find-bar"');
    expect(editorSource).toContain('editor?.plugins?.searchreplace');
    expect(editorSource).toContain("editor.shortcuts.remove('Meta+F')");
    expect(editorSource).toContain("editor.shortcuts.add('Meta+F', '', () => openRichFind(editor))");
    expect(findBarSource).toContain('event.stopImmediatePropagation()');
    expect(editorSource).not.toContain("editor.execCommand('SearchReplace')");
    expect(editorSource).not.toContain("editor.on('OpenWindow'");
    expect(richSearch).toContain('editor.undoManager.transact');
    expect(richSearch).toContain('api.replace(richReplaceText.value, true, false)');
    expect(richSearch).toContain('api.runSearch(currentMarkdownSearchRequest(), direction)');
    expect(richSearch).toContain('api.replaceSearchMatch(currentMarkdownSearchRequest())');
    expect(richSearch).toContain("richFindSignature.value = ''");
    expect(findBarSource).toMatch(/\.editor-find-bar\s*\{[\s\S]*?flex:\s*0 0 auto/u);
    expect(codeMirrorSource).toContain("['Mod-f', 'findReplace']");
    expect(codeMirrorSource).toContain("['Mod-b', 'bold']");
    expect(codeMirrorSource).not.toContain('.cm-panel.cm-search');
    expect(codeMirrorSource).not.toContain('openSearchPanel');
  });

  it('富文本插入图表会在同一轮挂载 companion，占位期间不闪源码', () => {
    const insertion = sourceBetween(
      editorSource,
      'function insertHtmlDiagramTemplate',
      'function openRichMermaidEditor',
    );
    expect(insertion).toContain('renderMermaidBlocks(body, { companion: true })');
    expect(editorSource).toContain("editor.on('SetContent undo redo', renderCompanionsImmediately)");
    expect(editorSource).toContain("editor.on('input', scheduleCompanionRender)");
  });

  it('富文本空态 placeholder 与首个光标共用正文起点，深色主题沿用可读描述色', () => {
    expect(editorSource).toContain('.mce-content-body > :first-child { margin-top: 0; }');
    expect(editorSource).toContain('top: 12px; left: 20px; color: var(--desc-color); opacity: 0.88');
  });

  it('富文本空段落插入待办后把光标放到复选框后方', () => {
    const todo = sourceBetween(editorSource, 'const ensureTodoCheckbox', "editor.addCommand('ToggleNoteTodo'");
    expect(todo).toContain("createTextNode('\\u00a0')");
    expect(todo).toContain('shouldMoveCaretAfterCheckbox');
    expect(todo).toContain('editor.selection.setCursorLocation(caretSpacer, caretSpacer.length)');
  });

  it('富文本与 Markdown 桌面工具栏使用同一紧凑密度，Markdown 视图切换为 VS Code 式无框图标', () => {
    expect(editorSource.match(/<EditorToolbarV2/gu)).toHaveLength(2);
    expect(editorSource.match(/\n\s+compact\n/gu)).toHaveLength(2);
    expect(toolbarSource).toContain("'is-compact': compact && !mobile");
    expect(toolbarSource).toMatch(/\.editor-toolbar-v2\.is-compact\s*\{[\s\S]*?min-height:\s*36px/u);
    expect(editorSource).toContain('class="md-view-switch"');
    expect(editorSource).toContain('class="md-view-switch__button"');
    expect(editorSource).toContain(':aria-pressed="mdView === option.key"');
    expect(editorSource).toContain('<SvgIcon :src="option.icon"');
    expect(editorSource).toMatch(/\.md-view-switch__button\s*\{[\s\S]*?border:\s*0\s*!important/u);
    expect(editorSource).toMatch(
      /\.md-view-switch__button\.is-active\s*\{[\s\S]*?border-bottom-color:\s*var\(--primary-color\)/u,
    );
    expect(editorSource).not.toContain('variant="segment"');
    expect(icon.noteDetail.toolbar.viewEdit).toContain('<rect');
    expect(icon.noteDetail.toolbar.viewSplit).toContain('M12 4v16');
    expect(icon.noteDetail.toolbar.viewPreview).toContain('<circle');
    expect(editorSource).toContain('triggerless');
    expect(editorSource).not.toContain('md-hidden-file-input');
    expect(editorSource).not.toContain('class="md-editor-label"');
    expect(editorSource).not.toContain('.md-editor-label {');
  });

  it('代码块通过主题变量分别提供浅色卡片和深色沉浸表面', () => {
    expect(commonStylesSource).toContain('color: var(--pre-text-color) !important');
    expect(commonStylesSource).toContain('border: 1px solid var(--pre-border-color)');
    expect(themeStylesSource).toContain('--pre-bg-color: #f6f7fb');
    expect(themeStylesSource).toContain('--pre-text-color: #252a36');
    expect(themeStylesSource).toContain('--pre-bg-color: #151922');
    expect(themeStylesSource).toContain('--pre-text-color: #e8ebf2');
  });

  it('浅色 AI 助手用实色分区、描边和标题字重建立层次', () => {
    expect(aiReplySource).toContain('--ai-section-bg: #f8f9ff');
    expect(aiReplySource).toContain('--ai-section-border: #e1e5f0');
    expect(aiReplySource).toMatch(/\.ai-header[\s\S]*border-bottom:\s*1px solid var\(--ai-section-border\)/u);
    expect(aiReplySource).toMatch(/\.ai-title[\s\S]*font-weight:\s*700/u);
    expect(aiReplySource).toMatch(/\.action-btn[\s\S]*border:\s*1px solid var\(--ai-section-border\)/u);
    expect(aiReplySource).toMatch(/\.output-header[\s\S]*background:\s*var\(--ai-output-header-bg\)/u);
  });
});
