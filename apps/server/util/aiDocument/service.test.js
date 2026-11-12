import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = { query: vi.fn(), getConnection: vi.fn() };
const getObjectMetadataFromObs = vi.fn();
const getObjectBufferFromObs = vi.fn();
const deleteObjectFromObs = vi.fn();
const buildAiTemporaryObjectKey = vi.fn();
const createDownloadSignedUrl = vi.fn();
const createUploadSignedUrl = vi.fn();

function coverageMetadata({ chars = 100, pages = 1, chunks = 1, ratio = 1, truncated = false } = {}) {
  const processedChars = Math.round(chars * ratio);
  const processedPages = pages ? Math.round(pages * ratio) : 0;
  const processedChunks = chunks ? Math.round(chunks * ratio) : 0;
  return {
    version: 1,
    metadataAvailable: true,
    total: { chars, pages, chunks },
    parsed: { chars: processedChars, pages: processedPages, chunks: processedChunks },
    processed: { chars: processedChars, pages: processedPages, chunks: processedChunks },
    truncated,
    complete: !truncated && ratio === 1,
    coverageRatio: ratio,
    failedRanges: truncated
      ? [{ unit: 'characters', start: processedChars + 1, end: chars, code: 'CHAR_LIMIT', reason: '截断' }]
      : [],
    reasons: truncated ? [{ code: 'CHAR_LIMIT', message: '截断' }] : [],
  };
}

vi.mock('../../db/index.js', () => ({ default: pool }));
vi.mock('../obsClient.js', () => ({
  buildAiTemporaryObjectKey,
  createDownloadSignedUrl,
  createUploadSignedUrl,
  deleteObjectFromObs,
  getObjectBufferFromObs,
  getObjectMetadataFromObs,
}));

const {
  attachCloudDocumentSource,
  cleanupExpiredDocumentSources,
  confirmTemporaryDocumentSource,
  createTemporaryDocumentSource,
  getDocumentSourceStatuses,
  purgeDocumentSourcesForCloudFiles,
  recognizeCloudImageDocumentSource,
  runSingleDocumentJob,
} = await import('./service.js');

