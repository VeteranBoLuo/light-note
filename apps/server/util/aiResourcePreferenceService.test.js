import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidatePersonalKnowledgeCache = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('./personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache }));
vi.mock('../db/index.js', () => ({ default: {} }));

import {
  listAiResourcePreferences,
  updateAiResourcePreference,
} from './aiResourcePreferenceService.js';

const identity = {
  actorUserId: 'user-1',
  subjectUserId: 'user-1',
  adminContextMode: 'normal',
};

describe('AI resource preference service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('列表只返回请求资源并标记永久排除状态', async () => {
    const database = {
      query: vi.fn().mockResolvedValue([
        [{ resourceType: 'note', resourceId: 'n-1', aiExcluded: 1 }],
      ]),
    };
    await expect(
      listAiResourcePreferences(
        identity,
        {
          items: [
            { type: 'note', id: 'n-1' },
            { type: 'bookmark', id: 'b-1' },
          ],
        },
        database,
      ),
    ).resolves.toEqual({
      items: [
        { resourceType: 'note', resourceId: 'n-1', aiExcluded: true },
        { resourceType: 'bookmark', resourceId: 'b-1', aiExcluded: false },
      ],
    });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = ?'), [
      'user-1',
      'note',
      'n-1',
      'bookmark',
      'b-1',
    ]);
  });

  it('永久排除在同一事务推进代际并删除旧分块', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'n-1' }]])
        .mockResolvedValue([{}]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      updateAiResourcePreference(identity, { type: 'note', id: 'n-1', aiExcluded: true }, database),
    ).resolves.toEqual({
      resourceType: 'note',
      resourceId: 'n-1',
      aiExcluded: true,
    });

    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), ['n-1', 'user-1']);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO ai_resource_preferences'), [
      'user-1',
      'note',
      'n-1',
    ]);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO ai_content_generations'), [
      'user-1',
    ]);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM ai_content_chunks'), [
      'user-1',
      'note',
      'n-1',
    ]);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(invalidatePersonalKnowledgeCache).toHaveBeenCalledWith('user-1', { persist: false });
  });

  it('只读管理员在连接数据库前即被拒绝', async () => {
    const database = { getConnection: vi.fn() };
    await expect(
      updateAiResourcePreference(
        { ...identity, adminContextMode: 'readonly' },
        { type: 'file', id: '9', aiExcluded: true },
        database,
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_PREVIEW_READONLY', status: 403 });
    expect(database.getConnection).not.toHaveBeenCalled();
  });

  it('归属校验失败会回滚且不失效缓存', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi.fn().mockResolvedValueOnce([[]]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };
    await expect(
      updateAiResourcePreference(identity, { type: 'bookmark', id: 'foreign', aiExcluded: true }, database),
    ).rejects.toMatchObject({ code: 'AI_RESOURCE_NOT_FOUND', status: 404 });
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(invalidatePersonalKnowledgeCache).not.toHaveBeenCalled();
  });
});
