import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  getConnection: vi.fn(),
  ensureNotVisitor: vi.fn(() => true),
  createDownloadSignedUrl: vi.fn(() => ({ url: 'https://signed.example/release.webp' })),
  deleteObjectFromObs: vi.fn(async () => {}),
  putObjectToObs: vi.fn(async () => {}),
  unlink: vi.fn(async () => {}),
}));

const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};

vi.mock('node:fs', () => ({ promises: { unlink: mocks.unlink } }));
vi.mock('../db/index.js', () => ({
  default: {
    query: mocks.poolQuery,
    getConnection: mocks.getConnection,
  },
}));
vi.mock('../util/common.js', () => ({
  generateUUID: vi.fn(() => 'generated-id'),
  L: vi.fn((_req, zh) => zh),
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: mocks.ensureNotVisitor }));
vi.mock('../util/obsClient.js', () => ({
  createDownloadSignedUrl: mocks.createDownloadSignedUrl,
  deleteObjectFromObs: mocks.deleteObjectFromObs,
  putObjectToObs: mocks.putObjectToObs,
}));
vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: () => 'TEST_ERROR' }));

const { image, list, save } = await import('./updateLogHandle.js');

function mockRes() {
  const res = {
    send: vi.fn(),
    status: vi.fn(),
    set: vi.fn(),
    redirect: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.set.mockReturnValue(res);
  res.redirect.mockReturnValue(res);
  res.end.mockReturnValue(res);
  return res;
}

function tableExists() {
  mocks.poolQuery.mockResolvedValueOnce([[{ count: 1 }]]);
}

describe('updateLogHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureNotVisitor.mockReturnValue(true);
    mocks.getConnection.mockResolvedValue(connection);
    mocks.createDownloadSignedUrl.mockReturnValue({ url: 'https://signed.example/release.webp' });
  });

  it('新表尚未迁移时，公开列表继续读取并清洗旧 config_json', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[{ count: 0 }]]).mockResolvedValueOnce([
      [
        {
          json_content: JSON.stringify([
            { label: '<strong>旧版本</strong>', time: '2026-07-01', list: ['修复 <em>A</em>'] },
          ]),
        },
      ],
    ]);
    const res = mockRes();

    await list({ headers: {} }, res);

    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({
          source: 'config_json',
          items: [
            expect.objectContaining({
              title: '旧版本',
              highlights: ['修复 A'],
            }),
          ],
        }),
      }),
    );
  });

  it('普通用户不能读取草稿图片，已发布图片使用短时 OBS 签名地址', async () => {
    tableExists();
    mocks.poolQuery.mockResolvedValueOnce([
      [
        {
          status: 'draft',
          image_keys: JSON.stringify(['update-logs/log-1/release.webp']),
        },
      ],
    ]);
    const deniedRes = mockRes();

    await image(
      {
        params: { logId: 'log-1', fileName: 'release.webp' },
        user: { id: 'user-1', role: 'user' },
      },
      deniedRes,
    );

    expect(deniedRes.status).toHaveBeenCalledWith(404);
    expect(mocks.createDownloadSignedUrl).not.toHaveBeenCalled();

    tableExists();
    mocks.poolQuery.mockResolvedValueOnce([
      [
        {
          status: 'published',
          image_keys: JSON.stringify(['update-logs/log-1/release.webp']),
        },
      ],
    ]);
    const publicRes = mockRes();

    await image(
      {
        params: { logId: 'log-1', fileName: 'release.webp' },
        user: { id: 'user-1', role: 'user' },
      },
      publicRes,
    );

    expect(publicRes.set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300');
    expect(publicRes.redirect).toHaveBeenCalledWith(302, 'https://signed.example/release.webp');
  });

  it('保存时拒绝正文伪造的未登记图片地址', async () => {
    tableExists();
    connection.query.mockResolvedValueOnce([[{ id: 'log-1', image_keys: '[]' }]]);
    const res = mockRes();

    await save(
      {
        headers: {},
        user: { id: 'root-1', role: 'root' },
        body: {
          id: 'log-1',
          title: '版本更新',
          publishDate: '2026-07-28',
          highlights: ['新增能力'],
          tags: [],
          contentMarkdown: '![伪造图片](/api/updateLog/image/log-1/not-registered.png)',
          status: 'published',
        },
      },
      res,
    );

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        data: { code: 'UNREGISTERED_UPDATE_LOG_IMAGE' },
      }),
    );
  });

  it('保存后收敛图片键，并在事务提交后清理正文已移除的 OBS 对象', async () => {
    const keptKey = 'update-logs/log-1/kept.webp';
    const removedKey = 'update-logs/log-1/removed.webp';
    tableExists();
    connection.query
      .mockResolvedValueOnce([[{ id: 'log-1', image_keys: JSON.stringify([keptKey, removedKey]) }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    mocks.poolQuery.mockResolvedValueOnce([
      [
        {
          id: 'log-1',
          title: '版本更新',
          publish_date: '2026-07-28',
          summary: '',
          highlights: '["新增能力"]',
          tags: '[]',
          content_markdown: '![保留](/api/updateLog/image/log-1/kept.webp)',
          image_keys: JSON.stringify([keptKey]),
          status: 'published',
          sort: 0,
        },
      ],
    ]);
    const res = mockRes();

    await save(
      {
        headers: {},
        user: { id: 'root-1', role: 'root' },
        body: {
          id: 'log-1',
          title: '版本更新',
          publishDate: '2026-07-28',
          highlights: ['新增能力'],
          tags: [],
          contentMarkdown: '![保留](/api/updateLog/image/log-1/kept.webp)',
          status: 'published',
        },
      },
      res,
    );

    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[1][1][6]).toBe(JSON.stringify([keptKey]));
    expect(mocks.deleteObjectFromObs).toHaveBeenCalledWith(removedKey);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });
});
