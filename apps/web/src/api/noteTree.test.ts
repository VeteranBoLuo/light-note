import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiBasePostMock } = vi.hoisted(() => ({
  apiBasePostMock: vi.fn(),
}));

vi.mock('@/http/request', () => ({
  apiBasePost: apiBasePostMock,
}));

import {
  collapseNoteDeletePreviews,
  fetchNoteBranchItems,
  fetchNoteDeletePreview,
  fetchNoteTreeFeatures,
  normalizeNoteTreeFeatures,
  type NoteDeletePreview,
} from './noteTree';

describe('noteTree feature snapshot', () => {
  beforeEach(() => {
    apiBasePostMock.mockReset();
  });

  it('识别 resultData 实际返回的 camelCase 字段，且只接受显式 true', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 200,
      data: {
        features: {
          noteTreeRead: true,
          noteTreeWrite: 1,
          noteTreeMobile: true,
          noteTreeSubtreeTrash: false,
          aiNoteBranchScope: true,
          aiNoteBranchAnalysis: true,
          unknownFeature: true,
        },
      },
    });

    await expect(fetchNoteTreeFeatures()).resolves.toEqual({
      note_tree_read: true,
      note_tree_write: false,
      note_tree_mobile: true,
      note_tree_subtree_trash: false,
      ai_note_branch_scope: true,
      ai_note_branch_analysis: true,
    });
    expect(apiBasePostMock).toHaveBeenCalledWith('/api/note/getNoteTreeFeatures', {}, { silent: true });
  });

  it('兼容未经过 resultData 转换的 snake_case 能力快照', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 200,
      data: {
        features: {
          note_tree_read: true,
          note_tree_write: true,
          note_tree_mobile: true,
          note_tree_subtree_trash: true,
          ai_note_branch_scope: true,
          ai_note_branch_analysis: true,
        },
      },
    });

    await expect(fetchNoteTreeFeatures()).resolves.toEqual({
      note_tree_read: true,
      note_tree_write: true,
      note_tree_mobile: true,
      note_tree_subtree_trash: true,
      ai_note_branch_scope: true,
      ai_note_branch_analysis: true,
    });
  });

  it('详情聚合响应可以直接规范化能力快照，不额外依赖接口包装层', () => {
    expect(
      normalizeNoteTreeFeatures({
        noteTreeRead: true,
        noteTreeWrite: true,
        note_tree_mobile: true,
        noteTreeSubtreeTrash: false,
        ai_note_branch_scope: true,
        aiNoteBranchAnalysis: true,
      }),
    ).toEqual({
      note_tree_read: true,
      note_tree_write: true,
      note_tree_mobile: true,
      note_tree_subtree_trash: false,
      ai_note_branch_scope: true,
      ai_note_branch_analysis: true,
    });
  });

  it('旧后端或异常响应不猜测开启状态', async () => {
    apiBasePostMock.mockResolvedValue({ status: 404, data: null });
    await expect(fetchNoteTreeFeatures()).rejects.toThrow('NOTE_TREE_FEATURES_UNAVAILABLE');
  });
});

describe('noteTree delete preview', () => {
  beforeEach(() => {
    apiBasePostMock.mockReset();
  });

  it('读取完整后代树并生成服务端并发确认数量', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 200,
      data: {
        parentId: 'parent',
        maxDepth: 8,
        items: [
          {
            id: 'child-a',
            children: [{ id: 'grandchild-a' }],
          },
          { id: 'child-b', children: [] },
        ],
      },
    });

    await expect(fetchNoteDeletePreview('parent')).resolves.toEqual({
      id: 'parent',
      descendantIds: ['child-a', 'grandchild-a', 'child-b'],
      descendantCount: 3,
      totalCount: 4,
    });
    expect(apiBasePostMock).toHaveBeenCalledWith(
      '/api/note/queryNoteTree',
      { parentId: 'parent', depth: 'all' },
      { silent: true },
    );
  });

  it('服务端拒绝预览时不生成可误导的空范围', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 404,
      data: { code: 'NOTE_TREE_NODE_NOT_FOUND' },
    });

    await expect(fetchNoteDeletePreview('missing')).rejects.toThrow('NOTE_TREE_NODE_NOT_FOUND');
  });
});

describe('noteTree branch picker', () => {
  beforeEach(() => {
    apiBasePostMock.mockReset();
  });

  it('把完整多级子树按视觉顺序展开为可提交的普通笔记项', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 200,
      data: {
        parentId: 'parent',
        maxDepth: 8,
        items: [
          {
            id: 'child-a',
            parentId: 'parent',
            title: '子页面 A',
            childCount: 1,
            hasChildren: true,
            isTop: false,
            sort: 1,
            children: [
              {
                id: 'grandchild-a',
                parentId: 'child-a',
                title: '孙页面 A',
                childCount: 0,
                hasChildren: false,
                isTop: false,
                sort: 1,
                children: [],
              },
            ],
          },
          {
            id: 'child-b',
            parentId: 'parent',
            title: '子页面 B',
            childCount: 0,
            hasChildren: false,
            isTop: false,
            sort: 2,
            children: [],
          },
        ],
      },
    });

    const items = await fetchNoteBranchItems('parent');
    expect(items.map((item) => item.id)).toEqual(['child-a', 'grandchild-a', 'child-b']);
    expect(items.every((item) => !('depth' in item))).toBe(true);
    expect(apiBasePostMock).toHaveBeenCalledWith(
      '/api/note/queryNoteTree',
      { parentId: 'parent', depth: 'all' },
      { silent: true },
    );
  });

  it('目录读取失败时不把它误当作空目录', async () => {
    apiBasePostMock.mockResolvedValue({ status: 403, data: { code: 'NOTE_TREE_FORBIDDEN' } });
    await expect(fetchNoteBranchItems('parent')).rejects.toThrow('NOTE_TREE_FORBIDDEN');
  });
});

describe('collapseNoteDeletePreviews', () => {
  it('父子同时被选中时只提交父节点，影响数量按唯一页面计算', () => {
    const previews: NoteDeletePreview[] = [
      {
        id: 'parent',
        descendantIds: ['child', 'grandchild'],
        descendantCount: 2,
        totalCount: 3,
      },
      {
        id: 'child',
        descendantIds: ['grandchild'],
        descendantCount: 1,
        totalCount: 2,
      },
      {
        id: 'other',
        descendantIds: [],
        descendantCount: 0,
        totalCount: 1,
      },
    ];

    expect(collapseNoteDeletePreviews(previews)).toEqual({
      items: [previews[0], previews[2]],
      totalCount: 4,
    });
  });

  it('重复选择不会重复提交或重复计数', () => {
    const preview: NoteDeletePreview = {
      id: 'note-1',
      descendantIds: ['note-2'],
      descendantCount: 1,
      totalCount: 2,
    };

    expect(collapseNoteDeletePreviews([preview, preview])).toEqual({
      items: [preview],
      totalCount: 2,
    });
  });
});
