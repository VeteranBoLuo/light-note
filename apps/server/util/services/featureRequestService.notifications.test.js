import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('../agent/data.js', () => ({ generateUUID: vi.fn() }));
vi.mock('../notification.js', () => ({ createNotification: vi.fn() }));

import { generateUUID } from '../agent/data.js';
import { createNotification } from '../notification.js';
import { createFeatureRequest, addSubmitterFeatureUpdate } from './featureRequestService.js';

const input = { title: '测试共建建议', content: '这是用于验证管理员通知的建议内容。' };
function fixture() {
  const connection = {
    beginTransaction: vi.fn().mockResolvedValue(),
    query: vi.fn().mockResolvedValue([{}]),
    commit: vi.fn().mockResolvedValue(),
    rollback: vi.fn().mockResolvedValue(),
    release: vi.fn(),
  };
  const db = {
    getConnection: vi.fn().mockResolvedValue(connection),
    query: vi.fn().mockResolvedValue([
      [
        { id: 'admin', lang: 'zh-CN' },
        { id: 'admin-en', lang: 'en-US' },
      ],
    ]),
  };
  return { db, connection };
}

beforeEach(() => {
  vi.resetAllMocks();
  let sequence = 0;
  generateUUID.mockImplementation(() => `uuid-${++sequence}`);
  createNotification.mockResolvedValue('notification');
});

describe('共建管理员通知', () => {
  it('提交成功释放事务后提醒有效管理员，排除本人，并保留中英文及稳定来源键', async () => {
    const { db, connection } = fixture();
    createNotification.mockImplementation(async () => {
      expect(connection.commit).toHaveBeenCalledOnce();
      expect(connection.release).toHaveBeenCalledOnce();
    });
    const result = await createFeatureRequest({ userId: 'author', input, db });
    expect(result).toMatchObject({ id: 'uuid-1', moderationStatus: 'pending_review' });
    expect(db.query).toHaveBeenCalledWith(expect.stringMatching(/role = 'root' AND del_flag = 0 AND id <> \?/), [
      'author',
    ]);
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenNthCalledWith(
      1,
      'admin',
      expect.objectContaining({
        type: 'feature_request',
        title: '收到新的共建建议',
        link: '/co-build/uuid-1',
        sourceType: 'feature_request_admin',
        sourceId: 'uuid-2',
        meta: { requestId: 'uuid-1', event: 'submitted' },
      }),
      db,
    );
    expect(createNotification).toHaveBeenNthCalledWith(
      2,
      'admin-en',
      expect.objectContaining({
        title: 'New co-build suggestion',
        sourceId: 'uuid-2',
      }),
      db,
    );
    expect(JSON.stringify(createNotification.mock.calls)).not.toContain(input.content);
  });

  it('官方规划不生成管理员提醒', async () => {
    const { db } = fixture();
    await createFeatureRequest({ userId: 'admin', input, sourceType: 'official', db });
    expect(createNotification).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('提交事务失败时不发送通知', async () => {
    const { db, connection } = fixture();
    connection.commit.mockRejectedValue(new Error('commit failed'));
    await expect(createFeatureRequest({ userId: 'author', input, db })).rejects.toThrow('commit failed');
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it.each(['lookup', 'delivery'])('通知 %s 失败不影响已提交的建议，也不回滚已提交事务', async (stage) => {
    const { db, connection } = fixture();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    if (stage === 'lookup') db.query.mockRejectedValue(new Error('private details'));
    else createNotification.mockRejectedValueOnce(new Error('private details'));
    try {
      await expect(createFeatureRequest({ userId: 'author', input, db })).resolves.toMatchObject({ id: 'uuid-1' });
      expect(connection.rollback).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith('[共建轻笺] FEATURE_REQUEST_ADMIN_NOTIFICATION_FAILED');
      if (stage === 'delivery') expect(createNotification).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });

  it('每次合法补充使用对应时间线 ID，提醒管理员但不暴露正文', async () => {
    const { db } = fixture();
    db.query
      .mockResolvedValueOnce([[{ id: 'request' }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}]);
    await addSubmitterFeatureUpdate({ requestId: 'request', userId: 'author', content: '补充私密内容', db });
    expect(db.query.mock.calls[1][1][0]).toBe('uuid-1');
    expect(createNotification).toHaveBeenCalledWith(
      'admin',
      expect.objectContaining({
        title: '用户补充了共建建议',
        sourceId: 'uuid-1',
        link: '/co-build/request',
        meta: { requestId: 'request', event: 'submitter_addition' },
      }),
      db,
    );
    expect(JSON.stringify(createNotification.mock.calls)).not.toContain('补充私密内容');
  });

  it('无权补充时不写入时间线、不通知', async () => {
    const { db } = fixture();
    db.query.mockResolvedValueOnce([[]]);
    await expect(
      addSubmitterFeatureUpdate({ requestId: 'request', userId: 'other', content: '补充内容', db }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
