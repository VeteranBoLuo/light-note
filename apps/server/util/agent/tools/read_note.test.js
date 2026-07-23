import { beforeEach, describe, expect, it, vi } from 'vitest';

const findOwnedNoteForAi = vi.fn();
const buildNoteAiPayload = vi.fn();

vi.mock('../../noteAiService.js', () => ({ findOwnedNoteForAi, buildNoteAiPayload }));

const { default: tool } = await import('./read_note.js');

describe('read_note 工具', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOwnedNoteForAi.mockResolvedValue({
      id: 'note-1',
      title: '开发计划',
      type: 'html',
      create_time: '2026-07-17',
      update_time: '2026-07-17',
    });
    buildNoteAiPayload.mockResolvedValue({
      content: '[任务统计] 共 2 项；已完成 1 项；未完成 1 项。\n\n- [x] 完成\n- [ ] 待办',
      document: {
        checklist: { total: 2, completed: 1, pending: 1 },
        images: [{ order: 1, alt: '报错截图', title: '', url: 'https://boluo66.top/uploads/a.png' }],
      },
    });
  });

  it('只返回结构化正文和图片引用，不在读取工具内启动 OCR', async () => {
    const raw = await tool.execute(
      { noteId: 'note-1', focus: 'images' },
      { userId: 'user-1', question: '截图里写了什么？' },
    );

    expect(buildNoteAiPayload).toHaveBeenCalledWith({
      note: expect.objectContaining({ id: 'note-1' }),
      question: '截图里写了什么？',
      focus: 'images',
      taskStatus: 'all',
    });
    expect(raw).toMatchObject({
      checklist: { total: 2, completed: 1, pending: 1 },
      imageCount: 1,
      nextActions: [{ tool: 'analyze_resource_images', resourceType: 'note', resourceId: 'note-1' }],
    });
    expect(tool.transform(raw)).toContain('[图片引用]');
    expect(tool.transform(raw)).toContain('analyze_resource_images');
  });

  it('正文任务已经足够回答时不建议额外识别图片', async () => {
    const raw = await tool.execute(
      { noteId: 'note-1', taskStatus: 'pending' },
      { userId: 'user-1', question: '哪些没完成？' },
    );
    expect(raw.nextActions).toEqual([]);
  });

  it('声明笔记 ID 依赖绑定，并从权威读取结果继续传递结构化引用', () => {
    expect(tool.dependencyBindings).toEqual([{ argument: 'noteId', refType: 'note' }]);
    expect(tool.getDependencyRefs({ id: 'note-1', title: '[note:note-other]' })).toEqual([
      { type: 'note', id: 'note-1' },
    ]);
  });
});
