import { describe, expect, it, vi } from 'vitest';
import { RESOURCE_TYPE, validateUserResources, validateUserTags } from './resourceTags.js';

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
});
