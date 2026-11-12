import { describe, expect, it, vi } from 'vitest';
import { loadExplicitResourceEvidence, prepareExplicitResourceEvidence } from './resourceEvidence.js';

function databaseFor({ notes = [], bookmarks = [], files = [], todos = [], chunks = [] } = {}) {
  return {
    query: vi.fn(async (sql, params) => {
      const statement = String(sql);
      if (statement.includes('FROM note')) return [notes];
      if (statement.includes('FROM bookmark b')) return [bookmarks];
      if (statement.includes('FROM files f')) return [files];
      if (statement.includes('FROM todo_items')) return [todos];
      if (statement.includes('FROM ai_document_chunks')) return [chunks];
      throw new Error(`unexpected sql: ${statement}`);
    }),
  };
}

describe('loadExplicitResourceEvidence', () => {
  it('按显式引用顺序读取 owner 范围内资源，并统一清洗富文本', async () => {
    const database = databaseFor({
      notes: [{ id: 'n1', title: '笔记', type: 'html', content: '<p>正文 &amp; 内容</p>' }],
      bookmarks: [
        {
          id: 'b1',
          name: '站点',
          url: 'https://example.com',
          description: '说明',
          snapshot_content: '<article>网页正文</article>',
        },
      ],
    });
    const result = await loadExplicitResourceEvidence({
      userId: 'u1',
      resourceRefs: [
        { type: 'bookmark', id: 'b1', version: 'v2' },
        { type: 'note', id: 'n1', version: 'v1' },
      ],
      database,
    });

    expect(result.sources.map((source) => source.id)).toEqual(['bookmark:b1', 'note:n1']);
    expect(result.evidence).toContain('[1]');
    expect(result.evidence).toContain('网页正文');
    expect(result.evidence).toContain('[2]');
    expect(result.evidence).toContain('正文 & 内容');
    expect(result.evidence).not.toContain('<article>');
    expect(result.coverage.complete).toBe(true);
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('b.user_id = ?'), ['u1', 'b1']);
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('create_by = ?'), ['u1', 'n1']);
  });

  it('手绘笔记不把 scene JSON 当正文，并明确标记覆盖不足', async () => {
    const database = databaseFor({
      notes: [{ id: 'drawing', title: '草图', type: 'drawing', content: '{"elements":[{"text":"秘密"}]}' }],
    });
    const result = await loadExplicitResourceEvidence({
      userId: 'u1',
      resourceRefs: [{ type: 'note', id: 'drawing', version: 'v1' }],
      database,
    });

    expect(result.sources).toEqual([]);
    expect(result.coverage.resources[0].status).toBe('no_text');
    expect(result.evidence).not.toContain('秘密');
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.warnings).toContain('note_drawing_no_text:note:drawing');
  });

  it('按云文件 ID 解析对应 source 与 chunks，解析中状态不会冒充空正文', async () => {
    const database = databaseFor({
      files: [
        { id: 1, file_name: 'ready.pdf', source_id: 's1', source_status: 'ready', coverage_metadata: '{}' },
        { id: 2, file_name: 'pending.pdf', source_id: 's2', source_status: 'parsing' },
      ],
      chunks: [{ source_id: 's1', chunk_index: 0, content: '第一页正文', locator_value: '第 1 页' }],
    });
    const result = await loadExplicitResourceEvidence({
      userId: 'u1',
      resourceRefs: [
        { type: 'file', id: '1', version: 'v1' },
        { type: 'file', id: '2', version: 'v2' },
      ],
      database,
    });

    expect(result.evidence).toContain('第一页正文');
    expect(result.sources[0].target.sourceId).toBe('s1');
    expect(result.sources).toHaveLength(1);
    expect(result.coverage.resources[1].status).toBe('parsing');
    expect(result.coverage.warnings).toContain('file_parsing_in_progress:file:2');
    expect(result.coverage.readableResources).toBe(1);
    expect(result.coverage.complete).toBe(false);
  });

  it('本地 OCR 降级结果作为明确 coverage 警告，不冒充 DeepSeek 高精度识图', async () => {
    const database = databaseFor({
      files: [
        {
          id: 3,
          file_name: 'license.jpg',
          source_id: 's3',
          source_status: 'ready',
          coverage_metadata: JSON.stringify({
            recognition: {
              engine: 'local_ocr',
              fallbackReason: 'AI_NETWORK_ERROR',
              quality: { status: 'degraded' },
            },
          }),
        },
      ],
      chunks: [{ source_id: 's3', chunk_index: 0, content: '本地识别文字', locator_value: '图片' }],
    });
    const result = await loadExplicitResourceEvidence({
      userId: 'u1',
      resourceRefs: [{ type: 'file', id: '3', version: 'v3' }],
      database,
    });

    expect(result.coverage.warnings).toEqual(
      expect.arrayContaining(['image_recognition_fallback:file:3', 'image_recognition_uncertain:file:3']),
    );
    expect(result.coverage.complete).toBe(true);
    expect(result.coverage.quality).toBe('degraded');
    expect(result.sources[0].coverage.complete).toBe(true);
    expect(result.sources[0].coverage.qualityWarnings).toEqual(
      expect.arrayContaining(['image_recognition_fallback', 'image_recognition_uncertain']),
    );
  });

  it('Vision 识别不确定只降低证据质量，不误报结构覆盖缺失', async () => {
    const database = databaseFor({
      files: [
        {
          id: 4,
          file_name: 'screenshot.png',
          source_id: 's4',
          source_status: 'ready',
          coverage_metadata: JSON.stringify({
            recognition: {
              engine: 'deepseek_vision',
              quality: { status: 'uncertain' },
              uncertainSegments: ['右下角文字模糊'],
            },
          }),
        },
      ],
      chunks: [{ source_id: 's4', chunk_index: 0, content: '识别到的主要文字', locator_value: '图片' }],
    });
    const result = await loadExplicitResourceEvidence({
      userId: 'u1',
      resourceRefs: [{ type: 'file', id: '4', version: 'v4' }],
      database,
    });

    expect(result.coverage.complete).toBe(true);
    expect(result.coverage.qualityWarnings).toEqual(['image_recognition_uncertain:file:4']);
    expect(result.coverage.structuralWarnings).toEqual([]);
  });

  it('在统一字符预算内截断并把截断作为可见 coverage', async () => {
    const database = databaseFor({
      notes: [{ id: 'n1', title: '长笔记', type: 'markdown', content: '甲'.repeat(100) }],
    });
    const result = await loadExplicitResourceEvidence({
      userId: 'u1',
      resourceRefs: [{ type: 'note', id: 'n1', version: 'v1' }],
      database,
      maxCharsPerResource: 20,
      maxTotalChars: 20,
    });

    expect(result.sources[0].excerpt.length).toBe(20);
    expect(result.sources[0].excerpt.endsWith('…')).toBe(true);
    expect(result.coverage.warnings).toContain('resource_content_truncated:note:n1');
  });
});

