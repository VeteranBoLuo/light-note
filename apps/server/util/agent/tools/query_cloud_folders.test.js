import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: { query } }));

const { default: tool } = await import('./query_cloud_folders.js');

describe('query_cloud_folders 工具', () => {
  beforeEach(() => vi.clearAllMocks());

  it('只查询当前用户未删除的文件夹并返回稳定引用', async () => {
    query.mockResolvedValueOnce([[{ id: 7, name: '项目资料', parent_id: null, file_count: 3 }]]);

    const raw = await tool.execute({ folderName: '项目', limit: 200 }, { userId: 'user-1' });

    expect(query.mock.calls[0][0]).toContain('folders.create_by = ? AND folders.del_flag = 0');
    expect(query.mock.calls[0][1]).toEqual(['user-1', '项目', 50]);
    expect(raw).toEqual({
      total: 1,
      items: [{ id: '7', name: '项目资料', parentId: null, fileCount: 3 }],
    });
    expect(tool.transform(raw)).toContain('[folder:7] 项目资料');
  });

  it('空结果明确提示可使用根目录', async () => {
    query.mockResolvedValueOnce([[]]);
    const raw = await tool.execute({}, { userId: 'user-1' });
    expect(tool.transform(raw)).toContain('云空间根目录');
  });
});