describe('AI 文档服务', () => {
  beforeEach(() => vi.clearAllMocks());

  it('显式图片动作使用独立 inline 租约持久化 Vision 结果', async () => {
    const source = {
      id: 'source-vision',
      user_id: 'user-1',
      source_type: 'cloud',
      file_id: 12,
      file_name: 'license.jpg',
      file_type: 'image/jpeg',
      file_size: 16,
      object_key: 'files/user-1/license.jpg',
      status: 'ready',
      coverage_metadata: null,
    };
    const claimConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('FROM ai_document_jobs')) {
          return [[{ id: 21, source_id: source.id, status: 'completed', attempts: 1 }]];
        }
        if (String(sql).includes('FROM ai_document_sources')) return [[source]];
        return [{ affectedRows: 1 }];
      }),
    };
    const persistConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT id FROM ai_document_jobs')) return [[{ id: 21 }]];
        if (String(sql).includes('SELECT id FROM ai_document_sources')) return [[{ id: source.id }]];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.getConnection.mockResolvedValueOnce(claimConnection).mockResolvedValueOnce(persistConnection);
    getObjectMetadataFromObs.mockResolvedValue({ contentLength: source.file_size });
    getObjectBufferFromObs.mockResolvedValue(Buffer.alloc(source.file_size, 1));
    const parsed = {
      extractedChars: 8,
      chunks: [
        {
          chunkIndex: 0,
          content: 'Vision 正文',
          locatorType: 'page',
          locatorValue: '图片',
          contentHash: 'a'.repeat(64),
        },
      ],
      coverage: coverageMetadata({ chars: 8 }),
    };
    const parseBuffer = vi.fn().mockResolvedValue(parsed);
    pool.query.mockResolvedValueOnce([[{ ...source, status: 'ready', extracted_chars: 8, chunk_count: 1 }]]);

    const result = await recognizeCloudImageDocumentSource({
      userId: 'user-1',
      sourceId: source.id,
      parseBuffer,
    });

    expect(parseBuffer).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ fileName: 'license.jpg' }), {
      signal: undefined,
    });
    expect(claimConnection.query).toHaveBeenCalledWith(expect.stringContaining('locked_by = ?'), [
      expect.stringMatching(/^inline-vision:/u),
      21,
    ]);
    expect(persistConnection.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO ai_document_chunks'), [
      source.id,
      0,
      'Vision 正文',
      'page',
      '图片',
      'a'.repeat(64),
    ]);
    expect(result).toMatchObject({ id: source.id, status: 'ready', extractedChars: 8 });
  });

  it('兼容上线前已按 EMPTY_DOCUMENT 标记失败的无文字图片', async () => {
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 'legacy-image',
          user_id: 'user-1',
          source_type: 'temporary',
          file_name: 'legacy.png',
          file_type: 'image/png',
          file_size: 64,
          status: 'failed',
          error_code: 'EMPTY_DOCUMENT',
          error_message: 'OCR 未能从图片中识别出文字',
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    ]);
    await expect(getDocumentSourceStatuses({ userId: 'user-1', sourceIds: ['legacy-image'] })).resolves.toEqual([
      expect.objectContaining({ id: 'legacy-image', status: 'no_text' }),
    ]);
  });

  it('挂载云文件前校验文件归属', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    await expect(attachCloudDocumentSource({ userId: 'user-2', fileId: '9' })).rejects.toThrow(/FILE_NOT_FOUND/);
    expect(pool.query.mock.calls[0][1]).toEqual(['9', 'user-2']);
  });

  it('同一云文件正在解析时直接复用，不清空分块或重置任务', async () => {
    const existing = {
      id: 'source-shared',
      user_id: 'visitor-shared',
      source_type: 'cloud',
      file_id: 9,
      file_name: 'guide.pdf',
      file_type: 'application/pdf',
      file_size: 128,
      object_key: 'files/visitor-shared/guide.pdf',
      status: 'parsing',
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT * FROM ai_document_sources')) return [[existing]];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 9,
          file_name: 'guide.pdf',
          file_type: 'application/pdf',
          file_size: 128,
          obs_key: 'files/visitor-shared/guide.pdf',
        },
      ],
    ]);
    pool.getConnection.mockResolvedValue(connection);

    await expect(
      attachCloudDocumentSource({ userId: 'visitor-shared', fileId: 9, sessionId: 'guest-session' }),
    ).resolves.toEqual(expect.objectContaining({ id: 'source-shared', sourceType: 'cloud', status: 'parsing' }));
    expect(connection.query).toHaveBeenCalledWith('UPDATE ai_document_sources SET session_id = ? WHERE id = ?', [
      'guest-session',
      'source-shared',
    ]);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM ai_document_chunks'))).toBe(
      false,
    );
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO ai_document_jobs'))).toBe(
      false,
    );
  });

  it('临时附件另存云空间后再次挂载时安全转为云来源，并清理临时对象', async () => {
    const existing = {
      id: 'source-1',
      user_id: 'user-1',
      source_type: 'temporary',
      file_id: 9,
      file_name: 'avatar.png',
      file_type: 'image/png',
      file_size: 128,
      object_key: 'ai-temp/user-1/source-1/avatar.png',
      status: 'ready',
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT * FROM ai_document_sources')) return [[existing]];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 9,
          file_name: 'avatar.png',
          file_type: 'image/png',
          file_size: 128,
          obs_key: 'files/user-1/avatar.png',
        },
      ],
    ]);
    pool.getConnection.mockResolvedValue(connection);
    deleteObjectFromObs.mockResolvedValue({});

    await expect(attachCloudDocumentSource({ userId: 'user-1', fileId: 9 })).resolves.toEqual(
      expect.objectContaining({ id: 'source-1', sourceType: 'cloud', fileId: '9', status: 'queued' }),
    );
    const sourceUpdate = connection.query.mock.calls.find(([sql]) => String(sql).includes("source_type = 'cloud'"));
    expect(sourceUpdate).toBeTruthy();
    expect(deleteObjectFromObs).toHaveBeenCalledWith(existing.object_key);
  });

  it('状态接口返回已持久化覆盖元数据，旧记录则明确标记覆盖未知', async () => {
    const coverage = coverageMetadata({ chars: 90, chunks: 2, ratio: 0.5, truncated: true });
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 'new-source',
          user_id: 'user-1',
          source_type: 'cloud',
          file_name: 'new.md',
          status: 'ready',
          extracted_chars: 45,
          chunk_count: 1,
          coverage_metadata: coverage,
        },
        {
          id: 'legacy-source',
          user_id: 'user-1',
          source_type: 'cloud',
          file_name: 'legacy.md',
          status: 'ready',
          extracted_chars: 80,
          chunk_count: 1,
        },
      ],
    ]);

    const statuses = await getDocumentSourceStatuses({
      userId: 'user-1',
      sourceIds: ['new-source', 'legacy-source'],
    });

    expect(statuses[0].coverage).toEqual(expect.objectContaining({ coverageRatio: 0.5, truncated: true }));
    expect(statuses[1].coverage).toEqual(
      expect.objectContaining({ metadataAvailable: false, coverageRatio: null, complete: false }),
    );
  });

  it('云文件变更只清理云来源缓存，不误删已另存副本的临时附件', async () => {
    const connection = { query: vi.fn().mockResolvedValueOnce([[]]) };
    await expect(purgeDocumentSourcesForCloudFiles(connection, 'user-1', ['8'])).resolves.toBe(0);
    expect(connection.query.mock.calls[0][0]).toContain("source_type = 'cloud'");
  });

  it('重复确认已入队的临时附件保持幂等，不重复创建任务', async () => {
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 'source-1',
          user_id: 'user-1',
          source_type: 'temporary',
          file_name: 'guide.md',
          file_type: 'text/markdown',
          file_size: 20,
          status: 'queued',
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    ]);

    await expect(confirmTemporaryDocumentSource({ userId: 'user-1', sourceId: 'source-1' })).resolves.toEqual(
      expect.objectContaining({ id: 'source-1', status: 'queued' }),
    );
    expect(getObjectMetadataFromObs).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('达到保留上限时自动回收最旧的已完成文件后继续上传', async () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      id: `source-${index + 1}`,
      status: 'ready',
      create_time: new Date(Date.now() - (8 - index) * 60_000),
    }));
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT * FROM ai_document_sources')) {
          return [[{ id: 'source-1', source_type: 'temporary', object_key: 'tmp/source-1' }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    pool.query
      .mockResolvedValueOnce([rows])
      .mockResolvedValueOnce([[{ id: 'source-1', source_type: 'temporary', object_key: 'tmp/source-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    pool.getConnection.mockResolvedValue(connection);
    deleteObjectFromObs.mockResolvedValue({});
    buildAiTemporaryObjectKey.mockReturnValue('tmp/new-source');
    createUploadSignedUrl.mockReturnValue({ url: 'https://upload.example', headers: {}, expiresIn: 900 });

    const result = await createTemporaryDocumentSource({
      userId: 'user-1',
      fileName: 'next.md',
      fileType: 'text/markdown',
      fileSize: 10,
    });

    expect(deleteObjectFromObs).toHaveBeenCalledWith('tmp/source-1');
    expect(result.uploadUrl).toBe('https://upload.example');
    expect(pool.query.mock.calls.at(-1)?.[0]).toContain('INSERT INTO ai_document_sources');
  });

  it('达到上限且全部仍在处理中时不自动删除', async () => {
    pool.query.mockResolvedValueOnce([
      Array.from({ length: 8 }, (_, index) => ({
        id: `source-${index + 1}`,
        status: index % 2 ? 'queued' : 'parsing',
        create_time: new Date(),
      })),
    ]);

    await expect(
      createTemporaryDocumentSource({
        userId: 'user-1',
        fileName: 'next.md',
        fileType: 'text/markdown',
        fileSize: 10,
      }),
    ).rejects.toThrow(/TOO_MANY_PROCESSING_ATTACHMENTS/);
    expect(deleteObjectFromObs).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('后台清理会选择已标记删除重试的来源', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await expect(cleanupExpiredDocumentSources()).resolves.toBe(0);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('error_code = ?'), ['DELETE_RETRY_PENDING']);
  });

  it('OCR 没有识别到文字时任务正常完成，而不是把附件标记为失败', async () => {
    const claimConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT * FROM ai_document_jobs')) {
          return [[{ id: 7, source_id: 'source-empty', attempts: 0 }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    const finishConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT id FROM ai_document_jobs')) return [[{ id: 7 }]];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.getConnection.mockResolvedValueOnce(claimConnection).mockResolvedValueOnce(finishConnection);
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 'source-empty',
          object_key: 'tmp/source-empty',
          file_name: 'empty.txt',
          file_type: 'text/plain',
          file_size: 1,
          status: 'parsing',
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    ]);
    getObjectMetadataFromObs.mockResolvedValue({ contentLength: 1 });
    getObjectBufferFromObs.mockResolvedValue(Buffer.from(' '));
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await expect(runSingleDocumentJob('worker-test')).resolves.toBe(true);
    const sourceUpdate = finishConnection.query.mock.calls.find(([sql]) => String(sql).includes("status = 'ready'"));
    expect(sourceUpdate?.[1]).toEqual([
      'NO_TEXT_CONTENT',
      '未识别到文字，不影响保存原文件或将图片插入笔记',
      'source-empty',
    ]);
    expect(finishConnection.query.mock.calls.some(([sql]) => String(sql).includes("status = 'failed'"))).toBe(false);
    const coverageUpdate = finishConnection.query.mock.calls.find(([sql]) =>
      String(sql).includes('coverage_metadata = ?'),
    );
    expect(JSON.parse(coverageUpdate[1][0]).reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'NO_TEXT_CONTENT' })]),
    );
    infoSpy.mockRestore();
  });

  it('解析成功时在同一事务持久化完整覆盖元数据', async () => {
    const content = Buffer.from('第一段。\n\n第二段。');
    const claimConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT * FROM ai_document_jobs')) {
          return [[{ id: 8, source_id: 'source-ready', attempts: 0 }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    const finishConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT id FROM ai_document_jobs')) return [[{ id: 8 }]];
        if (String(sql).includes('SELECT id FROM ai_document_sources')) return [[{ id: 'source-ready' }]];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.getConnection.mockResolvedValueOnce(claimConnection).mockResolvedValueOnce(finishConnection);
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 'source-ready',
          object_key: 'tmp/source-ready',
          file_name: 'ready.txt',
          file_type: 'text/plain',
          file_size: content.length,
          status: 'parsing',
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    ]);
    getObjectMetadataFromObs.mockResolvedValue({ contentLength: content.length });
    getObjectBufferFromObs.mockResolvedValue(content);

    await expect(runSingleDocumentJob('worker-success')).resolves.toBe(true);

    const coverageUpdate = finishConnection.query.mock.calls.find(([sql]) =>
      String(sql).includes('coverage_metadata = ?'),
    );
    const persisted = JSON.parse(coverageUpdate[1][0]);
    expect(persisted).toEqual(
      expect.objectContaining({ metadataAvailable: true, coverageRatio: 1, complete: true, truncated: false }),
    );
    expect(finishConnection.commit).toHaveBeenCalledOnce();
  });

  it('Worker 租约已被在线 Vision 接管时丢弃迟到结果，不覆盖高精度识别', async () => {
    const content = Buffer.from('迟到的本地 OCR');
    const claimConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT * FROM ai_document_jobs')) {
          return [[{ id: 11, source_id: 'source-stolen', attempts: 0 }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    const finishConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT id FROM ai_document_jobs')) return [[]];
        throw new Error(`lease lost 后不应继续查询: ${sql}`);
      }),
    };
    pool.getConnection.mockResolvedValueOnce(claimConnection).mockResolvedValueOnce(finishConnection);
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 'source-stolen',
          object_key: 'tmp/source-stolen',
          file_name: 'stolen.txt',
          file_type: 'text/plain',
          file_size: content.length,
          status: 'parsing',
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    ]);
    getObjectMetadataFromObs.mockResolvedValue({ contentLength: content.length });
    getObjectBufferFromObs.mockResolvedValue(content);

    await expect(runSingleDocumentJob('worker-stale')).resolves.toBe(true);
    expect(finishConnection.rollback).toHaveBeenCalledOnce();
    expect(finishConnection.commit).not.toHaveBeenCalled();
    expect(finishConnection.query).toHaveBeenCalledTimes(1);
  });

  it('Worker 解析失败但租约已被接管时也不回写失败状态', async () => {
    const content = Buffer.alloc(128, 0);
    const claimConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT * FROM ai_document_jobs')) {
          return [[{ id: 12, source_id: 'source-stolen-failure', attempts: 0 }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    const failureConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT id FROM ai_document_jobs')) return [[]];
        throw new Error(`lease lost 后不应写失败状态: ${sql}`);
      }),
    };
    pool.getConnection.mockResolvedValueOnce(claimConnection).mockResolvedValueOnce(failureConnection);
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 'source-stolen-failure',
          object_key: 'tmp/source-stolen-failure',
          file_name: 'stolen-failure.txt',
          file_type: 'text/plain',
          file_size: content.length,
          status: 'parsing',
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    ]);
    getObjectMetadataFromObs.mockResolvedValue({ contentLength: content.length });
    getObjectBufferFromObs.mockResolvedValue(content);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runSingleDocumentJob('worker-stale-failure')).resolves.toBe(true);
    expect(failureConnection.rollback).toHaveBeenCalledOnce();
    expect(failureConnection.commit).not.toHaveBeenCalled();
    expect(failureConnection.query).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('解析失败时持久化失败范围和原因', async () => {
    const content = Buffer.alloc(128, 0);
    const claimConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT * FROM ai_document_jobs')) {
          return [[{ id: 9, source_id: 'source-failed', attempts: 0 }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    const failureConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT id FROM ai_document_jobs')) return [[{ id: 9 }]];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.getConnection.mockResolvedValueOnce(claimConnection).mockResolvedValueOnce(failureConnection);
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 'source-failed',
          object_key: 'tmp/source-failed',
          file_name: 'failed.txt',
          file_type: 'text/plain',
          file_size: content.length,
          status: 'parsing',
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    ]);
    getObjectMetadataFromObs.mockResolvedValue({ contentLength: content.length });
    getObjectBufferFromObs.mockResolvedValue(content);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runSingleDocumentJob('worker-failure')).resolves.toBe(true);

    const coverageUpdate = failureConnection.query.mock.calls.find(([sql]) =>
      String(sql).includes('coverage_metadata = ?'),
    );
    const persisted = JSON.parse(coverageUpdate[1][0]);
    expect(persisted.complete).toBe(false);
    expect(persisted.coverageRatio).toBe(0);
    expect(persisted.failedRanges).toHaveLength(1);
    expect(persisted.reasons[0].code).toBe('FILE_CONTENT_INVALID');
    errorSpy.mockRestore();
  });

  it('覆盖字段迁移尚未执行时主解析任务仍可完成并提交', async () => {
    const content = Buffer.from('兼容滚动升级');
    const missingColumnError = Object.assign(new Error('Unknown column coverage_metadata'), {
      code: 'ER_BAD_FIELD_ERROR',
    });
    const claimConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT * FROM ai_document_jobs')) {
          return [[{ id: 10, source_id: 'source-rolling', attempts: 0 }]];
        }
        if (String(sql).includes('coverage_metadata = NULL')) throw missingColumnError;
        return [{ affectedRows: 1 }];
      }),
    };
    const finishConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT id FROM ai_document_jobs')) return [[{ id: 10 }]];
        if (String(sql).includes('SELECT id FROM ai_document_sources')) return [[{ id: 'source-rolling' }]];
        if (String(sql).includes('coverage_metadata = ?')) throw missingColumnError;
        return [{ affectedRows: 1 }];
      }),
    };
    pool.getConnection.mockResolvedValueOnce(claimConnection).mockResolvedValueOnce(finishConnection);
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 'source-rolling',
          object_key: 'tmp/source-rolling',
          file_name: 'rolling.txt',
          file_type: 'text/plain',
          file_size: content.length,
          status: 'parsing',
          expires_at: new Date(Date.now() + 60_000),
        },
      ],
    ]);
    getObjectMetadataFromObs.mockResolvedValue({ contentLength: content.length });
    getObjectBufferFromObs.mockResolvedValue(content);

    await expect(runSingleDocumentJob('worker-rolling')).resolves.toBe(true);
    expect(claimConnection.commit).toHaveBeenCalledOnce();
    expect(finishConnection.commit).toHaveBeenCalledOnce();
    expect(finishConnection.rollback).not.toHaveBeenCalled();
  });
});
