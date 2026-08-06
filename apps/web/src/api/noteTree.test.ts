import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiBasePostMock } = vi.hoisted(() => ({
  apiBasePostMock: vi.fn(),
}));

vi.mock('@/http/request', () => ({
  apiBasePost: apiBasePostMock,
}));

import {
  collapseNoteDeletePreviews,
  fetchNoteDeletePreview,
  fetchNoteTreeFeatures,
  type NoteDeletePreview,
} from './noteTree';

describe('noteTree feature snapshot', () => {
  beforeEach(() => {
    apiBasePostMock.mockReset();
  });

  it('只接受服务端显式 true，未知或缺失值一律失败关闭', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 200,
      data: {
        features: {
          note_tree_read: true,
          note_tree_write: 1,
          note_tree_mobile: true,
          note_tree_subtree_trash: false,
          ai_note_branch_scope: true,
          ai_note_branch_analysis: true,
          unknown_feature: true,
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
