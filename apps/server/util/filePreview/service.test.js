import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolMocks = vi.hoisted(() => ({ query: vi.fn(), getConnection: vi.fn() }));
const obsMocks = vi.hoisted(() => ({
  buildObjectKey: vi.fn((_userId, fileName) => `source/${fileName}`),
  createDownloadSignedUrl: vi.fn(() => ({ url: 'https://preview.example/derived.pdf' })),
  deleteObjectFromObs: vi.fn(),
  getObjectBufferFromObs: vi.fn(),
  getObjectMetadataFromObs: vi.fn(),
  putObjectBodyToObs: vi.fn(),
}));
const officeMocks = vi.hoisted(() => ({ convertOfficeToPdf: vi.fn() }));
const archiveMocks = vi.hoisted(() => ({
  buildArchiveDirectoryPage: vi.fn(),
  createArchiveManifest: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ default: poolMocks }));
vi.mock('../obsClient.js', () => obsMocks);
vi.mock('../agent/logSafety.js', () => ({ stableAgentErrorCode: (error) => error?.code || 'SAFE_ERROR' }));
vi.mock('./office.js', () => officeMocks);
vi.mock('./archive.js', () => archiveMocks);
vi.mock('./runtime.js', () => ({
  getFilePreviewRuntimeConfig: () => ({
    sevenZipBin: '7zz',
    officeBin: 'soffice',
    limits: {},
  }),
  inspectFilePreviewRuntime: vi.fn(),
}));

const {
  FILE_PREVIEW_SOURCE_TYPE,
  cleanupStaleFilePreviewArtifacts,
  deleteFilePreviewArtifactsForSource,
  resolveFilePreview,
  runSingleFilePreviewJob,
} = await import('./service.js');

function connection(query) {
  return {
    beginTransaction: vi.fn(),
    query,
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
}

const sourceBuffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function convertedJob(overrides = {}) {
  return {
    job_id: 5,
    attempts: 0,
    id: 10,
    file_id: 42,
    owner_user_id: 'user-1',
    strategy: 'converted_pdf',
    strategy_version: 1,
    format_id: 'legacy-word',
    source_etag: 'etag-1',
    source_size: sourceBuffer.length,
    status: 'queued',
    file_name: 'legacy.doc',
    file_type: 'application/msword',
    file_size: sourceBuffer.length,
    obs_key: 'source-key',
    create_by: 'user-1',
    del_flag: 0,
    source_type: FILE_PREVIEW_SOURCE_TYPE.CLOUD_FILE,
    ...overrides,
  };
}

function arrangeConvertedWorker({ staleCompletion = false, sourceAvailable = true, jobOverrides = {} } = {}) {
  let leaseOwner = '';
  const claimQuery = vi.fn(async (sql, params = []) => {
    const statement = String(sql);
    if (statement.includes('SELECT j.id AS job_id')) return [[convertedJob(jobOverrides)]];
    if (statement.includes("UPDATE file_preview_jobs SET status = 'processing'")) {
      leaseOwner = params[1];
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 1 }];
  });
  const completeQuery = vi.fn(async (sql) => {
    const statement = String(sql);
    if (statement.includes('FROM files WHERE') || statement.includes('FROM community_chat_message_files')) {
      if (!sourceAvailable) return [[], []];
      const job = convertedJob(jobOverrides);
      return [
        [
          {
            id: job.file_id,
            create_by: job.owner_user_id,
            file_name: job.file_name,
            file_type: job.file_type,
            file_size: job.file_size,
            obs_key: job.obs_key,
            expires_at:
              job.source_type === FILE_PREVIEW_SOURCE_TYPE.COMMUNITY_CHAT_FILE
                ? new Date(Date.now() + 60_000).toISOString()
                : null,
          },
        ],
        [],
      ];
    }
    if (statement.includes('SELECT a.*, j.status AS job_status')) {
      return [
        [
          {
            ...convertedJob(jobOverrides),
            status: 'processing',
            job_status: 'processing',
            job_attempts: 1,
            job_locked_by: staleCompletion ? 'another-worker:lease' : leaseOwner,
          },
        ],
      ];
    }
    return [{ affectedRows: 1 }];
  });
  const claimConnection = connection(claimQuery);
  const completeConnection = connection(completeQuery);
  poolMocks.getConnection.mockResolvedValueOnce(claimConnection).mockResolvedValueOnce(completeConnection);
  poolMocks.query.mockResolvedValue([{ affectedRows: 1 }]);
  return { claimConnection, completeConnection, getLeaseOwner: () => leaseOwner };
}

