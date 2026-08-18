import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const editorSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/Editor.vue'), 'utf8');

function sourceBetween(startText: string, endText: string) {
  const start = editorSource.indexOf(startText);
  const end = editorSource.indexOf(endText, start + startText.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return editorSource.slice(start, end);
}

describe('笔记编辑器多图选择', () => {
  it('Markdown 与富文本普通图片入口开启多选，图文组合仍保持单选', () => {
    const markdownUpload = sourceBetween('ref="markdownImageInputRef"', '@change="onMarkdownImagePicked"');
    const markdownMediaUpload = sourceBetween(
      'ref="markdownMediaTextImageInputRef"',
      '@change="onMarkdownMediaTextImagePicked"',
    );
    const richUpload = sourceBetween('ref="richImageInputRef"', '@change="onRichImagePicked"');
    const richMediaUpload = sourceBetween('ref="richMediaTextImageInputRef"', '@change="onRichMediaTextImagePicked"');

    expect(markdownUpload).toMatch(/\bmultiple\b/u);
    expect(markdownUpload).not.toContain(':multiple="false"');
    expect(richUpload).toMatch(/\bmultiple\b/u);
    expect(richUpload).not.toContain(':multiple="false"');
    expect(markdownMediaUpload).toContain(':multiple="false"');
    expect(richMediaUpload).toContain(':multiple="false"');
  });

  it('两种普通图片批次都限并发并按整个文件数组处理', () => {
    const markdownHandler = sourceBetween(
      'async function onMarkdownImagePicked',
      'async function onMarkdownMediaTextImagePicked',
    );
    const richHandler = sourceBetween(
      'async function onRichImagePicked',
      'function handleRichMediaTextToolbarOpenChange',
    );

    for (const handler of [markdownHandler, richHandler]) {
      expect(handler).toContain('runOrderedBatch(');
      expect(handler).toContain('NOTE_IMAGE_UPLOAD_CONCURRENCY');
      expect(handler).not.toContain('files[0]');
      expect(handler).toContain('prepareNoteImageUploadNoteId()');
    }
    expect(editorSource).toContain("if (key === 'insertImage') return openRichImageInsert()");
    expect(editorSource).not.toContain("if (key === 'insertImage') return editor.execCommand('mceImage')");
  });
});
