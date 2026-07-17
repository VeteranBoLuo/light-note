import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const recognizeNoteImages = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query } }));
vi.mock('./noteImageOcr.js', () => ({ recognizeNoteImages }));

const { buildNoteAiPayload, findOwnedNoteForAi, recognizeOwnedNoteImages } = await import('./noteAiService.js');

describe('noteAiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('按笔记 ID 与当前用户双重校验归属', async () => {
    query.mockResolvedValueOnce([[{ id: 'note-1', title: '我的笔记', content: '<p>正文</p>', type: 'html' }]]);

    const note = await findOwnedNoteForAi({ userId: 'user-1', noteId: 'note-1' });

    expect(note.id).toBe('note-1');
    expect(query.mock.calls[0][1]).toEqual(['note-1', 'user-1']);
  });

  it('读取正文阶段只做语义解析，不隐式执行 OCR', async () => {
    const result = await buildNoteAiPayload({
      note: {
        id: 'note-1',
        type: 'html',
        content:
          '<p><input type="checkbox" checked> 已完成</p><p><input type="checkbox"> 待完成</p>' +
          '<img src="https://boluo66.top/uploads/a.png">',
      },
      question: '图片里是什么？',
    });

    expect(result.document.checklist).toMatchObject({ total: 2, completed: 1, pending: 1 });
    expect(result.document.images).toHaveLength(1);
    expect(recognizeNoteImages).not.toHaveBeenCalled();
  });

  it('图片分析只把该笔记已登记且被指定的图片交给 OCR', async () => {
    const imageA = 'https://boluo66.top/uploads/a.png';
    const imageB = 'https://boluo66.top/uploads/b.png';
    query.mockResolvedValueOnce([[{ url: imageA }]]);
    recognizeNoteImages.mockResolvedValueOnce([{ order: 1, url: imageA, status: 'success', content: 'A' }]);

    const results = await recognizeOwnedNoteImages({
      note: { id: 'note-1' },
      document: {
        images: [
          { order: 1, url: imageA },
          { order: 2, url: imageB },
        ],
      },
      imageNumbers: [1, 2],
      limit: 3,
    });

    expect(recognizeNoteImages).toHaveBeenCalledWith(
      [{ order: 1, url: imageA }],
      expect.objectContaining({ allowedUrls: new Set([imageA]), limit: 3 }),
    );
    expect(results).toEqual([
      expect.objectContaining({ order: 1, status: 'success' }),
      expect.objectContaining({ order: 2, status: 'unsupported' }),
    ]);
  });
});