describe('file preview service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obsMocks.getObjectMetadataFromObs.mockResolvedValue({ contentLength: sourceBuffer.length, etag: '"etag-1"' });
    obsMocks.getObjectBufferFromObs.mockResolvedValue(sourceBuffer);
    obsMocks.putObjectBodyToObs.mockResolvedValue(undefined);
    obsMocks.deleteObjectFromObs.mockResolvedValue(undefined);
    officeMocks.convertOfficeToPdf.mockResolvedValue(Buffer.from('%PDF-preview'));
  });

  it('binds a converted PDF upload to a unique database lease and commits the private object key', async () => {
    const arranged = arrangeConvertedWorker();

    await expect(runSingleFilePreviewJob('worker-a')).resolves.toBe(true);

    expect(arranged.getLeaseOwner()).toMatch(/^worker-a:[0-9a-f-]{36}$/u);
    expect(poolMocks.query).toHaveBeenCalledWith(
      expect.stringContaining('SET output_object_key = ?'),
      expect.arrayContaining([expect.stringMatching(/^file-previews\/user-1\/42\/[a-f0-9]{64}\.pdf$/u)]),
    );
    const [uploadedKey, uploadedPdf, contentType] = obsMocks.putObjectBodyToObs.mock.calls[0];
    expect(uploadedKey).toMatch(/^file-previews\/user-1\/42\/[a-f0-9]{64}\.pdf$/u);
    expect(uploadedPdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(contentType).toBe('application/pdf');
    expect(
      arranged.completeConnection.query.mock.calls.some(
        ([sql, params]) => String(sql).includes("SET status = 'ready'") && params[0] === uploadedKey,
      ),
    ).toBe(true);
    expect(obsMocks.deleteObjectFromObs).not.toHaveBeenCalled();
  });

  it('deletes an upload produced by a stale lease instead of overwriting the active attempt', async () => {
    arrangeConvertedWorker({ staleCompletion: true });

    await expect(runSingleFilePreviewJob('worker-a')).resolves.toBe(true);

    const [uploadedKey] = obsMocks.putObjectBodyToObs.mock.calls[0];
    expect(obsMocks.deleteObjectFromObs).toHaveBeenCalledWith(uploadedKey);
  });

  it('does not return a ready artifact when the current source ETag has changed', async () => {
    poolMocks.query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM files WHERE')) {
        return [
          [
            {
              id: 42,
              create_by: 'user-1',
              file_name: 'legacy.doc',
              file_type: 'application/msword',
              file_size: sourceBuffer.length,
              obs_key: 'source-key',
            },
          ],
        ];
      }
      if (statement.includes('FROM file_preview_artifacts')) {
        return [
          [
            {
              id: 10,
              file_id: 42,
              owner_user_id: 'user-1',
              strategy: 'converted_pdf',
              strategy_version: 1,
              format_id: 'legacy-word',
              source_etag: 'old-etag',
              source_size: sourceBuffer.length,
              status: 'ready',
              artifact_object_key: 'derived-key',
            },
          ],
        ];
      }
      throw new Error(`unexpected query: ${statement}`);
    });
    obsMocks.getObjectMetadataFromObs.mockResolvedValue({ contentLength: sourceBuffer.length, etag: 'new-etag' });

    await expect(resolveFilePreview({ ownerUserId: 'user-1', fileId: 42 })).resolves.toMatchObject({
      status: 'missing',
      previewType: 'converted-pdf',
    });
    expect(obsMocks.createDownloadSignedUrl).not.toHaveBeenCalled();
  });

  it('聊天文件只查询受控来源，并把派生预览签名寿命限制在附件剩余时间内', async () => {
    const expiresAt = new Date(Date.now() + 18_000).toISOString();
    poolMocks.query.mockImplementation(async (sql, params) => {
      const statement = String(sql);
      if (statement.includes('FROM community_chat_message_files')) {
        expect(params).toEqual([42, 'user-1']);
        return [
          [
            {
              id: 42,
              create_by: 'user-1',
              file_name: 'legacy.doc',
              file_type: 'application/msword',
              file_size: sourceBuffer.length,
              obs_key: 'community-chat/source-key',
              expires_at: expiresAt,
            },
          ],
        ];
      }
      if (statement.includes('FROM file_preview_artifacts')) {
        expect(params).toEqual(['community_chat_file', 42, 'converted_pdf', 1]);
        return [
          [
            {
              id: 10,
              source_type: 'community_chat_file',
              file_id: 42,
              owner_user_id: 'user-1',
              strategy: 'converted_pdf',
              strategy_version: 1,
              format_id: 'legacy-word',
              source_etag: 'etag-1',
              source_size: sourceBuffer.length,
              status: 'ready',
              artifact_object_key: 'derived-key',
              artifact_size: 100,
            },
          ],
        ];
      }
      if (statement.includes('UPDATE file_preview_artifacts SET last_access_at')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected query: ${statement}`);
    });

    const result = await resolveFilePreview({
      ownerUserId: 'user-1',
      fileId: 42,
      sourceType: FILE_PREVIEW_SOURCE_TYPE.COMMUNITY_CHAT_FILE,
    });

    expect(result).toMatchObject({ status: 'ready', previewUrl: 'https://preview.example/derived.pdf' });
    const signedExpiry = obsMocks.createDownloadSignedUrl.mock.calls[0][0].expires;
    expect(signedExpiry).toBeGreaterThan(0);
    expect(signedExpiry).toBeLessThanOrEqual(18);
  });

  it('聊天源在鉴权与预览解析之间到期时仍返回 410', async () => {
    poolMocks.query.mockResolvedValueOnce([[], []]);

    await expect(
      resolveFilePreview({
        ownerUserId: 'user-1',
        fileId: 42,
        sourceType: FILE_PREVIEW_SOURCE_TYPE.COMMUNITY_CHAT_FILE,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_FILE_EXPIRED', status: 410 });
  });

  it('聊天预览 Worker 使用带来源类型的对象键，避免与同 ID 云文件冲突', async () => {
    arrangeConvertedWorker({
      jobOverrides: {
        source_type: FILE_PREVIEW_SOURCE_TYPE.COMMUNITY_CHAT_FILE,
        obs_key: 'community-chat/source-key',
      },
    });

    await expect(runSingleFilePreviewJob('worker-chat')).resolves.toBe(true);

    expect(obsMocks.putObjectBodyToObs.mock.calls[0][0]).toMatch(
      /^file-previews\/community_chat_file\/user-1\/42\/[a-f0-9]{64}\.pdf$/u,
    );
  });

  it('聊天附件在转换期间过期时拒绝提交派生结果并删除刚上传的对象', async () => {
    const arranged = arrangeConvertedWorker({
      sourceAvailable: false,
      jobOverrides: {
        source_type: FILE_PREVIEW_SOURCE_TYPE.COMMUNITY_CHAT_FILE,
        obs_key: 'community-chat/source-key',
      },
    });

    await expect(runSingleFilePreviewJob('worker-expired')).resolves.toBe(true);

    const [uploadedKey] = obsMocks.putObjectBodyToObs.mock.calls[0];
    expect(obsMocks.deleteObjectFromObs).toHaveBeenCalledWith(uploadedKey);
    expect(
      arranged.completeConnection.query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'ready'")),
    ).toBe(false);
  });

  it('全局预览清理删除对象失败时保留数据库记录，供下一轮继续重试', async () => {
    let candidateQueryCount = 0;
    poolMocks.query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM file_preview_jobs') && statement.includes("status = 'failed'")) return [[], []];
      if (statement.includes('SELECT a.id, a.artifact_object_key')) {
        candidateQueryCount += 1;
        return candidateQueryCount === 1
          ? [[{ id: 10, artifact_object_key: 'preview/retry.pdf', output_object_key: null }], []]
          : [[], []];
      }
      if (statement.includes("SET a.status = 'failed'")) return [{ affectedRows: 1 }, []];
      throw new Error(`unexpected query: ${statement}`);
    });
    obsMocks.deleteObjectFromObs.mockRejectedValueOnce(new Error('OBS unavailable'));

    await expect(cleanupStaleFilePreviewArtifacts()).resolves.toBe(0);

    expect(obsMocks.deleteObjectFromObs).toHaveBeenCalledWith('preview/retry.pdf');
    expect(poolMocks.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM file_preview_artifacts'))).toBe(
      false,
    );
  });

  it('全局预览清理原子领取失败时不删对象，保留并发访问刷新的缓存', async () => {
    let candidateQueryCount = 0;
    poolMocks.query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM file_preview_jobs') && statement.includes("status = 'failed'")) return [[], []];
      if (statement.includes('SELECT a.id, a.artifact_object_key')) {
        candidateQueryCount += 1;
        return candidateQueryCount === 1
          ? [[{ id: 10, artifact_object_key: 'preview/active.pdf', output_object_key: null }], []]
          : [[], []];
      }
      if (statement.includes("SET a.status = 'failed'")) return [{ affectedRows: 0 }, []];
      throw new Error(`unexpected query: ${statement}`);
    });

    await expect(cleanupStaleFilePreviewArtifacts()).resolves.toBe(0);

    expect(obsMocks.deleteObjectFromObs).not.toHaveBeenCalled();
  });

  it('附件清理会先删除所有派生对象，再按来源类型删除可级联的预览记录', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            { id: 1, artifactObjectKey: 'preview/a.pdf', outputObjectKey: 'preview/a.pdf' },
            { id: 2, artifactObjectKey: null, outputObjectKey: 'preview/pending.pdf' },
          ],
        ])
        .mockResolvedValueOnce([{ affectedRows: 2 }]),
    };

    await expect(
      deleteFilePreviewArtifactsForSource({
        sourceType: FILE_PREVIEW_SOURCE_TYPE.COMMUNITY_CHAT_FILE,
        fileId: 42,
        db,
        deleteObject: obsMocks.deleteObjectFromObs,
      }),
    ).resolves.toEqual({ deletedArtifacts: 2, deletedObjects: 2 });
    expect(obsMocks.deleteObjectFromObs.mock.calls.map(([key]) => key)).toEqual([
      'preview/a.pdf',
      'preview/pending.pdf',
    ]);
    expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('DELETE FROM file_preview_artifacts'), [
      'community_chat_file',
      42,
    ]);
  });
  it('不再领取退役的图片派生任务', async () => {
    const query = vi.fn(async () => [[]]);
    poolMocks.getConnection.mockResolvedValue(connection(query));
    await expect(runSingleFilePreviewJob('worker')).resolves.toBe(false);
    expect(query.mock.calls.find(([sql]) => String(sql).includes('SELECT j.id AS job_id'))[0]).toContain("AND a.strategy IN ('archive_manifest', 'converted_pdf')");
    expect(obsMocks.getObjectBufferFromObs).not.toHaveBeenCalled();
  });

  it('文档清理器只删派生对象，并将图片资产生命周期交给图片清理器', async () => {
    poolMocks.query.mockImplementation(async sql => {
      const text = String(sql);
      if (text.includes('SELECT j.id, j.output_object_key')) return [[]];
      if (text.includes('SELECT a.id, a.artifact_object_key')) return [[
        { id: 20, artifact_object_key: 'file-previews/photo.webp', output_object_key: null, source_object_key: 'original.jpg' },
        { id: 21, artifact_object_key: null, output_object_key: null, source_object_key: 'small-original.png', output_mode: 'source' },
      ]];
      return [{ affectedRows: 1 }];
    });
    await expect(cleanupStaleFilePreviewArtifacts()).resolves.toBe(2);
    expect(obsMocks.deleteObjectFromObs.mock.calls).toEqual([['file-previews/photo.webp']]);
    const claims = poolMocks.query.mock.calls.filter(([sql]) => String(sql).includes("SET a.status = 'failed'"));
    expect(claims).toHaveLength(2);
    for (const [sql] of claims) {
      expect(sql).not.toContain("a.strategy IN ('image_thumbnail', 'image_display')");
      expect(sql).toContain("a.source_type <> 'image_asset'");
    }
  });

});
