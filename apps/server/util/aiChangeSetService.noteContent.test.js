import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyOwnedNoteContentChange = vi.fn();

vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('./services/noteService.js', () => ({ applyOwnedNoteContentChange }));

const { __testing } = await import('./aiChangeSetService.js');

const identity = { actorUserId: 'actor-1', subjectUserId: 'subject-1' };
const before = { title: '目标笔记', type: 'markdown', content: '旧正文' };
const after = { title: '目标笔记', type: 'markdown', content: '旧正文\n\nAI 新内容' };

function item(overrides = {}) {
  return {
    id: 'item-1',
    operation: 'update_note_content',
    resourceType: 'note',
    resourceId: 'note-1',
    before,
    beforeHash: __testing.stateHash(before),
    after,
    reason: '追加 AI 回答',
    receipt: null,
    ...overrides,
  };
}

describe('AI Change Set note content operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyOwnedNoteContentChange.mockResolvedValue(after);
  });

  it('应用前读取 subject 自己的笔记并校验快照哈希，再交给笔记领域服务写入', async () => {
    const connection = {
      query: vi.fn().mockResolvedValueOnce([[before]]),
    };
    const receipt = await __testing.applyItem(connection, identity, item());
    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining('id = ? AND create_by = ? AND del_flag = 0 FOR UPDATE'),
      ['note-1', 'subject-1'],
    );
    expect(applyOwnedNoteContentChange).toHaveBeenCalledWith(connection, {
      userId: 'subject-1',
      actorUserId: 'actor-1',
      noteId: 'note-1',
      before,
      after,
    });
    expect(receipt).toMatchObject({ before, after, undoSupported: true, afterHash: __testing.stateHash(after) });
  });

  it('撤销只在当前正文仍等于执行回执 afterHash 时恢复 before', async () => {
    const connection = { query: vi.fn().mockResolvedValueOnce([[after]]) };
    await __testing.undoItem(
      connection,
      identity,
      item({ receipt: { before, after, afterHash: __testing.stateHash(after), undoSupported: true } }),
    );
    expect(applyOwnedNoteContentChange).toHaveBeenCalledWith(connection, {
      userId: 'subject-1',
      actorUserId: 'actor-1',
      noteId: 'note-1',
      before: after,
      after: before,
    });
  });

  it('执行后笔记再次变化时拒绝撤销，不覆盖用户新编辑', async () => {
    const connection = {
      query: vi.fn().mockResolvedValueOnce([[{ ...after, content: `${after.content}\n用户后续编辑` }]]),
    };
    await expect(
      __testing.undoItem(
        connection,
        identity,
        item({ receipt: { before, after, afterHash: __testing.stateHash(after), undoSupported: true } }),
      ),
    ).rejects.toMatchObject({ code: 'UNDO_CONFLICT', status: 409 });
    expect(applyOwnedNoteContentChange).not.toHaveBeenCalled();
  });
});
