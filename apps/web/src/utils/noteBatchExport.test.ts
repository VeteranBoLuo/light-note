import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import {
  buildBatchNoteExportArchive,
  buildBatchNoteExportEntries,
  makeUniqueBatchExportFileName,
  resolveBatchNoteExportFormat,
} from './noteBatchExport';

const notes = [
  { id: 'html-1', title: '项目计划', type: 'html', content: '<p><strong>第一阶段</strong></p>' },
  { id: 'md-1', title: '更新日志', type: 'markdown', content: '# 更新日志\n\n- [x] 已完成' },
];

describe('noteBatchExport', () => {
  it('默认格式按每篇笔记自身类型决定', () => {
    expect(resolveBatchNoteExportFormat('html', 'original')).toBe('html');
    expect(resolveBatchNoteExportFormat('markdown', 'original')).toBe('md');
    expect(resolveBatchNoteExportFormat('md', 'original')).toBe('md');
    expect(resolveBatchNoteExportFormat('drawing', 'original')).toBe('json');
    expect(resolveBatchNoteExportFormat('markdown', 'pdf')).toBe('pdf');
  });

  it('手绘笔记原格式保留 scene JSON，文本转换模式明确跳过', async () => {
    const drawing = {
      id: 'drawing-1',
      title: '草图',
      type: 'drawing',
      content: '{"v":1,"page":{"width":1024,"height":1448},"elements":[]}',
    };
    const original = await buildBatchNoteExportEntries([drawing], 'original', { fallbackTitle: '未命名文档' });
    expect(original.failedNoteIds).toEqual([]);
    expect(original.entries[0]).toMatchObject({ fileName: '草图.json', format: 'json', content: drawing.content });

    const converted = await buildBatchNoteExportEntries([drawing], 'markdown', { fallbackTitle: '未命名文档' });
    expect(converted.entries).toEqual([]);
    expect(converted.failedNoteIds).toEqual(['drawing-1']);
  });

  it('同名文件自动追加序号，且按大小写规避 ZIP 内冲突', () => {
    const used = new Set<string>();
    expect(makeUniqueBatchExportFileName('周报', '未命名文档', 'html', used)).toBe('周报.html');
    expect(makeUniqueBatchExportFileName('周报', '未命名文档', 'html', used)).toBe('周报 (2).html');
    expect(makeUniqueBatchExportFileName('周报', '未命名文档', 'md', used)).toBe('周报.md');
  });

  it('按原格式分别生成离线 HTML 与原始 Markdown', async () => {
    const progress = vi.fn();
    const result = await buildBatchNoteExportEntries(notes, 'original', {
      fallbackTitle: '未命名文档',
      lang: 'zh-CN',
      onProgress: progress,
    });

    expect(result.failedNoteIds).toEqual([]);
    expect(result.entries.map((entry) => entry.fileName)).toEqual(['项目计划.html', '更新日志.md']);
    expect(String(result.entries[0].content)).toContain('<!DOCTYPE html>');
    expect(String(result.entries[0].content)).toContain('<strong>第一阶段</strong>');
    expect(result.entries[1].content).toBe('# 更新日志\n\n- [x] 已完成');
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it('统一 Markdown 模式会转换富文本，同时保持 Markdown 源文', async () => {
    const result = await buildBatchNoteExportEntries(
      [...notes, { id: 'md-alias', title: '旧 Markdown', type: 'md', content: '## 原文' }],
      'markdown',
      { fallbackTitle: '未命名文档' },
    );

    expect(result.entries.map((entry) => entry.format)).toEqual(['md', 'md', 'md']);
    expect(String(result.entries[0].content)).toContain('**第一阶段**');
    expect(result.entries[1].content).toBe('# 更新日志\n\n- [x] 已完成');
    expect(result.entries[2].content).toBe('# 旧 Markdown\n\n## 原文');
  });

  it('统一 PDF 模式逐篇把离线 HTML 交给 PDF 生成器', async () => {
    const pdfGenerator = vi.fn(async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    const result = await buildBatchNoteExportEntries(notes, 'pdf', {
      fallbackTitle: '未命名文档',
      pdfGenerator,
    });

    expect(result.entries.map((entry) => entry.fileName)).toEqual(['项目计划.pdf', '更新日志.pdf']);
    expect(pdfGenerator).toHaveBeenCalledTimes(2);
    expect(pdfGenerator.mock.calls[0][0]).toContain('<title>项目计划</title>');
    expect(pdfGenerator.mock.calls[1][0]).toContain('<h1>更新日志</h1>');
  });

  it('把生成结果打成一个不含 JSON 备份文件的 ZIP', async () => {
    const result = await buildBatchNoteExportArchive(notes, 'original', { fallbackTitle: '未命名文档' });
    expect(result.blob).toBeInstanceOf(Blob);

    const archive = await JSZip.loadAsync(await result.blob!.arrayBuffer());
    expect(Object.keys(archive.files).sort()).toEqual(['更新日志.md', '项目计划.html'].sort());
    expect(Object.keys(archive.files).some((name) => name.endsWith('.json'))).toBe(false);
  });
});
