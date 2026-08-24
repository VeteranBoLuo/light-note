import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiBasePost = vi.fn();
vi.mock('@/http/request', () => ({ apiBasePost }));

const { deleteAiConversation, exportAiCloudConversations, getAiConversation, listAiConversations } = await import(
  './aiWorkspaceApi'
);

describe('只读 AI 历史归档 API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('只提供列表、查看、删除和导出，不恢复旧助手执行态', async () => {
    apiBasePost
      .mockResolvedValueOnce({ status: 200, data: { items: [], nextCursor: null } })
      .mockResolvedValueOnce({ status: 200, data: { id: 'conversation-1', messages: [] } })
      .mockResolvedValueOnce({ status: 200, data: { deleted: 1, undoExpiresAt: null } })
      .mockResolvedValueOnce({ status: 200, data: { schemaVersion: 1, conversations: [] } });

    await listAiConversations({ status: 'archived', keyword: '复盘', limit: 20 });
    expect(apiBasePost).toHaveBeenLastCalledWith(
      '/api/chat/conversations/list',
      { status: 'archived', keyword: '复盘', limit: 20 },
      { silent: true },
    );

    await getAiConversation('conversation-1', 50);
    expect(apiBasePost).toHaveBeenLastCalledWith(
      '/api/chat/conversations/get',
      { conversationId: 'conversation-1', messageLimit: 50 },
      { silent: true },
    );

    await deleteAiConversation('conversation-1');
    expect(apiBasePost).toHaveBeenLastCalledWith(
      '/api/chat/conversations/delete',
      { conversationId: 'conversation-1' },
      { silent: true },
    );

    await exportAiCloudConversations();
    expect(apiBasePost).toHaveBeenLastCalledWith('/api/chat/conversations/export', {}, { silent: true });
    expect(JSON.stringify(apiBasePost.mock.calls)).not.toContain('/api/chat/agent');
    expect(JSON.stringify(apiBasePost.mock.calls)).not.toContain('change-sets');
  });

  it('保留服务端稳定错误码，供归档页显示明确失败原因', async () => {
    apiBasePost.mockResolvedValue({ status: 404, data: { code: 'AI_CONVERSATION_NOT_FOUND' } });

    await expect(getAiConversation('missing')).rejects.toMatchObject({
      message: 'AI_CONVERSATION_NOT_FOUND',
      code: 'AI_CONVERSATION_NOT_FOUND',
      status: 404,
    });
  });
});
