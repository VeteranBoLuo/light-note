import { beforeEach, describe, expect, it, vi } from 'vitest';

const createNoteService = vi.fn();
const resolveOwnedNoteCreateTarget = vi.fn(async ({ parentId }) => ({
  parentId,
  depth: parentId ? 2 : 1,
  items: parentId ? [{ id: 'parent-1', title: '项目' }, { id: parentId, title: '周报' }] : [],
}));
vi.mock('../../services/noteService.js', () => ({ createNote: createNoteService }));
vi.mock('../../services/noteTreeService.js', () => ({ resolveOwnedNoteCreateTarget }));

const { default: createNoteTool, normalizeCreateNoteArgs } = await import('./create_note.js');

describe('Agent create_note', () => {
  beforeEach(() => vi.clearAllMocks());

  it('确认前拒绝缺少标题的空参数，避免生成必然失败的确认卡', async () => {
    await expect(createNoteTool.preview({})).rejects.toThrow('TITLE_REQUIRED: 笔记标题不能为空');
  });

  it('归一化模型常见的标题、正文和父页面别名', async () => {
    expect(normalizeCreateNoteArgs({ noteTitle: ' 日报 ', noteContent: ' 今日完成 ' })).toEqual({
      title: '日报',
      content: '今日完成',
    });
    expect(normalizeCreateNoteArgs({ name: '周报', body: '本周总结', parent_id: ' parent-2 ' })).toEqual({
      title: '周报',
      content: '本周总结',
      parentId: 'parent-2',
    });
    await expect(createNoteTool.preview({ name: '周报', body: '本周总结' })).resolves.toMatchObject({
      target: '周报',
      details: [{ key: 'targetDirectory', value: '' }],
    });
  });

  it('确认前按当前用户校验目标目录和深度，并展示权威面包屑', async () => {
    await expect(
      createNoteTool.preview(
        { title: '本周进展', content: '正文', parentId: 'parent-2' },
        { userId: 'user-1' },
      ),
    ).resolves.toMatchObject({
      details: [{ key: 'targetDirectory', value: '项目 / 周报' }],
    });
    expect(resolveOwnedNoteCreateTarget).toHaveBeenCalledWith({ userId: 'user-1', parentId: 'parent-2' });
  });

  it('目标目录不属于当前用户或超过深度时不签发可执行预览', async () => {
    resolveOwnedNoteCreateTarget.mockRejectedValueOnce(
      Object.assign(new Error('目标目录不存在'), { code: 'NOTE_TREE_PARENT_NOT_FOUND', status: 404 }),
    );
    await expect(
      createNoteTool.preview({ title: '越权笔记', parentId: 'foreign-parent' }, { userId: 'user-1' }),
    ).rejects.toMatchObject({ code: 'NOTE_TREE_PARENT_NOT_FOUND', status: 404 });
  });

  it('把归一化后的 Markdown 笔记交给共享业务 Service', async () => {
    createNoteService.mockResolvedValue({ id: 'note-1', title: '日报', type: 'markdown', parentId: 'parent-1' });
    const request = { headers: { fingerprint: 'fp' } };
    const result = await createNoteTool.execute(
      { note_title: ' 日报 ', note_content: ' 今日完成 ', parent_id: ' parent-1 ' },
      {
        userId: 'user-1',
        userRole: 'user',
        request,
        suppressUserRewards: false,
        idempotencyKey: 'agent-write-v1:note-tool',
      },
    );

    expect(createNoteService).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        userRole: 'user',
        note: { title: '日报', content: '今日完成', type: 'markdown', parentId: 'parent-1' },
        request,
        maxContentLength: 60000,
        idempotencyKey: 'agent-write-v1:note-tool',
      }),
    );
    expect(result).toEqual({ id: 'note-1', title: '日报', type: 'markdown', parentId: 'parent-1' });
  });

  it('用户可见成功回执不暴露内部资源 ID', () => {
    const summary = createNoteTool.transform({ id: 'note-internal-id', title: '日报', type: 'markdown' });
    expect(summary).toBe('✅ 笔记「日报」已创建成功');
    expect(summary).not.toContain('note-internal-id');
  });
});
