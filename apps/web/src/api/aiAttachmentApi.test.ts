import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiBasePostMock } = vi.hoisted(() => ({
  apiBasePostMock: vi.fn(),
}));

vi.mock('@/http/request', () => ({
  apiBasePost: apiBasePostMock,
}));

import { attachAiCloudFile } from './aiAttachmentApi';

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
});
