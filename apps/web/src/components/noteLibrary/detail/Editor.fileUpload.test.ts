import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const editorSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/Editor.vue'), 'utf8');
const modalSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/NoteFileUploadModal.vue'),
  'utf8',
);

describe('笔记文件上传资源引用', () => {
  it('富文本和 Markdown 共用同一个文件上传入口，并插入标准 file 资源引用', () => {
    expect(editorSource).toContain("action('insertFile'");
    expect(editorSource).toContain("if (key === 'insertFile') return openNoteFileUpload()");
    expect(editorSource.match(/if \(key === 'insertFile'\) return openNoteFileUpload\(\)/gu)).toHaveLength(2);
    expect(editorSource).toContain("{ type: 'file', id: file.fileId, title: file.filename }");
    expect(editorSource).toContain('buildResourceHref(item)');
    expect(editorSource).toContain('buildResourceAnchorAttrs(item)');
  });

  it('异步期间正文变化时不猜测旧位置，保留云文件并提供当前光标重试', () => {
    expect(editorSource).toContain('source !== intent.source');
    expect(editorSource).toContain('noteFileUploadSavedFile.value = file');
    expect(editorSource).toContain('@retry-insert="retryNoteFileInsert"');
    expect(modalSource).toContain("emit('retry-insert')");
    expect(modalSource).toContain("t('noteDetail.editor.fileUpload.insertAtCurrent')");
  });

  it('名称编辑只修改基础名，扩展名固定展示并使用 B 系列控件', () => {
    expect(modalSource).toContain('v-model:value="baseName"');
    expect(modalSource).toContain('{{ extension }}');
    expect(modalSource).toContain('const finalName = computed');
    expect(modalSource).toContain('<BInput');
    expect(modalSource).toContain('<BSelect');
    expect(modalSource).toContain('<BProgress');
    expect(modalSource).not.toMatch(/<input\b/iu);
    expect(modalSource).not.toMatch(/<select\b/iu);
  });
});