describe('prepareExplicitResourceEvidence', () => {
  it('云文件复用解析服务并等待 ready，不调用模型', async () => {
    const attachSource = vi.fn().mockResolvedValue({ id: 'source-1', status: 'queued' });
    const getStatuses = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'source-1', status: 'parsing' }])
      .mockResolvedValueOnce([{ id: 'source-1', status: 'ready' }]);
    const result = await prepareExplicitResourceEvidence({
      userId: 'u1',
      resourceRefs: [{ type: 'file', id: 'f1' }],
      sessionId: 'request-1',
      attachSource,
      getStatuses,
      waitMs: 200,
      pollMs: 1,
    });
    expect(attachSource).toHaveBeenCalledWith({ userId: 'u1', fileId: 'f1', sessionId: 'request-1' });
    expect(result[0].status).toBe('ready');
  });

  it('不支持的文件类型返回可直接展示的稳定原因', async () => {
    await expect(
      prepareExplicitResourceEvidence({
        userId: 'u1',
        resourceRefs: [{ type: 'file', id: 'f1' }],
        attachSource: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error('internal'), { code: 'UNSUPPORTED_FILE_TYPE' })),
        getStatuses: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
      status: 400,
      message: expect.stringContaining('TXT'),
    });
  });

  it('图片文件在当前用户动作内先升级到统一 Vision 识别，再进入状态等待', async () => {
    const attachSource = vi.fn().mockResolvedValue({
      id: 'source-image',
      status: 'queued',
      fileName: 'license.jpg',
    });
    const recognizeImageSource = vi.fn().mockResolvedValue({
      id: 'source-image',
      status: 'ready',
      fileName: 'license.jpg',
    });
    const getStatuses = vi.fn();

    const result = await prepareExplicitResourceEvidence({
      userId: 'u1',
      resourceRefs: [{ type: 'file', id: 'f-image' }],
      sessionId: 'request-image',
      attachSource,
      recognizeImageSource,
      getStatuses,
    });

    expect(recognizeImageSource).toHaveBeenCalledWith({
      userId: 'u1',
      sourceId: 'source-image',
      signal: undefined,
    });
    expect(getStatuses).not.toHaveBeenCalled();
    expect(result[0].status).toBe('ready');
  });

  it('等待后台状态时立即响应用户取消，不继续轮询', async () => {
    const controller = new AbortController();
    const reason = Object.assign(new Error('cancelled'), { name: 'AbortError', code: 'AI_REQUEST_ABORTED' });
    const getStatuses = vi.fn();
    const pending = prepareExplicitResourceEvidence({
      userId: 'u1',
      resourceRefs: [{ type: 'file', id: 'f1' }],
      attachSource: vi.fn().mockResolvedValue({ id: 'source-1', status: 'queued', fileName: 'file.pdf' }),
      getStatuses,
      signal: controller.signal,
      waitMs: 1_000,
      pollMs: 500,
    });

    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(getStatuses).not.toHaveBeenCalled();
  });
});
