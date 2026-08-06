import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock('../personalKnowledgeSearch.js', () => ({ searchPersonalKnowledge: mocks.search }));

const { resolveNoteDraftScopeMaterials } = await import('./noteDraftScopeMaterials.js');

describe('noteDraftScopeMaterials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search.mockResolvedValue({ hits: [] });
  });

  it('只在 owner 权威目录 allowlist 内做 Top-N 笔记检索并合并同页片段', async () => {
    mocks.search.mockResolvedValue({
      hits: [
        { type: 'note', id: 'n1', title: '移动端', sectionTitle: '导航', excerpt: '使用底部目录抽屉。' },
        { type: 'note', id: 'outside', title: '范围外', excerpt: '绝不能进入草稿。' },
        { type: 'bookmark', id: 'n2', title: '伪类型', excerpt: '绝不能进入草稿。' },
        { type: 'note', id: 'n1', title: '移动端', sectionTitle: '兼容', excerpt: '保留实色选中态。' },
        { type: 'note', id: 'n2', title: 'AI Agent', excerpt: '目录范围按 ID 解析。' },
      ],
    });

    const result = await resolveNoteDraftScopeMaterials({
      userId: 'owner-1',
      query: '总结移动端与 AI 目录设计',
      resolvedScopes: {
        noteIds: ['n1', 'n2'],
        branches: [{ id: 'n1', title: '项目', totalPages: 2 }],
      },
    });

    expect(mocks.search).toHaveBeenCalledWith({
      userId: 'owner-1',
      query: '总结移动端与 AI 目录设计',
      limit: 20,
      scope: {
        types: ['note'],
        resourceIds: [
          { type: 'note', id: 'n1' },
          { type: 'note', id: 'n2' },
        ],
      },
    });
    expect(result).toEqual({
      materials: [
        {
          type: 'note',
          id: 'n1',
          title: '移动端',
          content: '小节：导航\n使用底部目录抽屉。\n\n小节：兼容\n保留实色选中态。',
        },
        { type: 'note', id: 'n2', title: 'AI Agent', content: '目录范围按 ID 解析。' },
      ],
      entityRefs: [
        { type: 'note', id: 'n1', title: '移动端' },
        { type: 'note', id: 'n2', title: 'AI Agent' },
      ],
      matchedPageCount: 2,
      totalPages: 2,
    });
  });

  it('缺少用户、目录或查询时不触发全库兜底检索', async () => {
    await expect(
      resolveNoteDraftScopeMaterials({ userId: 'owner-1', query: '', resolvedScopes: { noteIds: ['n1'] } }),
    ).resolves.toEqual({ materials: [], entityRefs: [], matchedPageCount: 0, totalPages: 1 });
    await expect(
      resolveNoteDraftScopeMaterials({ userId: 'owner-1', query: '总结', resolvedScopes: { noteIds: [] } }),
    ).resolves.toEqual({ materials: [], entityRefs: [], matchedPageCount: 0, totalPages: 0 });
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
