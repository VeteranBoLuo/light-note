import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiBasePostMock } = vi.hoisted(() => ({
  apiBasePostMock: vi.fn(),
}));

vi.mock('@/http/request', () => ({
  apiBasePost: apiBasePostMock,
}));

import {
  AI_AGENT_CLIENT_CAPABILITIES,
  attachAiCloudFile,
  clearAiTemporaryAttachments,
  fetchAiCloudFolders,
  prepareAiAttachmentAction,
  respondAiInteraction,
} from './aiAttachmentApi';

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

  it('读取当前账号文件夹并标准化为字符串 ID', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 200,
      data: {
        items: [
          { id: 12, name: '项目资料' },
          { id: null, name: '无效项' },
        ],
      },
    });
    await expect(fetchAiCloudFolders()).resolves.toEqual([{ id: '12', name: '项目资料' }]);
    expect(apiBasePostMock).toHaveBeenCalledWith('/api/file/queryFolder', { filters: {} }, { silent: true });
  });

  it('附件直接动作使用结构化参数准备确认，不拼接固定提示词', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 200,
      data: { sessionId: 'session-1', confirmation: { id: 'confirm-1' } },
    });
    await prepareAiAttachmentAction({
      sessionId: 'session-1',
      toolName: 'save_attachment_to_cloud',
      args: { attachmentId: 'attachment-1', fileName: '测试.png', folderId: '12' },
    });
    expect(apiBasePostMock).toHaveBeenCalledWith(
      '/api/chat/agent/actions/prepare',
      {
        sessionId: 'session-1',
        toolName: 'save_attachment_to_cloud',
        args: { attachmentId: 'attachment-1', fileName: '测试.png', folderId: '12' },
        clientCapabilities: [...AI_AGENT_CLIENT_CAPABILITIES],
      },
      { silent: true },
    );
  });

  it('回答交互卡时发送冻结后的结构化选择和协议能力', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 200,
      data: { state: 'cancelled' },
    });
    await respondAiInteraction({
      interaction: {
        token: 'token-1',
        id: 'interaction-1',
        sessionId: 'session-1',
        type: 'single_choice',
        purpose: 'choice_confirmation',
        title: '请选择',
        options: [{ id: 'root', label: '根目录' }],
        minSelections: 1,
        maxSelections: 1,
        expiresIn: 300,
      },
      response: { selectedIds: [], customValue: '', cancelled: true },
    });
    expect(apiBasePostMock).toHaveBeenCalledWith(
      '/api/chat/agent/interactions/respond',
      {
        interactionToken: 'token-1',
        sessionId: 'session-1',
        selectedIds: [],
        customValue: '',
        cancelled: true,
        clientCapabilities: [...AI_AGENT_CLIENT_CAPABILITIES],
      },
      { silent: true },
    );
  });
});
