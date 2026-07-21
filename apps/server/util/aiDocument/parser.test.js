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
    expect(result.coverage).toEqual(
      expect.objectContaining({
        metadataAvailable: true,
        complete: true,
        truncated: false,
        coverageRatio: 1,
      }),
    );
    expect(result.coverage.total.chars).toBe(result.coverage.processed.chars);
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

  it('超过字符上限时显式记录未处理字符范围，而不是静默截断', async () => {
    const content = `前部结论\n\n${'后续内容'.repeat(80_000)}`;
    const buffer = Buffer.from(content);
    const result = await parseDocumentBuffer(buffer, {
      fileName: 'long.txt',
      fileType: 'text/plain',
      fileSize: buffer.length,
    });

    expect(result.coverage.truncated).toBe(true);
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.coverageRatio).toBeLessThan(1);
    expect(result.coverage.total.chars).toBeGreaterThan(result.coverage.processed.chars);
    expect(result.coverage.failedRanges).toEqual(
      expect.arrayContaining([expect.objectContaining({ unit: 'characters', code: 'CHAR_LIMIT' })]),
    );
  });

  it('超过分块上限时保存总分块数、处理分块数和失败范围', async () => {
    const rows = ['name,status', ...Array.from({ length: 260 }, (_, index) => `项目${index + 1},active`)];
    const content = rows.join('\n');
    const buffer = Buffer.from(content);
    const result = await parseDocumentBuffer(buffer, {
      fileName: 'many-rows.csv',
      fileType: 'text/csv',
      fileSize: buffer.length,
    });

    expect(result.chunks).toHaveLength(220);
    expect(result.coverage.total.chunks).toBe(260);
    expect(result.coverage.processed.chunks).toBe(220);
    expect(result.coverage.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CHUNK_LIMIT' })]));
  });

  it('OCR 部分页无文字时按页记录失败范围和覆盖比例', async () => {
    const buffer = Buffer.from('%PDF-image-only');
    const result = await parseDocumentBuffer(
      buffer,
      { fileName: 'partial.pdf', fileType: 'application/pdf', fileSize: buffer.length },
      {
        pdfParser: async () => ({ numpages: 3, text: '' }),
        ocrProvider: {
          recognizePdf: async () => [
            { pageNumber: 1, content: '第一页' },
            { pageNumber: 3, content: '第三页' },
          ],
        },
      },
    );

    expect(result.coverage.total.pages).toBe(3);
    expect(result.coverage.processed.pages).toBe(2);
    expect(result.coverage.coverageRatio).toBeCloseTo(2 / 3, 3);
    expect(result.coverage.failedRanges).toContainEqual(
      expect.objectContaining({ unit: 'pages', start: 2, end: 2, code: 'OCR_PAGE_NO_TEXT' }),
    );
  });

  it('解析失败和空文档错误也携带可序列化覆盖元数据', async () => {
    const invalidPdf = Buffer.from('%PDF-broken');
    let parseFailure;
    try {
      await parseDocumentBuffer(
        invalidPdf,
        { fileName: 'broken.pdf', fileType: 'application/pdf', fileSize: invalidPdf.length },
        { pdfParser: async () => Promise.reject(new Error('parser crashed')) },
      );
    } catch (error) {
      parseFailure = error;
    }
    expect(parseFailure?.coverage).toEqual(
      expect.objectContaining({ metadataAvailable: true, complete: false, truncated: false, coverageRatio: 0 }),
    );
    expect(() => JSON.stringify(parseFailure.coverage)).not.toThrow();

    let emptyFailure;
    try {
      await parseDocumentBuffer(Buffer.alloc(0), {
        fileName: 'empty.txt',
        fileType: 'text/plain',
        fileSize: 0,
      });
    } catch (error) {
      emptyFailure = error;
    }
    expect(emptyFailure?.coverage.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EMPTY_DOCUMENT' })]),
    );
  });
});
