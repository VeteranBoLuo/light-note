import { describe, expect, it, vi } from 'vitest';
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

  it('统一识图来源与降级原因进入 coverage 元数据，供缓存和界面解释', async () => {
    const buffer = Buffer.from('image-bytes');
    const result = await parseDocumentBuffer(
      buffer,
      { fileName: 'notice.jpg', fileType: 'image/jpeg', fileSize: buffer.length },
      {
        imageProvider: {
          recognizeImage: async () => ({
            content: 'DeepSeek 识别出的正文',
            metadata: {
              engine: 'deepseek_vision',
              model: 'vision-test',
              policyVersion: 2,
              quality: { status: 'accepted' },
            },
          }),
        },
      },
    );

    expect(result.coverage.recognition).toMatchObject({
      engine: 'deepseek_vision',
      model: 'vision-test',
      policyVersion: 2,
    });
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

it('混合 PDF 按页补 OCR，保留文字页并准确跳过确认空白页', async () => {
  const recognizePdf = vi.fn(async (_buffer, { pageNumbers }) => pageNumbers.map((pageNumber) => ({ pageNumber, content: `第${pageNumber}页门窗设计` })));
  const buffer = Buffer.from('%PDF-mixed');
  const result = await parseDocumentBuffer(buffer, { fileName: '窗户图纸.pdf', fileType: 'application/pdf', fileSize: buffer.length }, {
    pdfParser: async (_buffer, { pagerender }) => {
      for (let i = 0; i < 4; i++) await pagerender({ pageIndex: i, getTextContent: async () => ({ items: i === 0 ? [{ str: '门窗图纸确认单' }] : [] }), getOperatorList: async () => ({ fnArray: i === 2 ? [] : [1] }) });
      return { numpages: 4, text: '门窗图纸确认单' };
    }, ocrProvider: { recognizePdf },
  });
  expect(recognizePdf.mock.calls[0][1].pageNumbers).toEqual([2, 4]);
  expect(result.chunks.map((c) => c.locatorValue)).toEqual(['第 1 页', '第 2 页', '第 4 页']);
  expect(result.coverage).toMatchObject({ complete: true, processed: { pages: 4 }, pdf: { blankPages: [3], missingPages: [] } });
});
it('部分页面 OCR 失败仍保留可靠文字，记录需要视觉补读的页码', async () => {
  const buffer = Buffer.from('%PDF-mixed');
  const result = await parseDocumentBuffer(buffer, { fileName: 'scan.pdf', fileType: 'application/pdf', fileSize: buffer.length }, {
    pdfParser: async (_buffer, { pagerender }) => {
      for (let i = 0; i < 2; i++) await pagerender({ pageIndex: i, getTextContent: async () => ({ items: i === 0 ? [{ str: '可靠文字' }] : [] }) });
      return { numpages: 2 };
    }, ocrProvider: { recognizePdf: async () => { throw Object.assign(new Error('missing OCR'), { code: 'OCR_ENGINE_UNAVAILABLE' }); } },
  });
  expect(result.text).toBe('可靠文字');
  expect(result.coverage).toMatchObject({ complete: false, pdf: { missingPages: [2], ocrErrorCode: 'OCR_ENGINE_UNAVAILABLE' } });
});
it('纯文字 PDF 不额外调用 OCR', async () => {
  const recognizePdf = vi.fn();
  const buffer = Buffer.from('%PDF-text');
  await parseDocumentBuffer(buffer, { fileName: 'text.pdf', fileType: 'application/pdf', fileSize: buffer.length }, {
    pdfParser: async (_buffer, { pagerender }) => { await pagerender({ pageIndex: 0, getTextContent: async () => ({ items: [{ str: '文本内容' }] }) }); return { numpages: 1 }; },
    ocrProvider: { recognizePdf },
  });
  expect(recognizePdf).not.toHaveBeenCalled();
});

it('加密 PDF 返回加密原因，不冒充空文件', async () => {
  await expect(parseDocumentBuffer(Buffer.from('%PDF-encrypted'), { fileName: '资料.pdf', fileType: 'application/pdf', fileSize: 14 }, { pdfParser: async () => { throw Object.assign(new Error('password'), { name: 'PasswordException' }); } })).rejects.toMatchObject({ code: 'PDF_ENCRYPTED' });
});
it('无可靠文字的非空 PDF 保留待视觉补读页码', async () => {
  await expect(parseDocumentBuffer(Buffer.from('%PDF-scan'), { fileName: '图纸.pdf', fileType: 'application/pdf', fileSize: 9 }, { pdfParser: async (_buffer, opts) => { await opts.pagerender({ pageIndex: 0, getTextContent: async () => ({ items: [] }), getOperatorList: async () => ({ fnArray: [85] }) }); return { numpages: 1 }; }, ocrProvider: { recognizePdf: async () => [] } })).rejects.toMatchObject({ code: 'PDF_NO_RELIABLE_TEXT', coverage: { pdf: { missingPages: [1], blankPages: [] } } });
});
