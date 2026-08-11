import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const editorSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/Editor.vue'), 'utf8');

function editorInitSource() {
  const start = editorSource.indexOf('const editorInit = computed');
  const end = editorSource.indexOf('watchEffect(', start + 1);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return editorSource.slice(start, end);
}

function applyMobileImageSizeSource() {
  const start = editorSource.indexOf('function applyMobileImageSize');
  const end = editorSource.indexOf('// Markdown 编辑器与预览的滚动同步', start + 1);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return editorSource.slice(start, end);
}

/**
 * 移动端富文本的文字长按/选择必须落到系统菜单（复制/粘贴/全选）。
 *
 * 曾经出的问题：移动端同时开着两层自定义菜单，把系统菜单顶掉了——
 *   1. quickbars 选区条只有 copy，没有 paste/全选；
 *   2. contextmenu 不显式设置时 TinyMCE 用默认值，未加载的付费插件被过滤后
 *      普通文字上只剩「链接」，而 longpress 也走 contextmenu 分支。
 * 实测（TinyMCE 8.6.0）：不设置 contextmenu 时事件被 preventDefault，原生菜单不出现；
 * 设为 false 后放行。所以文字划词条在移动端不能再打开，TinyMCE 默认上下文菜单则
 * 必须全端关闭；图片右键/长按统一交给项目自己的 imageselection 快捷条。
 */
