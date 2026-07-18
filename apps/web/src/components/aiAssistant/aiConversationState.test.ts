import { describe, expect, it } from 'vitest';
import {
  addPendingConfirmationId,
  addPendingInteractionId,
  hasPendingConfirmations,
  hasPendingInteractions,
  markConversationConfirmationPending,
  markConversationInteractionPending,
  promoteConversationInteractionToConfirmation,
  settleConversationConfirmation,
  settleConversationInteraction,
  shouldPersistConversationMessage,
  shouldShowAiMessageSources,
} from './aiConversationState';

describe('aiConversationState', () => {
  it('未结算的结构化动作不进入历史，确认成功后整组转为可持久化', () => {
    const messages = [
      { content: '保存到云空间：测试.png', transient: true, transientGroupId: 'action-1' },
      {
        content: '参数已准备好',
        transient: true,
        transientGroupId: 'action-1',
        pendingConfirmationIds: ['confirm-1'],
      },
    ];
    expect(messages.filter(shouldPersistConversationMessage)).toHaveLength(0);

    settleConversationConfirmation(messages, 1, {
      confirmationId: 'confirm-1',
      toolName: 'save_attachment_to_cloud',
      status: 'confirmed',
      summary: '文件已保存',
    });

    expect(messages.filter(shouldPersistConversationMessage)).toHaveLength(2);
    expect(hasPendingConfirmations(messages[1])).toBe(false);
  });

  it.each(['cancelled', 'editing', 'failed', 'expired'] as const)(
    '%s 后恢复非 pending 状态，但瞬态动作仍不写入历史',
    (status) => {
      const messages = [
        {
          content: '参数已准备好',
          transient: true,
          transientGroupId: 'action-1',
          pendingConfirmationIds: ['confirm-1', 'confirm-2'],
        },
      ];
      settleConversationConfirmation(messages, 0, {
        confirmationId: 'confirm-1',
        toolName: 'save_attachment_to_cloud',
        status,
        summary: '操作已结算',
      });
      expect(messages[0].pendingConfirmationIds).toEqual(['confirm-2']);
      expect(messages[0].transient).toBe(true);
      expect(shouldPersistConversationMessage(messages[0])).toBe(false);
    },
  );

  it('追加待确认 ID 时去重且保留其他确认卡', () => {
    expect(addPendingConfirmationId(['confirm-1'], 'confirm-1')).toEqual(['confirm-1']);
    expect(addPendingConfirmationId(['confirm-1'], 'confirm-2')).toEqual(['confirm-1', 'confirm-2']);
  });

  it('自然语言触发的待确认消息同样不写历史，结算后才允许保存', () => {
    const messages = [{ content: '把图片保存为测试.png' }, { content: '即将保存文件' }];
    markConversationConfirmationPending(messages, 0, 1, 'confirm-1', 'agent-action:1');
    expect(messages.filter(shouldPersistConversationMessage)).toHaveLength(0);

    settleConversationConfirmation(messages, 1, {
      confirmationId: 'confirm-1',
      toolName: 'save_attachment_to_cloud',
      status: 'cancelled',
      summary: '已取消操作',
    });
    expect(messages.filter(shouldPersistConversationMessage)).toHaveLength(2);
    expect(messages[1].content).toBe('即将保存文件\n\n已取消操作');
  });

  it('同轮多个确认全部结算后才持久化，任一成功即可保留整轮', () => {
    const messages = [{ content: '执行两个操作' }, { content: '请确认' }];
    markConversationConfirmationPending(messages, 0, 1, 'confirm-1', 'agent-action:2');
    markConversationConfirmationPending(messages, 0, 1, 'confirm-2', 'agent-action:2');

    settleConversationConfirmation(messages, 1, {
      confirmationId: 'confirm-1',
      toolName: 'create_image_note',
      status: 'confirmed',
      summary: '笔记已创建',
    });
    expect(messages.filter(shouldPersistConversationMessage)).toHaveLength(0);

    settleConversationConfirmation(messages, 1, {
      confirmationId: 'confirm-2',
      toolName: 'save_attachment_to_cloud',
      status: 'cancelled',
      summary: '文件保存已取消',
    });
    expect(messages.filter(shouldPersistConversationMessage)).toHaveLength(2);
  });

  it('选择卡晋级确认卡时保持同一瞬态组，最终确认成功后才持久化', () => {
    const messages = [{ content: '保存到项目资料' }, { content: '请选择文件夹处理方式' }];
    markConversationInteractionPending(messages, 0, 1, 'interaction-1', 'agent-action:3');
    expect(hasPendingInteractions(messages[1])).toBe(true);
    expect(messages.filter(shouldPersistConversationMessage)).toHaveLength(0);

    promoteConversationInteractionToConfirmation(messages, 1, 'interaction-1', 'confirmation-1');
    settleConversationInteraction(messages, 1, {
      interactionId: 'interaction-1',
      status: 'advanced',
      summary: '已生成确认',
    });
    expect(hasPendingInteractions(messages[1])).toBe(false);
    expect(hasPendingConfirmations(messages[1])).toBe(true);
    expect(messages.filter(shouldPersistConversationMessage)).toHaveLength(0);

    settleConversationConfirmation(messages, 1, {
      confirmationId: 'confirmation-1',
      toolName: 'save_attachment_to_cloud',
      status: 'confirmed',
      summary: '保存成功',
    });
    expect(messages.filter(shouldPersistConversationMessage)).toHaveLength(2);
  });

  it('结构化快捷动作取消选择后仍保持瞬态，自然语言选择取消后可保留上下文', () => {
    const direct = [
      { content: '保存附件', transient: true, transientGroupId: 'direct-1' },
      {
        content: '请选择',
        transient: true,
        transientGroupId: 'direct-1',
        pendingInteractionIds: ['interaction-1'],
      },
    ];
    settleConversationInteraction(direct, 1, {
      interactionId: 'interaction-1',
      status: 'cancelled',
      summary: '已取消选择',
    });
    expect(direct.filter(shouldPersistConversationMessage)).toHaveLength(0);

    const natural = [{ content: '把它保存到缺失文件夹' }, { content: '请选择' }];
    markConversationInteractionPending(natural, 0, 1, 'interaction-2', 'agent-action:4');
    settleConversationInteraction(natural, 1, {
      interactionId: 'interaction-2',
      status: 'cancelled',
      summary: '已取消选择',
    });
    expect(natural.filter(shouldPersistConversationMessage)).toHaveLength(2);
  });

  it('追加待选择 ID 时去重', () => {
    expect(addPendingInteractionId(['interaction-1'], 'interaction-1')).toEqual(['interaction-1']);
    expect(addPendingInteractionId(['interaction-1'], 'interaction-2')).toEqual(['interaction-1', 'interaction-2']);
  });

  it('当前回答流式完成前隐藏来源，完成后再展示', () => {
    const message = { role: 'assistant', sources: [{ id: 'note-1' }] };
    expect(shouldShowAiMessageSources(message, 1, 2, true)).toBe(false);
    expect(shouldShowAiMessageSources(message, 1, 2, false)).toBe(true);
  });

  it('最新回答流式输出时仍保留历史来源展示', () => {
    const historicalMessage = { role: 'assistant', sources: [{ id: 'note-1' }] };
    expect(shouldShowAiMessageSources(historicalMessage, 0, 2, true)).toBe(true);
    expect(shouldShowAiMessageSources({ role: 'assistant' }, 1, 2, false)).toBe(false);
  });
});
