import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const findOwnedNoteForAi = vi.fn();
const recognizeOwnedNoteImages = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: { query } }));
vi.mock('../../noteAiService.js', () => ({ findOwnedNoteForAi, recognizeOwnedNoteImages }));

const { default: tool } = await import('./analyze_resource_images.js');

describe('analyze_resource_images 工具', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('按笔记归属读取指定图片，最多接受 3 个序号', async () => {
    findOwnedNoteForAi.mockResolvedValue({
      id: 'note-1',
      title: '图文笔记',
      type: 'html',
      content:
        '<p>正文</p><img src="https://boluo66.top/uploads/a.png" alt="A"><img src="https://boluo66.top/uploads/b.png" alt="B">',
    });
    recognizeOwnedNoteImages.mockResolvedValue([{ order: 2, alt: 'B', status: 'success', content: '第二张图的文字' }]);

    const raw = await tool.execute(
      { resourceType: 'note', resourceId: 'note-1', imageNumbers: [2, 2, 5, 7] },
      { userId: 'user-1', signal: new AbortController().signal },
    );

    expect(findOwnedNoteForAi).toHaveBeenCalledWith({ userId: 'user-1', noteId: 'note-1' });
    expect(recognizeOwnedNoteImages).toHaveBeenCalledWith(
      expect.objectContaining({ imageNumbers: [2, 5, 7], limit: 3 }),
    );
    expect(tool.transform(raw)).toContain('第二张图的文字');
  });

  it('已解析的上传图片按用户归属读取 OCR 分片', async () => {
    query
      .mockResolvedValueOnce([[{ id: 'doc-1', file_name: '截图.png', file_type: 'image/png', status: 'ready' }]])
      .mockResolvedValueOnce([[{ chunk_index: 0, content: '上传图片里的文字', locator_value: '图片' }]]);

    const raw = await tool.execute(
      { resourceType: 'document', resourceId: 'doc-1' },
      { userId: 'user-1', signal: new AbortController().signal },
    );

    expect(query.mock.calls[0][1]).toEqual(['doc-1', 'user-1']);
    expect(tool.transform(raw)).toContain('上传图片里的文字');
  });

  it('非图片文档拒绝走图片分析链路', async () => {
    query.mockResolvedValueOnce([
      [{ id: 'doc-1', file_name: '说明.pdf', file_type: 'application/pdf', status: 'ready' }],
    ]);

    const raw = await tool.execute({ resourceType: 'document', resourceId: 'doc-1' }, { userId: 'user-1' });
    expect(raw).toMatchObject({ error: 'INVALID_TYPE' });
    expect(tool.transform(raw)).toBe('该资源不是图片文件，请使用文件正文解析结果。');
  });
});