describe('移动端富文本交给系统菜单', () => {
  it('移动端关闭 quickbars 选区条，桌面端保留自研快捷条', () => {
    const source = editorInitSource();
    expect(editorSource).toMatch(
      /usesNativeTextSelectionMenu\s*=\s*computed\(\(\)\s*=>\s*bookmark\.isMobile\s*\|\|\s*bookmark\.isTouchDevice\)/,
    );
    expect(source).toMatch(/quickbars_selection_toolbar:\s*usesNativeTextSelectionMenu\.value\s*\?\s*false/);
    // 桌面分支仍要有自研入口，别在修移动端时把桌面一起关掉
    expect(source).toMatch(/aiEdit \| myHeadingMenu/);
  });

  it('全端显式把 contextmenu 设为 false，不落回 TinyMCE 默认菜单', () => {
    const source = editorInitSource();
    expect(source).toMatch(/\n\s*contextmenu:\s*false,/);
    expect(source).not.toMatch(/usesNativeTextSelectionMenu\.value\s*\?\s*\{\s*contextmenu:/);
  });

  it('图片对象浮条提供稳定操作，文字菜单按桌面编辑与移动长按分流', () => {
    const source = editorInitSource();
    expect(source).toContain(
      "'lnImagePreview | lnImageCopy lnImageCut lnImagePaste lnImageDelete | alignleft aligncenter alignright | lnImageParagraphAfter'",
    );
    expect(source).toContain("editor.ui.registry.addButton('lnImagePreview'");
    expect(editorSource).toContain('icon.noteDetail.diagramTools.zoom');
    expect(editorSource).not.toContain('icon.noteDetail.toolbar.zoom');
    expect(source).toContain("editor.ui.registry.addButton('lnImageCopy'");
    expect(source).toContain("editor.ui.registry.addButton('lnImageCut'");
    expect(source).toContain("editor.ui.registry.addButton('lnImagePaste'");
    expect(source).toContain("editor.ui.registry.addButton('lnImageDelete'");
    expect(source).toContain("editor.ui.registry.addButton('lnImageParagraphAfter'");
    expect(source).toContain('richImageClipboardHtml = serializeRichImageForClipboard(image)');
    // 外部系统剪贴板只做能力探测和尽力复制，不能因为 WebView 拒绝权限而让内部复制失效。
    expect(source).toMatch(/queryCommandSupported\?\.\('copy'\)[\s\S]*doc\.execCommand\('copy'\)/);
    // 图片对象独立打开 imageselection；桌面编辑正文阻止系统菜单，移动端和只读正文继续放行。
    expect(source).toContain('const blockNativeRichImageContextMenu');
    expect(source).toMatch(
      /blockNativeRichImageContextMenu[\s\S]*if \(props\.readonly\) return;[\s\S]*resolveRichImageFromEvent\(event\)[\s\S]*event\.preventDefault\(\)/,
    );
    expect(source).toContain('event.stopImmediatePropagation()');
    expect(source).toContain(
      "editor.dispatch?.('contexttoolbar-show', { toolbarKey: 'imageselection', target: image })",
    );
    expect(source).toContain("image.closest('.mermaid-figure--companion, .ln-media-text')");
    expect(source).toContain("addEventListener('contextmenu', blockNativeRichImageContextMenu, true)");
    expect(source).toContain("removeEventListener('contextmenu', blockNativeRichImageContextMenu, true)");
    expect(source).toContain('const blockDesktopRichTextContextMenu');
    expect(source).toMatch(
      /blockDesktopRichTextContextMenu[\s\S]*props\.readonly\s*\|\|\s*usesNativeTextSelectionMenu\.value[\s\S]*event\.preventDefault\(\)/,
    );
    expect(source).toContain("addEventListener('contextmenu', blockDesktopRichTextContextMenu, true)");
    expect(source).toContain("removeEventListener('contextmenu', blockDesktopRichTextContextMenu, true)");
    expect(source).toContain("editor.on('longpress', blockNativeRichImageContextMenu, true)");
    expect(source).toContain("editor.off('longpress', blockNativeRichImageContextMenu)");
    expect(source).toContain('.note-editor-body[contenteditable="true"] img');
    expect(source).toContain('-webkit-touch-callout: none');
    expect(source).not.toMatch(/\.mce-content-body\s*\{[^}]*-webkit-user-select:\s*none/);
  });

  it('图片后换行创建真实空段落、恢复光标并进入同一个撤销事务', () => {
    const source = editorInitSource();
    expect(source).toContain('const insertParagraphAfterSelectedRichImage');
    expect(source).toContain("editor.dom.create('p', {})");
    expect(source).toMatch(
      /insertParagraphAfterSelectedRichImage[\s\S]*editor\.undoManager\.transact\(\(\)\s*=>\s*\{[\s\S]*parent\.insertBefore\(paragraph, anchor\.nextSibling\)/,
    );
    expect(source).toContain('focusRichImageCaret(paragraph, 0)');
  });

  it('移动端仍保留六项固定工具栏，格式化能力进入底部抽屉', () => {
    expect(editorSource).toContain('id="editor-toolbar"');
    expect(editorSource).toContain('<EditorToolbarV2');
    expect(editorInitSource()).toContain('toolbar: false');
    expect(editorSource).not.toContain('@touchend="handleRenderedResourceLinkClick"');
    expect(editorInitSource()).not.toContain("editor.on('touchend'");
    expect(editorSource).toMatch(
      /const moreActions = isMobile\.value[\s\S]*action\('redo'[\s\S]*action\('italic'[\s\S]*\.\.\.listActions[\s\S]*action\('link'/,
    );
  });

  it('移动端图片尺寸使用共用底部抽屉，并允许连续切换档位', () => {
    expect(editorSource).toContain('<BDrawer');
    expect(editorSource).toContain('@click="handleMarkdownPreviewClick"');
    expect(editorSource).toContain('@click="previewMobileImage"');
    expect(editorInitSource()).toMatch(
      /object_resizing:\s*usesNativeTextSelectionMenu\.value\s*\?\s*false\s*:\s*'img'/,
    );

    const source = applyMobileImageSizeSource();
    expect(source).toContain('mobileImageSettingsSize.value = normalizedSize');
    const successTail = source.slice(source.lastIndexOf('mobileImageSettingsSize.value = normalizedSize'));
    // 选中一个尺寸后面板要留在原处，方便用户连续试选；只在失败或主动关闭时退出。
    expect(successTail).not.toContain('closeMobileImageSettings()');
  });
});
