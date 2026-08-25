import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import icon from '@/config/icon';
import { getNoteTreePageColor, getNoteTreePageIcon, isMarkdownNoteTreePage } from '@/utils/noteTreePresentation';

const editorSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/Editor.vue'), 'utf8');
const warmupPreviewSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/NoteEditorWarmupPreview.vue'),
  'utf8',
);
const delayedWarmupSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/useDelayedEditorWarmup.ts'),
  'utf8',
);
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
const mobileRenderingStylesSource = readFileSync(
  resolve(process.cwd(), 'src/assets/css/mobile-rendering-baseline.less'),
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
  it('富文本初始化不会回写规范化内容，正文预览与编辑器只做轻量交接', () => {
    const updateHandler = sourceBetween(editorSource, 'function handleRichContentUpdate', 'const forceReinit');
    expect(editorSource).toContain(':model-value="content"');
    expect(editorSource).toContain('@update:model-value="handleRichContentUpdate"');
    expect(editorSource).not.toContain('v-model="content"');
    expect(updateHandler).toContain('if (!richEditorRuntimeReady.value) return');
    expect(noteDetailSource).not.toContain('<Transition name="note-content-switch"');
  });

  it('编辑器快路径使用骨架，只有运行时超过 300ms 才挂载静态正文', () => {
    expect(editorSource).toContain("editorWarmupPhase === 'skeleton'");
    expect(editorSource).toContain("editorWarmupPhase === 'preview'");
    expect(editorSource).toContain('NoteDetailLoadingState');
    expect(delayedWarmupSource).toContain('NOTE_EDITOR_WARMUP_DELAY_MS = 300');
    expect(delayedWarmupSource).toContain("phase.value = 'hidden'");
    expect(delayedWarmupSource).toContain("phase.value = 'preview'");
  });

  it('移动端富文本预览与真实编辑器共享完整正文排版和资源装饰', () => {
    expect(editorSource).toContain("'is-mobile': isMobile");
    expect(editorSource).toContain('--note-editor-content-padding-top: 16px');
    expect(editorSource).toContain('--note-editor-content-line-height: 1.65');
    expect(editorSource).toContain('class="note-editor-body note-editor-rich-content"');
    expect(editorSource).toContain('.note-editor-rich-content {');
    expect(editorSource).toContain('.note-todo-checkbox {');
    expect(editorSource).toContain('a.ln-resource-link {');
    expect(warmupPreviewSource).toContain('note-editor-warmup__content note-editor-rich-content');
    expect(warmupPreviewSource).toContain('presentResourceReferenceChips');
    expect(warmupPreviewSource).toContain('normalizeRichMediaTextHtml');
    expect(warmupPreviewSource).toContain('padding: 14px 16px clamp(160px, 35vh, 360px)');
  });

  it('外置工具栏不再检查不存在的 TinyMCE 内置工具栏并循环重建编辑器', () => {
    const guard = sourceBetween(editorSource, 'const ensureToolbarRendered', 'const currentLang');
    expect(guard).not.toMatch(/querySelector\([^)]*tox-toolbar/u);
    expect(guard).not.toContain('editorKey.value += 1');
    expect(guard).not.toContain('editorReady.value = false');
  });

  it('CodeMirror 只保留真实文字选区，不用整行底色表达编辑焦点', () => {
    expect(codeMirrorSource).toContain('.cm-selectionLayer .cm-selectionBackground');
    expect(codeMirrorSource).toMatch(/background-color:\s*rgba\(97, 92, 237, 0\.36\)\s*!important/u);
    expect(codeMirrorSource).not.toContain('highlightActiveLine()');
    expect(codeMirrorSource).not.toContain("'.cm-activeLine'");
  });

  it('渐变文字使用透明文字填充时仍显式保留可见插入光标', () => {
    const gradientStyle = sourceBetween(commonStylesSource, '.ln-text-gradient {', '@supports');
    expect(gradientStyle).toContain('caret-color: var(--text-color, #161824)');
  });

  it('工具栏启用态与禁用态具有不同的文字、边框和透明度', () => {
    expect(toolbarSource).toMatch(/editor-toolbar-v2__button\)[\s\S]*color:\s*var\(--text-color\)/u);
    expect(toolbarSource).toMatch(/editor-toolbar-v2__button\.disabled\)[\s\S]*opacity:\s*0\.4/u);
  });

  it('移动浏览器与 Android App 共用常规正文和真实加粗语义', () => {
    expect(mobileRenderingStylesSource).toMatch(
      /html\.light-note-mobile-rendering\s*\{[\s\S]*?font-family:\s*var\(--app-font-family\);[\s\S]*?font-weight:\s*400;[\s\S]*?font-synthesis:\s*none;[\s\S]*?--ln-android-font-weight-regular:\s*400;[\s\S]*?--ln-android-font-weight-medium:\s*400;[\s\S]*?--ln-android-font-weight-bold:\s*700;[\s\S]*?body,[\s\S]*?button,[\s\S]*?textarea\s*\{[\s\S]*?font-family:\s*inherit;/u,
    );
    expect(mobileRenderingStylesSource).toMatch(
      /\.person-menu-item-title,[\s\S]*?\.phone-menu-item-title,[\s\S]*?\.mobile-todo-sort \.select-trigger,[\s\S]*?\.mobile-todo-sort \.select-text,[\s\S]*?\.user-icon-text,[\s\S]*?\.user-icon-text \*,[\s\S]*?\.admin-container\s*\{[\s\S]*?font-weight:\s*400\s*!important;/u,
    );
    expect(mobileRenderingStylesSource).toMatch(
      /\.note-editor-body,\s*\n\s*\.mce-content-body\s*\{[\s\S]*?font-weight:\s*400\s*!important;/u,
    );
    expect(mobileRenderingStylesSource).toMatch(
      /\.markdown-codemirror \.cm-content,[\s\S]*?\.markdown-codemirror \.cm-line,[\s\S]*?\.md-preview\s*\{[\s\S]*?font-weight:\s*400\s*!important;/u,
    );
    expect(mobileRenderingStylesSource).toMatch(
      /\.note-editor-body strong,[\s\S]*?\.mce-content-body b,[\s\S]*?\.md-preview strong,[\s\S]*?\.md-preview b\s*\{[\s\S]*?font-weight:\s*700\s*!important;/u,
    );
    expect(codeMirrorSource).toMatch(/tag:\s*tags\.strong,[\s\S]*?fontWeight:\s*'700'/u);
  });

  it('共享移动基线保留待办筛选间距与优先级语义底色', () => {
    expect(mobileRenderingStylesSource).toMatch(
      /\.inbox-toolbar--todo-primary\s*\{[\s\S]*?background:\s*transparent\s*!important;/u,
    );
    expect(mobileRenderingStylesSource).toMatch(
      /\.todo-item__actions--mobile \.todo-mobile-action--priority::before\s*\{[\s\S]*?border-color:\s*var\(--chip-todo-border\)\s*!important;[\s\S]*?background:\s*var\(--chip-todo-bg\)\s*!important;/u,
    );
  });

  it('目录树 HTML、Markdown 与手绘都使用可直接识别格式的独立图标', () => {
    expect(getNoteTreePageIcon('markdown')).not.toBe(getNoteTreePageIcon('html'));
    expect(getNoteTreePageIcon('drawing')).not.toBe(getNoteTreePageIcon('html'));
    expect(getNoteTreePageIcon('drawing')).not.toBe(getNoteTreePageIcon('markdown'));
    expect(getNoteTreePageIcon('html')).toBe(icon.resource.noteHtml);
    expect(getNoteTreePageIcon('markdown')).toBe(icon.resource.noteMarkdown);
    expect(getNoteTreePageIcon('drawing')).toBe(icon.resource.noteDrawing);
    expect(isMarkdownNoteTreePage('markdown')).toBe(true);
    expect(isMarkdownNoteTreePage('html')).toBe(false);
    expect(getNoteTreePageIcon('html')).toContain('<rect');
    expect(getNoteTreePageIcon('markdown')).toContain('<rect');
    expect(getNoteTreePageIcon('drawing')).toContain('<path');
    expect(getNoteTreePageIcon('drawing')).toContain('<circle');
    expect(getNoteTreePageColor('html')).toContain('--note-format-html-color');
    expect(getNoteTreePageColor('markdown')).toContain('--note-format-markdown-color');
    expect(getNoteTreePageColor('drawing')).toContain('--note-format-drawing-color');
  });

  it('Markdown 不挂载行号和折叠 gutter，正文保持纯写作边界', () => {
    expect(codeMirrorSource).not.toContain('lineNumbers()');
    expect(codeMirrorSource).not.toContain('highlightActiveLineGutter()');
    expect(codeMirrorSource).not.toContain('foldGutter(');
    expect(codeMirrorSource).not.toContain('foldKeymap');
    expect(codeMirrorSource).not.toContain('.cm-foldGutter');
    expect(codeMirrorSource).not.toContain('.cm-gutters');
    expect(codeMirrorSource).not.toContain('ln-cm-fold-marker');
    expect(codeMirrorSource).toContain('EditorView.lineWrapping');
    expect(codeMirrorSource).not.toContain('props.mobile ? EditorView.lineWrapping : []');
  });

  it('Markdown 编辑面始终填满可用宽度，不随最长正文行收缩或增长', () => {
    expect(codeMirrorSource).toMatch(
      /\.markdown-codemirror\s+:deep\(\.cm-editor\)\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?flex:\s*1 1 auto;/u,
    );
  });

  it('Markdown 编辑与预览共用字体、行高和正文起点，首个预览块不额外下沉', () => {
    expect(codeMirrorSource).toContain("fontSize: 'var(--note-markdown-font-size, 13px)'");
    expect(codeMirrorSource).toContain("lineHeight: 'var(--note-markdown-line-height, 22px)'");
    expect(codeMirrorSource).toContain('var(--note-markdown-padding-top, 14px)');
    expect(editorSource).toContain('font-size: var(--note-markdown-font-size, 13px);');
    expect(editorSource).toContain('line-height: var(--note-markdown-line-height, 22px);');
    expect(editorSource).toContain('padding: var(--note-markdown-padding-top, 14px)');
    expect(editorSource).toContain('--note-markdown-line-height: 25.5px;');
    expect(editorSource).toMatch(/\.md-preview\s*\{[\s\S]*?> :first-child\s*\{[\s\S]*?margin-top:\s*0;/u);
  });

  it('Markdown 预览中的普通正文和代码块都按栏宽软换行', () => {
    const previewStyles = sourceBetween(editorSource, '.md-preview {', '@media (max-width: 420px)');
    expect(previewStyles).toContain('overflow-wrap: anywhere;');
    expect(previewStyles).toContain('word-break: break-word;');
    expect(previewStyles).toMatch(
      /pre\s*\{[\s\S]*?overflow:\s*visible;[\s\S]*?white-space:\s*pre-wrap;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*break-word;/u,
    );
    expect(previewStyles).toMatch(/pre[\s\S]*?code\s*\{[\s\S]*?white-space:\s*inherit;/u);
    expect(previewStyles).toMatch(
      /th,[\s\S]*?td\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*break-word;/u,
    );
  });

  it('模板 Markdown 默认使用完整编辑宽度，同时保留分栏与预览切换', () => {
    expect(editorSource).toContain("isMobile.value || props.context === 'template' ? 'edit' : 'split'");
    expect(editorSource).toContain("{ key: 'split', label: t('note.mdEditPreview')");
    expect(editorSource).toContain("{ key: 'preview', label: t('note.mdPreview')");
  });

  it('快捷键帮助、重做与重复上一步是三个独立入口，两种编辑模式都支持重复格式功能', () => {
    const mobilePrimaryActions = sourceBetween(toolbarSource, 'const mobilePrimaryActions', 'function emitAction');
    expect(toolbarSource).toContain('<ToolbarButton :action="shortcutsAction" @run="emitAction" />');
    expect(toolbarSource).toContain('<ToolbarButton :action="repeatAction" @run="emitAction" />');
    expect(toolbarSource).toContain('shortcutsAction: EditorToolbarAction');
    expect(toolbarSource).toContain('repeatAction: EditorToolbarAction');
    expect(mobilePrimaryActions).not.toContain('props.shortcutsAction');
    expect(mobilePrimaryActions).not.toContain('props.repeatAction');
    expect(editorSource).toContain('v-model:visible="shortcutHelpVisible"');
    expect(editorSource).toContain(
      "toolbarAction('shortcuts', t('noteDetail.editor.shortcuts'), icon.settings.shortcuts",
    );
    expect(editorSource).toContain("if (action.key === 'shortcuts')");
    expect(editorSource).toContain('shortcutHelpVisible.value = true');
    expect(editorSource).not.toContain('markdownShortcutsVisible');
    expect(editorSource).not.toContain("action('markdownShortcuts'");
    expect(editorSource).toContain("editor.shortcuts.add('Meta+Y', '', () => editor.execCommand('Redo'))");
    expect(editorSource).toContain("editor.shortcuts.add('Meta+Shift+Z', '', () => editor.execCommand('Redo'))");
    expect(editorSource).toContain('if (handleRepeatLastEditorActionShortcut(event)) return');
    expect(editorSource).toContain('matchesRepeatLastActionShortcut(event)');
    expect(editorSource).toContain('getRepeatLastActionShortcutLabels()');
    expect(editorSource).not.toContain("editor.shortcuts.add('F4', '', repeatLastEditorAction)");
    expect(editorSource).not.toContain("editor.shortcuts.add('Meta+Alt+R', '', repeatLastEditorAction)");
    expect(editorSource).toContain("if (action.key === 'repeatLastAction')");
    expect(editorSource).toContain("rememberRepeatableAction('markdown', { key })");
    expect(editorSource).toContain("rememberRepeatableAction('html', {");
    expect(editorSource).toContain("key: 'textGradient'");
    expect(editorSource).toContain('applyRichTextGradientToCurrentSelection(action.gradient)');
    expect(editorSource).not.toContain("t('noteDetail.editor.redoRepeat')");
    expect(editorSource).toContain("event.key.toLowerCase() === 'y'");
    expect(editorSource).toContain("event.shiftKey && event.key.toLowerCase() === 'z'");
    expect(codeMirrorSource).toContain("['F4', 'repeatLastAction']");
    expect(codeMirrorSource).toContain("['Mod-Alt-r', 'repeatLastAction']");
    expect(codeMirrorSource).toContain('`Mod-${index + 1}`');
    expect(editorSource).toContain('const level = matchHeadingShortcut(event)');
    expect(editorSource).toContain('runRichToolbarAction(`heading${level}`)');
    expect(editorSource).toContain('const action = matchEditorInlineFormatShortcut(event)');
    expect(editorSource).toContain('runRichToolbarAction(action)');
    expect(editorSource).toContain("if (key === 'italic') return editor.execCommand('Italic')");
  });

  it('Markdown 与富文本共用图文组合入口，Markdown 上传后写入可预览的 HTML 块', () => {
    expect(editorSource).toContain("action('insertMediaText', t('noteDetail.editor.mediaText')");
    expect(editorSource).toContain("if (key === 'insertMediaText') return openMarkdownMediaTextInsert()");
    expect(editorSource).toContain('createMarkdownRichMediaTextBlockHtml(');
    expect(editorSource).toContain("operation: '在 Markdown 中插入图文组合'");
  });

  it('图文组合只有点击图片才打开设置，移动端使用两行紧凑操作条', () => {
    expect(editorSource).toContain("target.closest<HTMLImageElement>('.ln-media-text__media img')");
    expect(editorSource).not.toContain("target.closest('.ln-media-text__media')");
    expect(editorSource).toMatch(
      /if \(mediaTextImage && mediaTextItem && mediaTextBlock && !props\.readonly\)[\s\S]*?openRichMediaTextToolbar/u,
    );
    expect(editorSource).toContain('if (richMediaTextToolbarVisible.value) closeRichMediaTextToolbar()');
    expect(editorSource).toContain('quickbars_image_toolbar: false');
    expect(editorSource).toContain("editor.ui.registry.addContextToolbar('imageselection'");
    expect(editorSource).toContain("if (event.toolbarKey !== 'table') return");
    expect(editorSource).toContain("button.setAttribute('title', label)");
    expect(editorSource).toContain("!image.closest('.mermaid-figure--companion, .ln-media-text')");
    expect(editorSource).toContain('--ln-media-max-width:280px');
    expect(editorSource).toContain('--ln-media-max-height:220px');
    expect(editorSource).toContain('--ln-media-max-width:340px');
    expect(editorSource).toContain('--ln-media-max-height:260px');
    expect(editorSource).toContain('--ln-media-max-width: 400px');
    expect(editorSource).toContain('--ln-media-max-height: 300px');
    expect(editorSource).toContain('max-height:var(--ln-media-max-height)!important');
    expect(editorSource).toContain('justify-content: center');
    expect(editorSource).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.rich-media-text-popover\s*\{[\s\S]*?width:\s*min\(360px,[\s\S]*?padding:\s*6px/u,
    );
    expect(editorSource).toMatch(
      /\.rich-media-text-toolbar[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u,
    );
    expect(editorSource).toContain('@click="previewSelectedRichMediaTextImage"');
  });

  it('划词菜单避开顶部工具栏，AI 选段操作在文字尾部挂载临时等待标记', () => {
    expect(editorSource).toContain('adjustContextToolbarAwayFromMainToolbar');
    expect(editorSource).toContain("editor.on('contexttoolbar-show', handleContextToolbarShow)");
    expect(editorSource).toContain('editorViewportTop + selectionRect.bottom');
    expect(editorSource).toContain("addEventListener('scroll', scheduleContextToolbarAdjustment");
    expect(editorSource).toContain("'data-mce-bogus': 'all'");
    expect(editorSource).toContain('ln-ai-selection-pending__spinner');
    expect(editorSource).toContain('removeSelectionAiPendingMarker(pendingMarker)');
  });

  it('富文本表格上下文工具栏为所有图标补充本地化悬停提示', () => {
    expect(editorSource).toContain('decorateTableContextToolbar');
    expect(editorSource).toContain("if (event.toolbarKey !== 'table') return");
    expect(editorSource).toContain("button.setAttribute('aria-label', label)");
    expect(editorSource).toContain("button.setAttribute('title', label)");
    expect(editorSource).toContain("t('noteDetail.editor.tableProperties')");
    expect(editorSource).toContain("t('noteDetail.editor.deleteColumn')");
  });

  it('渐变弹框有可视预设色板，宽屏桌面工具栏直接展示常用格式', () => {
    expect(editorSource).toContain('v-for="preset in richTextGradientPresets"');
    expect(editorSource).toContain('applyRichTextGradientPreset(preset)');
    expect(editorSource).toContain('<template v-if="bookmark.isDesktop">');
    expect(editorSource).toContain('id="note-rich-gradient-from-picker"');
    expect(editorSource).toContain('id="note-rich-gradient-to-picker"');
    expect(editorSource).toContain('type="color"');
    expect(toolbarSource).toContain('desktopFormatActions');
    expect(toolbarSource).toContain('editor-toolbar-v2__desktop-formats');
    expect(editorSource).toContain("action('textGradient', t('noteDetail.editor.gradientText')");
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

  it('笔记只在云端保存返回 revision 冲突时打开版本对比', () => {
    const saveConflict = sourceBetween(
      noteDetailSource,
      "apiBasePost('/api/note/updateNote'",
      'ok = res.status === 200',
    );
    expect(saveConflict).toContain("res.status === 409 && res.data?.code === 'NOTE_VERSION_CONFLICT'");
    expect(saveConflict).toContain('openVersionConflict(cloud, currentNoteVersion())');
    expect(noteDetailSource).not.toContain('readNoteDraftFromDb');
    expect(noteDetailSource).not.toContain('recoverLocalDraft');
    expect(noteDetailSource).not.toContain('persistLocalDraftNow');
    expect(noteDetailSource).not.toContain("addEventListener('pagehide'");
  });

  it('HTML 切到 Markdown 时先释放富文本状态，并由 TinyMCE 包装组件单独销毁实例', () => {
    const modeSwitch = sourceBetween(editorSource, 'async function doSwitch', 'function undoSwitch');
    expect(modeSwitch).toMatch(/prepareRichEditorForUnmount\(\);[\s\S]*currentType\.value = targetType/u);
    const removeHandler = sourceBetween(editorSource, "editor.on('remove'", 'const refreshResourceReferences');
    expect(removeHandler).not.toContain('clearRichFindMatches()');
    expect(removeHandler).toContain('resetRichFindState()');
    expect(editorSource).not.toContain('editorRef.value.remove();');
  });

  it('富文本划词 AI 只提交选段协议，并在原选区未变化时安全写回', () => {
    const selectionAi = sourceBetween(
      editorSource,
      '// 划词 AI 是一条独立的「选段改写」链路',
      'const syncCheckboxAttribute',
    );
    expect(selectionAi).toContain("skillId: 'note.transform_text'");
    expect(selectionAi).toContain('input: { text, operation, targetLanguage }');
    expect(selectionAi).toContain("surface: 'note.editor.selection'");
    expect(selectionAi).not.toContain('selectionAction: action');
    expect(selectionAi).not.toContain('selectionText: text');
    expect(selectionAi).toContain('getBookmark?.(2, true)');
    expect(selectionAi).toContain('moveToBookmark?.(bookmark)');
    expect(selectionAi).toContain('currentSelection !== text');
    expect(selectionAi).toContain('editor.undoManager.transact');
    expect(selectionAi).toContain('editor.dom.encode(out)');
  });

  it('续写仍是右侧全文动作，读取完整笔记并要求保留原文后追加', () => {
    const continuation = sourceBetween(aiReplySource, 'const ACTION_INSTRUCTION', 'const runAction');
    expect(continuation).toContain('continueWrite');
    expect(continuation).toContain('完整保留原文');
    expect(continuation).toContain('原文 + 续写');
    expect(aiReplySource).toContain("const sourceText = mode === 'followup' ? baseContent || '' : String(note?.content || '')");
    expect(aiReplySource).toContain("skillId: 'note.transform_text'");
    expect(aiReplySource).toContain('text: sourceText');
  });

  it('AI 放大预览在生成中原位提供停止按钮，结束后恢复追问', () => {
    const followup = sourceBetween(
      aiReplySource,
      '<div class="ai-preview-followup">',
      '<div class="ai-preview-actions">',
    );
    expect(followup).toContain('v-if="isLoading"');
    expect(followup).toContain('@click="stopGenerating"');
    expect(followup).toContain("{{ t('ai.reply.stop') }}");
    expect(followup).toContain('v-else');
    expect(followup).toContain('@click="runFollowup"');
    expect(followup).not.toContain(':loading="isLoading"');
  });

  it('富文本 Mermaid 仅隐藏相邻源码视图，并保留按钮/双击编辑入口', () => {
    expect(commonStylesSource).toMatch(
      /\.note-editor:not\(\.is-readonly\) pre\.mermaid-source--has-companion,[\s\S]*display:\s*none/u,
    );
    expect(editorSource).toContain('stripTransientMermaidMarkers');
    expect(editorSource).toContain("editor.on('GetContent'");
    expect(editorSource).toContain("editor.on('BeforeSetContent'");
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
    expect(codeMirrorSource).toContain('clamp(160px, 35vh, 360px)');
    expect(codeMirrorSource).toContain('max(140px, 32vh, calc(32px + env(safe-area-inset-bottom)))');
    expect(editorSource).toContain(
      'padding: var(--note-editor-content-padding-top, 12px) 20px clamp(180px, 35vh, 380px)',
    );
    expect(editorSource).toContain('clamp(160px, 35vh, 360px);');
  });

  it('笔记内部滚动容器使用滚动时显隐的统一滚动条行为', () => {
    expect(editorSource).toContain('v-auto-scrollbar class="note-editor-scroll"');
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
    expect(editorSource).toContain(
      'top: var(--note-editor-content-padding-top, 12px); left: 20px; color: var(--desc-color); opacity: 0.88',
    );
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
