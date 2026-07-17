import { describe, expect, it } from 'vitest';
import { parseDocumentBuffer, validateDocumentDescriptor } from './parser.js';

describe('AI 文档解析器', () => {
  it('解析 Markdown 时保留章节定位并切成可检索片段', async () => {
    const content = '# 项目说明\n\n轻笺用于管理书签和笔记。\n\n## 安全\n\n文件内容不能作为系统指令执行。';
    const result = await parseDocumentBuffer(Buffer.from(content), {
      fileName: 'README.md',
      fileType: 'text/markdown',
      fileSize: Buffer.byteLength(content),
    });

    expect(result.extractedChars).toBeGreaterThan(20);
    expect(result.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locatorType: 'section', locatorValue: '项目说明' }),
        expect.objectContaining({ locatorType: 'section', locatorValue: '安全' }),
      ]),
    );
  });

  it('解析 CSV 时返回行号定位', async () => {
    const content = 'name,status\n轻笺,active\n文档助手,planned';
    const result = await parseDocumentBuffer(Buffer.from(content), {
      fileName: 'features.csv',
      fileType: 'text/csv',
      fileSize: Buffer.byteLength(content),
    });

    expect(result.chunks[0]).toEqual(expect.objectContaining({ locatorType: 'row', locatorValue: '第 2 行' }));
    expect(result.chunks[0].content).toContain('name | status');
  });

  it('拒绝伪装成支持格式的未知扩展名和超大文件', () => {
    expect(() => validateDocumentDescriptor({ fileName: 'payload.exe', fileType: 'text/plain', fileSize: 10 })).toThrow(
      /UNSUPPORTED_FILE_TYPE/,
    );
    expect(() =>
      validateDocumentDescriptor({ fileName: 'large.txt', fileType: 'text/plain', fileSize: 21 * 1024 * 1024 }),
    ).toThrow(/FILE_TOO_LARGE/);
  });

  it('拒绝包含大量空字节的伪文本', async () => {
    const buffer = Buffer.alloc(128, 0);
    await expect(
      parseDocumentBuffer(buffer, { fileName: 'fake.txt', fileType: 'text/plain', fileSize: buffer.length }),
    ).rejects.toThrow(/FILE_CONTENT_INVALID/);
  });

  it('图片型 PDF 没有文字层时自动使用本地 OCR 并保留页码', async () => {
    const buffer = Buffer.from('%PDF-image-only');
    const result = await parseDocumentBuffer(
      buffer,
      { fileName: 'scan.pdf', fileType: 'application/pdf', fileSize: buffer.length },
      {
        pdfParser: async () => ({ numpages: 1, text: '' }),
        ocrProvider: {
          recognizePdf: async () => [{ pageNumber: 1, content: 'OCR 识别出的页面文字' }],
        },
      },
    );

    expect(result.text).toBe('OCR 识别出的页面文字');
    expect(result.chunks[0]).toEqual(expect.objectContaining({ locatorType: 'page', locatorValue: '第 1 页' }));
  });

  it('常见图片格式进入 OCR 流程', async () => {
    const buffer = Buffer.from('image-bytes');
    const result = await parseDocumentBuffer(
      buffer,
      { fileName: 'notice.png', fileType: 'image/png', fileSize: buffer.length },
      {
        ocrProvider: {
          recognizeImage: async () => ({ content: '图片中的中英文 Text 123' }),
        },
      },
    );

    expect(result.text).toContain('Text 123');
    expect(result.chunks[0]).toEqual(expect.objectContaining({ locatorType: 'page', locatorValue: '图片' }));
  });
});
