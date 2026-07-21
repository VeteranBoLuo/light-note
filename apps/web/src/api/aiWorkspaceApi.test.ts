import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiBasePost = vi.fn();
vi.mock('@/http/request', () => ({ apiBasePost }));

const {
  listAiResultReusableBlocks,
  getAiConversationLineage,
  listAiMessageVersions,
  prepareAiMessageVersionGroup,
  prepareAiResultNoteReuse,
  recoverAiAgentResponse,
  revalidateAiChangeSetRetry,
  retryAiChangeSet,
} = await import('./aiWorkspaceApi');

describe('AI workspace recovery API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('提交 requestId、最后事件号和可取消信号，不携带对话正文', async () => {
    const controller = new AbortController();
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { requestId: 'request-1', recovered: true, snapshot: { status: 'completed' } },
    });

    await recoverAiAgentResponse({ requestId: 'request-1', lastEventId: 7 }, { signal: controller.signal });

    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/chat/agent/recover',
      { requestId: 'request-1', lastEventId: 7 },
      { silent: true, signal: controller.signal },
    );
  });

  it('保留 404 过期错误的稳定 code/status，供聊天层维持原错误', async () => {
    apiBasePost.mockResolvedValue({
      status: 404,
      msg: '恢复结果不存在或已过期',
      data: { code: 'AI_RESPONSE_RECOVERY_NOT_FOUND' },
    });

    await expect(recoverAiAgentResponse({ requestId: 'request-expired' })).rejects.toMatchObject({
      message: 'AI_RESPONSE_RECOVERY_NOT_FOUND',
      code: 'AI_RESPONSE_RECOVERY_NOT_FOUND',
      status: 404,
    });
  });

  it('选段接口只提交归属标识与服务端块 ID，不上传回答正文', async () => {
    apiBasePost.mockResolvedValue({ status: 200, data: { items: [], total: 0 } });
    await listAiResultReusableBlocks({ conversationId: 'conversation-1', messageId: 'message-1' });
    expect(apiBasePost).toHaveBeenLastCalledWith(
      '/api/chat/conversations/reuse-note/blocks',
      { conversationId: 'conversation-1', messageId: 'message-1' },
      { silent: true },
    );

    apiBasePost.mockResolvedValue({ status: 200, data: { changeSetId: 'change-1', preview: {} } });
    await prepareAiResultNoteReuse({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      mode: 'selection',
      selectedBlockIds: ['block-0-0123456789abcdef'],
      targetNoteId: 'note-1',
      targetVersion: 'version-1',
    });
    expect(apiBasePost).toHaveBeenLastCalledWith(
      '/api/chat/conversations/reuse-note/prepare',
      {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        mode: 'selection',
        selectedBlockIds: ['block-0-0123456789abcdef'],
        targetNoteId: 'note-1',
        targetVersion: 'version-1',
      },
      { silent: true },
    );
    expect(JSON.stringify(apiBasePost.mock.calls.at(-1))).not.toContain('回答正文');
  });

  it('分支谱系与版本接口只提交会话/消息标识，不上传标题或回答正文', async () => {
    apiBasePost.mockResolvedValue({ status: 200, data: { nodes: [] } });
    await getAiConversationLineage('conversation-1');
    expect(apiBasePost).toHaveBeenLastCalledWith(
      '/api/chat/conversations/lineage',
      { conversationId: 'conversation-1' },
      { silent: true },
    );

    apiBasePost.mockResolvedValue({ status: 200, data: { items: [] } });
    await listAiMessageVersions('conversation-1', 'message-1');
    expect(apiBasePost).toHaveBeenLastCalledWith(
      '/api/chat/conversations/messages/versions',
      { conversationId: 'conversation-1', messageId: 'message-1' },
      { silent: true },
    );

    apiBasePost.mockResolvedValue({ status: 200, data: { versionGroupId: 'message-1' } });
    await prepareAiMessageVersionGroup('conversation-1', 'message-1');
    expect(apiBasePost).toHaveBeenLastCalledWith(
      '/api/chat/conversations/messages/version-group',
      { conversationId: 'conversation-1', messageId: 'message-1' },
      { silent: true },
    );
    expect(JSON.stringify(apiBasePost.mock.calls.slice(-3))).not.toContain('回答正文');
  });

  it('Change Set 重试只提交服务端冻结范围的预览修订号，不由客户端重传项目选择', async () => {
    apiBasePost.mockResolvedValue({ status: 200, data: { id: 'change-1', status: 'draft' } });

    await revalidateAiChangeSetRetry('change-1');
    expect(apiBasePost).toHaveBeenLastCalledWith(
      '/api/chat/change-sets/revalidate-retry',
      { changeSetId: 'change-1' },
      { silent: true },
    );

    await retryAiChangeSet('change-1', 7);
    expect(apiBasePost).toHaveBeenLastCalledWith(
      '/api/chat/change-sets/retry',
      { changeSetId: 'change-1', previewRevision: 7 },
      { silent: true },
    );
    expect(JSON.stringify(apiBasePost.mock.calls.at(-1))).not.toContain('selectedItemIds');
  });
});
