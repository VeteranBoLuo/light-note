import { beforeEach, describe, expect, it, vi } from 'vitest';

const createNoteService = vi.fn();
vi.mock('../../services/noteService.js', () => ({ createNote: createNoteService }));

const { default: createNoteTool, normalizeCreateNoteArgs } = await import('./create_note.js');

describe('Agent create_note', () => {
  beforeEach(() => vi.clearAllMocks());

  it('确认前拒绝缺少标题的空参数，避免生成必然失败的确认卡', () => {
    expect(() => createNoteTool.preview({})).toThrow('TITLE_REQUIRED: 笔记标题不能为空');
  });

  it('归一化模型常见的标题和正文别名', () => {
    expect(normalizeCreateNoteArgs({ noteTitle: ' 日报 ', noteContent: ' 今日完成 ' })).toEqual({
      title: '日报',
      content: '今日完成',
    });
    expect(createNoteTool.preview({ name: '周报', body: '本周总结' })).toMatchObject({
      target: '周报',
    });
  });

  it('把归一化后的 Markdown 笔记交给共享业务 Service', async () => {
    createNoteService.mockResolvedValue({ id: 'note-1', title: '日报', type: 'markdown' });
    const request = { headers: { fingerprint: 'fp' } };
    const result = await createNoteTool.execute(
      { note_title: ' 日报 ', note_content: ' 今日完成 ' },
      { userId: 'user-1', userRole: 'user', request, suppressUserRewards: false },
    );

    expect(createNoteService).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        userRole: 'user',
        note: { title: '日报', content: '今日完成', type: 'markdown' },
        request,
        maxContentLength: 60000,
      }),
    );
    expect(result).toEqual({ id: 'note-1', title: '日报', type: 'markdown' });
  });
});
