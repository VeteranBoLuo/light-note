import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const editorSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/Editor.vue'), 'utf8');

function functionSource(name: string, nextName: string) {
  const start = editorSource.indexOf(`function ${name}`);
  const end = editorSource.indexOf(`function ${nextName}`, start + 1);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return editorSource.slice(start, end);
}

describe('Editor 文件引用预览入口', () => {
  it('文件引用同时提供本页预览和云空间查看，并复用 FilePreview', () => {
    expect(editorSource).toContain("mobileResourcePreview.ref.type === 'file'");
    expect(editorSource).toContain("t('note.resourceMention.previewHere')");
    expect(editorSource).toContain("t('note.resourceMention.openInCloudSpace')");
    expect(editorSource).toMatch(/<FilePreview[\s\S]*?v-model:visible="inlineFilePreviewVisible"/);
  });

  it('本页预览只获取文件详情并打开预览层，不切换业务路由', () => {
    const source = functionSource('openReferencedFileInlinePreview', 'closeReferencedFileInlinePreview');
    expect(source).toContain("apiBasePost('/api/file/getFileInfo'");
    expect(source).toContain('inlineFilePreviewVisible.value = true');
    expect(source).not.toContain('router.push');
  });

  it('移动端 tap 资源胶囊先于 TinyMCE 选中不可编辑节点处理', () => {
    const initStart = editorSource.indexOf("editor.on('init', async () => {");
    expect(initStart).toBeGreaterThan(-1);
    const initSource = editorSource.slice(initStart, editorSource.indexOf('editor.mode', initStart));
    // 必须在 init 后以 prepend 注册，排到 TinyMCE SelectionOverrides 的 tap 处理之前。
    expect(initSource).toMatch(
      /editor\.on\(\s*'tap',[\s\S]*?handleTinyMceResourceReferenceActivation\(event\)[\s\S]*?stopImmediatePropagation[\s\S]*?true,\s*\)/,
    );
  });

  it('正文元素不绑定动态 class，避免覆盖 TinyMCE 的 mce-content-body', () => {
    const tinyMce = editorSource.match(/<TinyMceEditor[\s\S]*?\/>/)?.[0] || '';
    expect(tinyMce).toContain('class="note-editor-body note-editor-rich-content"');
    expect(tinyMce).not.toContain(':class=');
    expect(tinyMce).toContain(':data-preparing="!richEditorRuntimeReady || undefined"');
    expect(editorSource).toContain('&[data-preparing] {');
  });

  it('主动进入资源目标前先把引用定位写入原笔记历史项', () => {
    const source = functionSource('navigateResourceRef', 'showMobileResourcePreview');
    expect(source).toContain('buildNoteReturnFocusLocation');
    expect(source).toContain('router.replace');
    expect(source).toContain('router.push');
    expect(source.indexOf('router.replace')).toBeLessThan(source.indexOf('router.push'));
  });
});
