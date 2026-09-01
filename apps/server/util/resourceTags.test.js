import { describe, expect, it, vi } from 'vitest';
import {
  RESOURCE_TYPE,
  validateEditableTagResources,
  validateUserResources,
  validateUserTags,
} from './resourceTags.js';

describe('资源标签归属校验', () => {
  it('标签列表包含其他用户标签时拒绝', async () => {
    const connection = { query: vi.fn().mockResolvedValue([[{ id: 'tag-own' }]]) };
    await expect(validateUserTags(connection, { tagIds: ['tag-own', 'tag-other'], userId: 'user-1' })).rejects.toThrow(
      '包含无效标签',
    );
  });

  it('资源列表包含无权访问资源时拒绝建立关系', async () => {
    const connection = { query: vi.fn().mockResolvedValue([[{ id: 'note-own' }]]) };
    await expect(
      validateUserResources(connection, {
        resourceIds: ['note-own', 'note-other'],
        resourceType: RESOURCE_TYPE.NOTE,
        userId: 'user-1',
      }),
    ).rejects.toThrow('包含无权访问或不存在的资源');
    expect(connection.query.mock.calls[0][0]).toContain('create_by = ?');
  });

  it('编辑标签时丢弃已关联但已删除的历史资源，不阻断其他字段保存', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'note-own' }]])
        .mockResolvedValueOnce([[{ resource_id: 'note-deleted' }]]),
    };

    await expect(
      validateEditableTagResources(connection, {
        tagId: 'tag-1',
        resourceIds: ['note-own', 'note-deleted'],
        resourceType: RESOURCE_TYPE.NOTE,
        userId: 'user-1',
      }),
    ).resolves.toEqual(['note-own']);
    expect(connection.query.mock.calls[1][0]).toContain('resource_tag_relations');
    expect(connection.query.mock.calls[1][1]).toEqual(['tag-1', 'note', 'user-1', 'note-deleted']);
  });

  it('编辑标签时仍拒绝从未关联的越权资源', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'note-own' }]])
        .mockResolvedValueOnce([[]]),
    };

    await expect(
      validateEditableTagResources(connection, {
        tagId: 'tag-1',
        resourceIds: ['note-own', 'note-other'],
        resourceType: RESOURCE_TYPE.NOTE,
        userId: 'user-1',
      }),
    ).rejects.toThrow('包含无权访问或不存在的资源');
  });
});
