import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = { getConnection: vi.fn(), query: vi.fn() };
const generateUUID = vi.fn();
const createNotification = vi.fn();

vi.mock('../../db/index.js', () => ({ default: pool }));
vi.mock('../agent/data.js', () => ({ generateUUID }));
vi.mock('../notification.js', () => ({ createNotification }));

const { createFeatureRequest, getFeatureRequestDetail, toggleFeatureRequestVote } =
  await import('./featureRequestService.js');

const createConnection = () => ({
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  query: vi.fn(),
});

describe('featureRequestService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateUUID.mockReturnValueOnce('request-1').mockReturnValueOnce('update-1');
  });

  it('官方规划直接公开，并在时间线明确标记为官方来源', async () => {
    const connection = createConnection();
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await createFeatureRequest({
      userId: 'root-1',
      sourceType: 'official',
      input: { title: '支持文件对话能力', content: '支持上传文件后生成摘要与笔记。', category: 'ai' },
      db,
    });

    expect(result).toEqual(expect.objectContaining({ sourceType: 'official', moderationStatus: 'published' }));
    expect(connection.query.mock.calls[0][1]).toEqual(expect.arrayContaining(['official', 'root-1', 'published']));
    expect(connection.query.mock.calls[1][1]).toEqual([
      'update-1',
      'request-1',
      'official_created',
      '轻笺团队发布了官方规划',
      'root-1',
    ]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('普通用户建议进入待审核状态且不会伪装成公开内容', async () => {
    const connection = createConnection();
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await createFeatureRequest({
      userId: 'user-1',
      input: { title: '希望支持批量整理', content: '在书签页批量选择后统一推荐标签。' },
      db,
    });

    expect(result.moderationStatus).toBe('pending_review');
    expect(connection.query.mock.calls[1][1][2]).toBe('submitted');
  });

  it('合并后的建议仍可通过原链接查看，并返回合并目标', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'request-1', moderation_status: 'merged', merged_to_id: 'request-2' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ id: 'request-2', title: '统一目标' }]]),
    };

    const result = await getFeatureRequestDetail({ id: 'request-1', db });

    expect(db.query.mock.calls[0][0]).toContain("IN ('published','merged')");
    expect(result.mergedTo).toEqual({ id: 'request-2', title: '统一目标' });
  });

  it('投票在事务中按明细表重新计数，避免并发增减造成漂移', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[{ id: 'request-1' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ total: 3 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const db = { getConnection: vi.fn(async () => connection) };

    await expect(toggleFeatureRequestVote({ requestId: 'request-1', userId: 'user-1', db })).resolves.toEqual({
      voted: true,
      voteCount: 3,
    });
    expect(connection.query.mock.calls[4][1]).toEqual([3, 'request-1']);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
});
