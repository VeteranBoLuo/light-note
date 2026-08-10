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

const { resolveFilePreview, runSingleFilePreviewJob } = await import('./service.js');

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

function convertedJob() {
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
  };
}

function arrangeConvertedWorker({ staleCompletion = false } = {}) {
  let leaseOwner = '';
  const claimQuery = vi.fn(async (sql, params = []) => {
    const statement = String(sql);
    if (statement.includes('SELECT j.id AS job_id')) return [[convertedJob()]];
    if (statement.includes("UPDATE file_preview_jobs SET status = 'processing'")) {
      leaseOwner = params[1];
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 1 }];
  });
  const completeQuery = vi.fn(async (sql) => {
    const statement = String(sql);
    if (statement.includes('SELECT a.*, j.status AS job_status')) {
      return [
        [
          {
            ...convertedJob(),
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
});
