import { beforeEach, describe, expect, it, vi } from 'vitest';

const prepareSaveAttachmentToCloud = vi.fn();
const saveAttachmentToCloud = vi.fn();

vi.mock('../../services/attachmentActionService.js', () => ({
  prepareSaveAttachmentToCloud,
  saveAttachmentToCloud,
}));

const { default: tool, normalizeSaveAttachmentArgs } = await import('./save_attachment_to_cloud.js');

describe('save_attachment_to_cloud 工具', () => {
  beforeEach(() => vi.clearAllMocks());

  it('支持文件名与文件夹别名，并由服务端预处理成确认参数', async () => {
    prepareSaveAttachmentToCloud.mockResolvedValue({
      attachmentId: 'attachment-1',
      fileName: '测试.png',
      folderId: '7',
      folderName: '图片资料',
      sourceFileName: 'avatar.png',
      fileType: 'image/png',
      fileSize: 2048,
      alreadySaved: false,
    });

    const normalized = normalizeSaveAttachmentArgs({
      source_id: 'attachment-1',
      name: '测试',
      directory_id: 7,
      directory_name: '旧名称',
    });
    expect(normalized).toEqual({
      attachmentId: 'attachment-1',
      fileName: '测试',
      folderId: '7',
      folderName: '旧名称',
      folderStrategy: 'existing',
    });

    const prepared = await tool.prepareArgs(normalized, { userId: 'user-1' });
    expect(prepareSaveAttachmentToCloud).toHaveBeenCalledWith({ userId: 'user-1', ...normalized });
    expect(prepared.fileName).toBe('测试.png');
    expect(tool.directAction).toBe(true);
    expect(tool.preview(prepared)).toMatchObject({
      target: '图片资料 / 测试.png',
      details: expect.arrayContaining([
        { key: 'originalFileName', value: 'avatar.png' },
        { key: 'fileName', value: '测试.png' },
        { key: 'folder', value: '图片资料' },
      ]),
    });
  });
});
