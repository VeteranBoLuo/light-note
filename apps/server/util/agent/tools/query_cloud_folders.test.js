import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: { query } }));

const { default: tool } = await import('./query_cloud_folders.js');

describe('query_cloud_folders 工具', () => {
  beforeEach(() => vi.clearAllMocks());

  it('只查询当前用户未删除的文件夹并返回稳定引用', async () => {
    query.mockResolvedValueOnce([
      [
        { id: 6, name: '工作', parent_id: null, sort: 0, direct_file_count: 1 },
        { id: 7, name: '项目资料', parent_id: 6, sort: 0, direct_file_count: 3 },
      ],
    ]);

    const raw = await tool.execute({ folderName: '项目', limit: 200 }, { userId: 'user-1' });

    expect(query.mock.calls[0][0]).toContain('folders.create_by = ? AND folders.del_flag = 0');
    expect(query.mock.calls[0][1]).toEqual(['user-1']);
    expect(raw).toMatchObject({
      total: 1,
      items: [
        {
          id: '7',
          name: '项目资料',
          parentId: '6',
          depth: 2,
          fullPath: '工作 / 项目资料',
          fileCount: 3,
        },
      ],
      resultMetadata: { totalCount: 1, returned: 1, completeness: 'complete' },
    });
    expect(tool.transform(raw)).toContain('[folder:7] 工作 / 项目资料');
  });

  it('空结果明确提示可以不放入文件夹', async () => {
    query.mockResolvedValueOnce([[]]);
    const raw = await tool.execute({}, { userId: 'user-1' });
    expect(tool.transform(raw)).toContain('不放入文件夹');
  });
});
