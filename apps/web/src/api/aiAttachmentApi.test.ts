import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiBasePostMock } = vi.hoisted(() => ({
  apiBasePostMock: vi.fn(),
}));

vi.mock('@/http/request', () => ({
  apiBasePost: apiBasePostMock,
}));

import { attachAiCloudFile, clearAiTemporaryAttachments } from './aiAttachmentApi';

describe('aiAttachmentApi', () => {
  beforeEach(() => {
    apiBasePostMock.mockReset();
  });

  it('云空间附件错误交给附件组件统一提示，避免请求层重复弹窗', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 400,
      msg: '暂时仅支持 TXT、Markdown、CSV、PDF 和 DOCX',
      data: null,
    });

    await expect(attachAiCloudFile('archive-file')).rejects.toThrow('暂时仅支持 TXT、Markdown、CSV、PDF 和 DOCX');
    expect(apiBasePostMock).toHaveBeenCalledWith(
      '/api/chat/attachments/attachCloudFile',
      { fileId: 'archive-file', sessionId: '' },
      { silent: true },
    );
  });

  it('保留服务端业务错误码，供附件交互按原因处理', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 400,
      msg: '当前正在处理的文件较多，请稍后再试',
      data: { code: 'TOO_MANY_PROCESSING_ATTACHMENTS' },
    });

    await expect(attachAiCloudFile('file-1')).rejects.toMatchObject({
      code: 'TOO_MANY_PROCESSING_ATTACHMENTS',
      status: 400,
    });
  });

  it('新会话可以释放当前账号的临时文件', async () => {
    apiBasePostMock.mockResolvedValue({ status: 200, msg: '', data: { deleted: 3, failed: 0 } });
    await expect(clearAiTemporaryAttachments()).resolves.toEqual({ deleted: 3, failed: 0 });
    expect(apiBasePostMock).toHaveBeenCalledWith('/api/chat/attachments/clearTemporary', {}, { silent: true });
  });
});
