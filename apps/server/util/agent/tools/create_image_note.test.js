import { beforeEach, describe, expect, it, vi } from 'vitest';

const prepareCreateImageNoteFromAttachment = vi.fn();
const createImageNoteFromAttachment = vi.fn();

vi.mock('../../services/attachmentActionService.js', () => ({
  prepareCreateImageNoteFromAttachment,
  createImageNoteFromAttachment,
}));

const { default: tool } = await import('./create_image_note.js');

describe('create_image_note 工具', () => {
  beforeEach(() => vi.clearAllMocks());

  it('预处理默认标题并在确认预览中展示真实文件和用户说明', async () => {
    prepareCreateImageNoteFromAttachment.mockResolvedValue({
      attachmentId: 'attachment-1',
      title: '旅行照片',
      description: '摄于海边',
      sourceFileName: '旅行照片.png',
      fileType: 'image/png',
      fileSize: 4096,
    });

    const prepared = await tool.prepareArgs(
      { attachment_id: 'attachment-1', caption: '摄于海边' },
      { userId: 'user-1' },
    );

    expect(prepareCreateImageNoteFromAttachment).toHaveBeenCalledWith({
      userId: 'user-1',
      attachmentId: 'attachment-1',
      title: '',
      description: '摄于海边',
    });
    expect(tool.directAction).toBe(true);
    expect(tool.preview(prepared)).toMatchObject({
      target: '旅行照片',
      details: expect.arrayContaining([
        { key: 'originalFileName', value: '旅行照片.png' },
        { key: 'noteTitle', value: '旅行照片' },
        { key: 'description', value: '摄于海边' },
      ]),
    });
  });

  it('执行时把确认链路的稳定动作键传给图片笔记服务', async () => {
    createImageNoteFromAttachment.mockResolvedValue({ id: 'note-1', title: '旅行照片', type: 'html' });
    await tool.execute(
      { attachment_id: 'attachment-1', title: '旅行照片', caption: '摄于海边' },
      {
        userId: 'user-1',
        userRole: 'user',
        idempotencyKey: 'agent-write-v1:image-tool',
      },
    );

    expect(createImageNoteFromAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        attachmentId: 'attachment-1',
        title: '旅行照片',
        description: '摄于海边',
        idempotencyKey: 'agent-write-v1:image-tool',
      }),
    );
  });
});
