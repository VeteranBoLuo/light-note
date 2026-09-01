import { describe, expect, it, vi } from 'vitest';
import { resolveTagAnalysisScope } from './tagAnalysisScopeService.js';

describe('tagAnalysisScopeService', () => {
  it('按标签 ID 和 owner 返回全部仍存活的三类资源候选', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'tag-1', name: '项目', description: '项目资料' }]])
        .mockResolvedValueOnce([
          [
            { resource_type: 'bookmark', resource_id: 'b-1' },
            { resource_type: 'note', resource_id: 'n-1' },
            { resource_type: 'file', resource_id: 'f-1' },
          ],
        ]),
    };

    await expect(resolveTagAnalysisScope(database, { userId: 'u-1', tagId: 'tag-1' })).resolves.toEqual({
      tag: { id: 'tag-1', name: '项目', description: '项目资料' },
      resourceRefs: [
        { type: 'bookmark', id: 'b-1' },
        { type: 'note', id: 'n-1' },
        { type: 'file', id: 'f-1' },
      ],
    });
    expect(database.query.mock.calls[0][0]).toContain('id = ? AND user_id = ? AND del_flag = 0');
    expect(database.query.mock.calls[1][0]).toContain('resource_tag_relations');
    expect(database.query.mock.calls[1][0]).toContain("r.resource_type = 'bookmark' AND b.id IS NOT NULL");
  });

  it('标签不存在或不属于当前用户时不读取关系', async () => {
    const database = { query: vi.fn().mockResolvedValueOnce([[]]) };
    await expect(resolveTagAnalysisScope(database, { userId: 'u-1', tagId: 'other' })).resolves.toBeNull();
    expect(database.query).toHaveBeenCalledOnce();
  });

  it('缺少权威身份或标签 ID 时失败关闭', async () => {
    const database = { query: vi.fn() };
    await expect(resolveTagAnalysisScope(database, { tagId: 'tag-1' })).rejects.toMatchObject({
      code: 'USER_REQUIRED',
    });
    await expect(resolveTagAnalysisScope(database, { userId: 'u-1' })).rejects.toMatchObject({ code: 'TAG_REQUIRED' });
    expect(database.query).not.toHaveBeenCalled();
  });
});
