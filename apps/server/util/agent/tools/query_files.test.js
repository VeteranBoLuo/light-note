import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const searchPersonalKnowledge = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: { query } }));
vi.mock('../../personalKnowledgeSearch.js', () => ({ searchPersonalKnowledge }));

const { default: tool } = await import('./query_files.js');

describe('query_files 工具', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM folders') && text.includes('WHERE create_by = ?')) return [[{ id: 7 }]];
      if (text.includes('COUNT(*) as total')) return [[{ total: 1 }]];
      if (text.includes('GROUP BY category')) return [[{ category: 'image', c: 1 }]];
      return [
        [
          {
            id: 9,
            file_name: '头像.png',
            file_type: 'image/png',
            file_size: 2048,
            create_time: '2026-07-17T10:00:00.000Z',
            folder_id: 7,
            folder_name: '个人资料',
          },
        ],
      ];
    });
  });

  it('按 folderId 权威筛选并返回文件夹信息和稳定文件引用', async () => {
    const raw = await tool.execute({ folder_id: 7, folderName: '不会覆盖 ID', type: 'image' }, { userId: 'user-1' });

    expect(query.mock.calls.every((call) => String(call[0]).includes('f.folder_id = ?'))).toBe(true);
    expect(query.mock.calls.every((call) => !String(call[0]).includes('folders.name = ?'))).toBe(true);
    expect(query.mock.calls.map((call) => call[1])).toEqual([
      ['user-1', '7', 10],
      ['user-1', '7'],
      ['user-1', '7'],
    ]);
    expect(raw.items[0]).toMatchObject({ folderId: '7', folderName: '个人资料' });
    expect(tool.transform(raw, { type: 'image' })).toContain('[file:9] 头像.png');
    expect(tool.transform(raw, { type: 'image' })).toContain('文件夹：个人资料');
  });

  it('没有 folderId 时按文件夹精确名称筛选', async () => {
    await tool.execute({ folderName: '个人资料' }, { userId: 'user-1' });
    expect(query.mock.calls[0][0]).toContain('FROM folders');
    expect(query.mock.calls[0][0]).toContain('create_by = ? AND del_flag = 0 AND name = ?');
    expect(query.mock.calls[0][0]).not.toContain('个人资料');
    expect(query.mock.calls[0][1]).toEqual(['user-1', '个人资料']);
    expect(query.mock.calls.slice(1).every((call) => String(call[0]).includes('f.folder_id = ?'))).toBe(true);
    expect(query.mock.calls.slice(1).every((call) => !String(call[0]).includes('folders.name = ?'))).toBe(true);
    expect(query.mock.calls.slice(1).map((call) => call[1])).toEqual([
      ['user-1', '7', 10],
      ['user-1', '7'],
      ['user-1', '7'],
    ]);
  });

  it('同名文件夹不唯一时拒绝猜测目标', async () => {
    query.mockResolvedValueOnce([[{ id: 7 }, { id: 8 }]]);

    await expect(tool.execute({ folderName: '项目资料' }, { userId: 'user-1' })).rejects.toThrow(/FOLDER_AMBIGUOUS/);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['user-1', '项目资料']);
  });

  it('文件夹名称不存在时返回空查询结果且不继续查文件', async () => {
    query.mockResolvedValueOnce([[]]);

    const raw = await tool.execute({ folderName: '不存在' }, { userId: 'user-1' });

    expect(raw).toEqual({ total: 0, items: [], typeBreakdown: {} });
    expect(tool.transform(raw)).toBe('没有找到文件');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['user-1', '不存在']);
  });

  it('拒绝无效文件夹 ID', async () => {
    await expect(tool.execute({ folderId: '../7' }, { userId: 'user-1' })).rejects.toThrow(/FOLDER_ID_INVALID/);
    expect(query).not.toHaveBeenCalled();
  });

  it('文件名 LIKE 零结果时降级语义索引，二次查询保留归属与类型/时间条件', async () => {
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('f.id IN (?)')) {
        return [
          [
            { id: 3, file_name: '方案.pdf', file_type: 'application/pdf', file_size: 100, create_time: null, folder_id: null, folder_name: null },
            { id: 5, file_name: '纪要.docx', file_type: 'application/msword', file_size: 100, create_time: null, folder_id: null, folder_name: null },
          ],
        ];
      }
      if (text.includes('COUNT(*) as total')) return [[{ total: 0 }]];
      if (text.includes('GROUP BY category')) return [[]];
      return [[]]; // 主查询零结果
    });
    searchPersonalKnowledge.mockResolvedValue({
      hits: [
        { type: 'file', id: '5' },
        { type: 'note', id: 'n1' }, // 非文件命中被过滤
        { type: 'file', id: '3' },
      ],
    });

    const result = await tool.execute(
      { keyword: '我上传过一个讲统一材料方案的文档', type: 'document', timeRange: '今年' },
      { userId: 'user-1' },
    );

    expect(searchPersonalKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', scope: { types: ['file'] } }),
    );
    const fallbackCall = query.mock.calls.find((call) => String(call[0]).includes('f.id IN (?)'));
    expect(String(fallbackCall[0])).toContain('f.create_by = ?');
    expect(String(fallbackCall[0])).toContain('f.create_time >= ?'); // 时间条件保留
    expect(String(fallbackCall[0])).toMatch(/file_type|LIKE/); // 类型条件保留（categoryCondition 产物）
    // 顺序跟随索引相关度（5 在前）
    expect(result.items.map((item) => String(item.id))).toEqual(['5', '3']);
    expect(result.matchMode).toBe('semantic');
    expect(tool.transform(result, {})).toContain('没有精确匹配');
  });

  it('降级自身失败时 fail-open 回到空结果', async () => {
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('COUNT(*) as total')) return [[{ total: 0 }]];
      if (text.includes('GROUP BY category')) return [[]];
      return [[]];
    });
    searchPersonalKnowledge.mockRejectedValue(new Error('INDEX_DOWN'));

    const result = await tool.execute({ keyword: '任意词' }, { userId: 'user-1' });

    expect(result).toMatchObject({ total: 0, items: [], matchMode: 'like' });
  });

  it('异常 limit 回退默认值，过大值限制为 50', async () => {
    await tool.execute({ limit: 'invalid' }, { userId: 'user-1' });
    expect(query.mock.calls[0][1]).toEqual(['user-1', 10]);

    vi.clearAllMocks();
    query.mockResolvedValue([[]]);
    await tool.execute({ limit: 999 }, { userId: 'user-1' });
    expect(query.mock.calls[0][1]).toEqual(['user-1', 50]);
  });
});
