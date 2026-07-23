import { beforeEach, describe, expect, it, vi } from 'vitest';

const listInboxResources = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: {} }));
vi.mock('../../resourceInbox.js', () => ({ listInboxResources }));

const { default: tool } = await import('./query_inbox.js');

describe('query_inbox 工具', () => {
  beforeEach(() => vi.clearAllMocks());

  it('归一资源类型别名并强制请求摘要视图', async () => {
    listInboxResources.mockResolvedValue({
      items: [],
      total: 0,
      nextCursor: null,
      pendingTotal: 0,
      typeTotals: { bookmark: 0, note: 0, file: 0 },
    });

    await tool.execute(
      { type: 'file', query: '合同', sort: 'oldest', limit: 99 },
      { userId: 'user-1', userRole: 'user' },
    );

    expect(listInboxResources).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        type: 'file',
        keyword: '合同',
        sort: 'oldest',
        limit: 50,
        view: 'summary',
      }),
    );
  });

  it('游客不会读取待整理资源', async () => {
    const result = await tool.execute({}, { userId: 'visitor', userRole: 'visitor' });
    expect(result).toMatchObject({ items: [], total: 0, pendingTotal: 0 });
    expect(listInboxResources).not.toHaveBeenCalled();
  });

  it('管理员只读代管游客主体时仍使用主体 ID 查询', async () => {
    listInboxResources.mockResolvedValue({
      items: [],
      total: 0,
      nextCursor: null,
      pendingTotal: 0,
      typeTotals: { bookmark: 0, note: 0, file: 0 },
    });
    await tool.execute(
      {},
      {
        userId: 'visitor-subject',
        userRole: 'visitor',
        billingUserRole: 'root',
        request: { adminContext: { mode: 'readonly' } },
      },
    );
    expect(listInboxResources).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'visitor-subject', view: 'summary' }),
    );
  });

  it('混合资源结果生成可点击的稳定来源，不使用正文、URL 或摘要字段', () => {
    const raw = {
      total: 2,
      pendingTotal: 3,
      items: [
        { resourceType: 'note', resourceId: 'n1', title: '会议纪要', source: 'manual', collectedAt: '2026-07-23' },
        {
          resourceType: 'bookmark',
          resourceId: 'b1',
          title: '产品文档',
          source: 'quick_capture',
          collectedAt: '2026-07-22',
        },
      ],
    };

    const text = tool.transform({
      ...raw,
      items: [{ ...raw.items[0], summary: '私密笔记正文', detail: 'https://private.example' }, raw.items[1]],
    });
    expect(text).not.toContain('私密笔记正文');
    expect(text).not.toContain('private.example');
    expect(tool.toSources(raw)).toEqual([
      { type: 'note', id: 'n1', title: '会议纪要', target: 'note-detail' },
      { type: 'bookmark', id: 'b1', title: '产品文档', target: 'bookmark-edit' },
    ]);
  });
});
