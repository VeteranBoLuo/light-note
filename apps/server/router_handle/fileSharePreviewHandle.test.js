import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolMocks = vi.hoisted(() => ({ getConnection: vi.fn(), query: vi.fn() }));
const previewMocks = vi.hoisted(() => ({
  listArchivePreview: vi.fn(),
  prepareFilePreview: vi.fn(),
  resolveFilePreview: vi.fn(),
}));
const ticketMocks = vi.hoisted(() => ({
  issueFilePreviewShareTicket: vi.fn(),
  readFilePreviewShareTicket: vi.fn(),
}));
const obsMocks = vi.hoisted(() => ({
  buildObjectKey: vi.fn((_ownerUserId, fileName) => `files/${fileName}`),
  createDownloadSignedUrl: vi.fn(() => ({
    url: 'https://files.example/legacy.doc?signature=test',
    expiresIn: 600,
  })),
}));

vi.mock('../db/index.js', () => ({ default: poolMocks }));
vi.mock('../util/common.js', () => ({
  L: (_req, zh) => zh,
  generateUUID: vi.fn(() => 'generated-id'),
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/obsClient.js', () => obsMocks);
vi.mock('../util/filePreview/service.js', () => previewMocks);
vi.mock('../util/filePreview/shareTicket.js', () => ticketMocks);
vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: () => 'SAFE_ERROR' }));

const { prepareFileSharePreview, resolveFileSharePreview } = await import('./fileShareHandle.js');

function shareRow(overrides = {}) {
  return {
    id: 'share-1',
    file_id: 42,
    owner_user_id: 'user-1',
    file_owner_id: 'user-1',
    file_name: 'legacy.doc',
    file_type: 'application/msword',
    file_size: 8,
    file_del_flag: 0,
    status: 'active',
    revoked_at: null,
    expires_at: new Date(Date.now() + 60_000),
    access_code_hash: null,
    access_count: 0,
    max_access_count: null,
    download_count: 0,
    max_download_count: 1,
    ...overrides,
  };
}

function response() {
  return { send: vi.fn() };
}

function transactionFor(row) {
  const query = vi.fn(async (sql) => {
    if (String(sql).includes('FROM file_shares s')) return [[row]];
    return [{ affectedRows: 1 }];
  });
  const connection = {
    beginTransaction: vi.fn(),
    query,
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  poolMocks.getConnection.mockResolvedValue(connection);
  return connection;
}

describe('shared derived file preview handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewMocks.prepareFilePreview.mockResolvedValue({ status: 'queued', previewType: 'converted-pdf' });
    previewMocks.resolveFilePreview.mockResolvedValue({ status: 'ready', previewType: 'converted-pdf' });
    ticketMocks.issueFilePreviewShareTicket.mockResolvedValue({ token: 'ticket-value', expiresIn: 900 });
  });

  it('counts the first prepare as one download and returns a scoped polling ticket', async () => {
    const connection = transactionFor(shareRow());
    const res = response();

    await prepareFileSharePreview(
      { body: { token: 't'.repeat(43), retry: false }, ip: '127.0.0.1', headers: {} },
      res,
    );

    expect(connection.query.mock.calls.filter(([sql]) => String(sql).includes('download_count = download_count + 1')))
      .toHaveLength(1);
    expect(previewMocks.prepareFilePreview).toHaveBeenCalledWith({
      ownerUserId: 'user-1',
      fileId: 42,
      retry: false,
    });
    expect(ticketMocks.issueFilePreviewShareTicket).toHaveBeenCalledWith({
      shareId: 'share-1',
      fileId: 42,
      ownerUserId: 'user-1',
    });
    expect(res.send).toHaveBeenCalledWith({
      data: {
        status: 'queued',
        previewType: 'converted-pdf',
        previewTicket: 'ticket-value',
        ticketExpiresIn: 900,
        sourceDownloadUrl: 'https://files.example/legacy.doc?signature=test',
        sourceUrlExpiresIn: 600,
      },
      status: 200,
      msg: '',
    });
    expect(obsMocks.createDownloadSignedUrl).toHaveBeenCalledWith({
      objectKey: 'files/legacy.doc',
      expires: 600,
    });
  });

  it('does not consume download quota for a format outside the derived-preview registry', async () => {
    const connection = transactionFor(shareRow({ file_name: 'binary.exe', file_type: 'application/octet-stream' }));
    const res = response();

    await prepareFileSharePreview({ body: { token: 't'.repeat(43) }, ip: '127.0.0.1', headers: {} }, res);

    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('download_count + 1'))).toBe(false);
    expect(previewMocks.prepareFilePreview).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith({
      data: { errorCode: 'FILE_PREVIEW_UNSUPPORTED' },
      status: 415,
      msg: '此文件格式暂不支持在线预览',
    });
  });

  it('uses the ticket for later polls without starting a counted authorization transaction', async () => {
    const row = shareRow({ download_count: 1 });
    ticketMocks.readFilePreviewShareTicket.mockResolvedValue({
      shareId: 'share-1',
      fileId: '42',
      ownerUserId: 'user-1',
    });
    poolMocks.query.mockResolvedValue([[row]]);
    const res = response();

    await resolveFileSharePreview({ body: { previewTicket: 'ticket-value' } }, res);

    expect(poolMocks.getConnection).not.toHaveBeenCalled();
    expect(previewMocks.resolveFilePreview).toHaveBeenCalledWith({ ownerUserId: 'user-1', fileId: 42 });
    expect(res.send).toHaveBeenCalledWith({
      data: { status: 'ready', previewType: 'converted-pdf' },
      status: 200,
      msg: '',
    });
  });
});
