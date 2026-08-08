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
const androidWebViewStylesSource = readFileSync(
  resolve(process.cwd(), 'src/assets/css/android-webview-compat.less'),
  'utf8',
);
const aiReplySource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/AiReply.vue'), 'utf8');
const noteDetailSource = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteDetail.vue'), 'utf8');
const templateContentEditorSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/template/NoteTemplateContentEditor.vue'),
  'utf8',
);
const templateEditSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/template/NoteTemplateEdit.vue'),
  'utf8',
);
const templatePreviewSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/template/NoteTemplatePreview.vue'),
  'utf8',
);
const templateListSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/template/NoteTemplateList.vue'),
  'utf8',
);

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

  it('Android App 富文本与 Markdown 普通正文使用常规字重，真实加粗语义仍显示粗体', () => {
    expect(androidWebViewStylesSource).toMatch(
      /html\.light-note-android-webview\s*\{[\s\S]*?font-family:\s*system-ui,[\s\S]*?font-weight:\s*400;[\s\S]*?font-synthesis:\s*style;[\s\S]*?--ln-android-font-weight-regular:\s*400;[\s\S]*?--ln-android-font-weight-medium:\s*500;[\s\S]*?--ln-android-font-weight-bold:\s*700;[\s\S]*?body,[\s\S]*?button,[\s\S]*?textarea\s*\{[\s\S]*?font-family:\s*inherit;/u,
    );
    expect(androidWebViewStylesSource).toMatch(
      /\.note-editor-body,\s*\n\s*\.mce-content-body\s*\{[\s\S]*?font-weight:\s*400\s*!important;/u,
    );
    expect(androidWebViewStylesSource).toMatch(
      /\.markdown-codemirror \.cm-content,[\s\S]*?\.markdown-codemirror \.cm-line,[\s\S]*?\.md-preview\s*\{[\s\S]*?font-weight:\s*400\s*!important;/u,
    );
    expect(androidWebViewStylesSource).toMatch(
      /\.note-editor-body strong,[\s\S]*?\.mce-content-body b,[\s\S]*?\.md-preview strong,[\s\S]*?\.md-preview b\s*\{[\s\S]*?font-weight:\s*700\s*!important;/u,
    );
    expect(codeMirrorSource).toMatch(/tag:\s*tags\.strong,[\s\S]*?fontWeight:\s*'700'/u);
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

  it('Markdown 编辑面始终填满可用宽度，不随最长正文行收缩或增长', () => {
    expect(codeMirrorSource).toMatch(
      /\.markdown-codemirror\s+:deep\(\.cm-editor\)\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?flex:\s*1 1 auto;/u,
    );
  });

  it('模板 Markdown 默认使用完整编辑宽度，同时保留分栏与预览切换', () => {
    expect(editorSource).toContain("isMobile.value || props.context === 'template' ? 'edit' : 'split'");
    expect(editorSource).toContain("{ key: 'split', label: t('note.mdEditPreview')");
    expect(editorSource).toContain("{ key: 'preview', label: t('note.mdPreview')");
  });

  it('模板正文工作区只让共享编辑器内部滚动，不再用固定高度撑开外层页面', () => {
    expect(templateEditSource).not.toContain("t('note.templateManager.editorTitle')");
    expect(templateEditSource).not.toContain('note-template-edit__content-label');
    expect(templateContentEditorSource).not.toContain('height: clamp(');
    expect(templateContentEditorSource).not.toContain('min-height: 560px');
    expect(templateContentEditorSource).toMatch(
      /\.note-template-content-editor\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?height:\s*auto;[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow:\s*hidden;/u,
    );
    expect(templateContentEditorSource).toContain(':deep(#editor-container.note-editor)');
    expect(templateContentEditorSource).toMatch(/:deep\(#editor-container\.note-editor\)\s*\{[\s\S]*?height:\s*100%;/u);
  });

  it('模板编辑页固定外层工作区与底栏，同时保留移动端悬浮操作所需安全留白', () => {
    expect(templateEditSource).not.toContain('v-auto-scrollbar class="note-template-edit__scroll"');
    expect(templateEditSource).toMatch(
      /\.note-template-edit__workspace\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow:\s*hidden;/u,
    );
    expect(templateEditSource).toMatch(
      /\.note-template-edit__content\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow:\s*hidden;/u,
    );
    expect(templateEditSource).toMatch(
      /\.note-template-edit__actions\s*\{[\s\S]*?height:\s*50px;[\s\S]*?box-sizing:\s*border-box;[\s\S]*?flex:\s*0 0 50px;/u,
    );
    expect(templateEditSource).toContain('padding: 6px 0 calc(80px + env(safe-area-inset-bottom))');
  });

  it('模板编辑页只在移动端压缩元信息区域，并保留描述字段的完整行宽', () => {
    const mobileStyles = sourceBetween(templateEditSource, '@media (max-width: 767px)', '</style>');
    expect(mobileStyles).toContain('padding: 6px 0 calc(80px + env(safe-area-inset-bottom))');
    expect(mobileStyles).toContain('grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr)');
    expect(mobileStyles).toMatch(
      /\.note-template-edit__input\s+:deep\(\.b-input\)\s*\{[\s\S]*?height:\s*30px\s*!important;/u,
    );
    expect(mobileStyles).toMatch(/\.note-template-edit__description\s*\{[\s\S]*?grid-column:\s*1 \/ -1;/u);
  });

  it('模板预览将标题、描述和三项元信息合并为紧凑摘要头', () => {
    const header = sourceBetween(templatePreviewSource, '<header class="note-template-preview__header">', '</header>');
    expect(header).toContain('note-template-preview__meta');
    expect(header).toContain("t('note.templateManager.defaultTitle')");
    expect(header).toContain("t('note.templateManager.revision')");
    expect(header).toContain("t('note.templateManager.updatedAt')");
    expect(templatePreviewSource.match(/class="note-template-preview__meta"/gu)).toHaveLength(1);
  });

  it('模板编辑在宽屏把三个字段压成一排，并把格式状态收进标题区', () => {
    expect(templateEditSource.match(/height="34px"/gu)).toHaveLength(3);
    expect(templateEditSource).toContain(
      'grid-template-columns: minmax(150px, 0.8fr) minmax(220px, 1.1fr) minmax(220px, 1.3fr)',
    );
    const heading = sourceBetween(templateEditSource, '<div class="note-template-edit__heading-row">', '</div>');
    expect(heading).toContain('<BChip');
    expect(heading).toContain("t('note.templateManager.formatLocked')");
  });

  it('模板搜索框具有独立表面、实色边框和明确聚焦态', () => {
    expect(templateListSource).toMatch(
      /\.note-template-list__tools :deep\(\.b-input\)\s*\{[\s\S]*?border:\s*1px solid var\(--surface-border-color\)\s*!important;[\s\S]*?background:\s*var\(--card-background\)\s*!important;/u,
    );
    expect(templateListSource).toMatch(
      /\.note-template-list__tools :deep\(\.b-input:focus-visible\)\s*\{[\s\S]*?border-color:\s*var\(--resource-note-color\)\s*!important;[\s\S]*?outline:\s*2px solid var\(--resource-note-color\);/u,
    );
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
