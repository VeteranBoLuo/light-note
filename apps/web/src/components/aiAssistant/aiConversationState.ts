import type {
  AiAgentInteraction,
  AiAgentInteractionSettlement,
  AiToolConfirmation,
  AiToolConfirmationReplacement,
  AiToolConfirmationSettlement,
  AiToolConfirmationSettlementStatus,
} from '@/types/aiAgent';

export interface AiConversationActionSettlement {
  confirmationId: string;
  toolName: string;
  status: AiToolConfirmationSettlementStatus;
  summary: string;
  settledAt: string;
}

export interface AiConversationStateMessage {
  role?: string;
  content?: string;
  sources?: unknown[];
  confirmations?: AiToolConfirmation[];
  interactions?: AiAgentInteraction[];
  transient?: boolean;
  transientGroupId?: string;
  pendingConfirmationIds?: string[];
  pendingInteractionIds?: string[];
  confirmationSucceeded?: boolean;
  persistAfterConfirmationSettlement?: boolean;
  actionSettlements?: AiConversationActionSettlement[];
}

/**
 * 当前回答流式输出时先收集来源但不渲染，避免来源卡片中途插入导致正文跳动。
 * 历史消息的来源不受影响；停止、失败或正常完成后 isLoading 会复位，来源随即展示。
 */
export function shouldShowAiMessageSources(
  message: AiConversationStateMessage,
  messageIndex: number,
  messageCount: number,
  isLoading: boolean,
) {
  if (!message.sources?.length) return false;
  const isCurrentStreamingAnswer = isLoading && message.role === 'assistant' && messageIndex === messageCount - 1;
  return !isCurrentStreamingAnswer;
}

export function addPendingConfirmationId(current: string[] | undefined, confirmationId: string) {
  const id = String(confirmationId || '').trim();
  if (!id) return current || [];
  return [...new Set([...(current || []), id])];
}

export function hasPendingConfirmations(message?: AiConversationStateMessage | null) {
  return Boolean(message?.pendingConfirmationIds?.length);
}

export function addPendingInteractionId(current: string[] | undefined, interactionId: string) {
  const id = String(interactionId || '').trim();
  if (!id) return current || [];
  return [...new Set([...(current || []), id])];
}

export function hasPendingInteractions(message?: AiConversationStateMessage | null) {
  return Boolean(message?.pendingInteractionIds?.length);
}

export function hasPendingAgentActions(message?: AiConversationStateMessage | null) {
  return hasPendingConfirmations(message) || hasPendingInteractions(message);
}

export function shouldPersistConversationMessage(message: AiConversationStateMessage) {
  return Boolean(message.content && !message.transient && !hasPendingAgentActions(message));
}

function markConversationActionPending<T extends AiConversationStateMessage>(
  messages: T[],
  userMessageIndex: number,
  assistantMessageIndex: number,
  groupId: string,
) {
  const userMessage = messages[userMessageIndex];
  const assistantMessage = messages[assistantMessageIndex];
  if (!userMessage || !assistantMessage) return null;
  const resolvedGroupId = assistantMessage.transientGroupId || groupId;
  userMessage.transient = true;
  userMessage.transientGroupId = resolvedGroupId;
  assistantMessage.transient = true;
  assistantMessage.transientGroupId = resolvedGroupId;
  assistantMessage.persistAfterConfirmationSettlement = true;
  return assistantMessage;
}

/**
 * 自然语言可能在一次 Agent 回复里产生一个或多个写操作确认。
 * 确认未全部结算前把本轮 user + assistant 作为同一个瞬态组，避免刷新后只留下用户提问。
 */
export function markConversationConfirmationPending<T extends AiConversationStateMessage>(
  messages: T[],
  userMessageIndex: number,
  assistantMessageIndex: number,
  confirmationId: string,
  groupId: string,
) {
  const assistantMessage = markConversationActionPending(messages, userMessageIndex, assistantMessageIndex, groupId);
  if (!assistantMessage) return;
  assistantMessage.pendingConfirmationIds = addPendingConfirmationId(
    assistantMessage.pendingConfirmationIds,
    confirmationId,
  );
}

export function markConversationInteractionPending<T extends AiConversationStateMessage>(
  messages: T[],
  userMessageIndex: number,
  assistantMessageIndex: number,
  interactionId: string,
  groupId: string,
) {
  const assistantMessage = markConversationActionPending(messages, userMessageIndex, assistantMessageIndex, groupId);
  if (!assistantMessage) return;
  assistantMessage.pendingInteractionIds = addPendingInteractionId(
    assistantMessage.pendingInteractionIds,
    interactionId,
  );
}

/** 将一个待选择交互原子迁移为待确认写操作，迁移期间整组仍保持瞬态。 */
export function promoteConversationInteractionToConfirmation<T extends AiConversationStateMessage>(
  messages: T[],
  messageIndex: number,
  interactionId: string,
  confirmationId: string,
) {
  const target = messages[messageIndex];
  if (!target) return;
  target.pendingInteractionIds = (target.pendingInteractionIds || []).filter((id) => id !== interactionId);
  target.pendingConfirmationIds = addPendingConfirmationId(target.pendingConfirmationIds, confirmationId);
}

/**
 * 原子替换一张仍待确认的写操作卡。目录等安全参数变化后，服务端会签发新令牌并废弃旧令牌；
 * 会话层同步替换卡片与 pending ID，但不把旧卡记为“取消”，因此整轮始终保持待确认状态。
 */
export function replaceConversationConfirmation<T extends AiConversationStateMessage>(
  messages: T[],
  messageIndex: number,
  replacement: AiToolConfirmationReplacement,
) {
  const target = messages[messageIndex];
  const previousId = String(replacement.previousConfirmationId || '').trim();
  const nextConfirmation = replacement.confirmation;
  const nextId = String(nextConfirmation?.id || '').trim();
  if (!target || !previousId || !nextId) return false;
  if (!(target.confirmations || []).some((confirmation) => confirmation.id === previousId)) return false;

  target.confirmations = (target.confirmations || [])
    .map((confirmation) => (confirmation.id === previousId ? nextConfirmation : confirmation))
    .filter(
      (confirmation, confirmationIndex, all) =>
        all.findIndex((item) => item.id === confirmation.id) === confirmationIndex,
    );
  target.pendingConfirmationIds = [...new Set(
    (target.pendingConfirmationIds || [])
      .map((id) => (id === previousId ? nextId : id))
      .filter(Boolean),
  )];
  return true;
}

function releaseConversationGroupIfSettled<T extends AiConversationStateMessage>(messages: T[], target: T) {
  if (hasPendingAgentActions(target) || !target.transientGroupId) return;
  if (!target.confirmationSucceeded && !target.persistAfterConfirmationSettlement) return;
  const groupId = target.transientGroupId;
  messages.forEach((message) => {
    if (message.transientGroupId === groupId) message.transient = false;
  });
}

/**
 * 会话层在结算时同时移除 pending ID 与对应确认卡，避免刷新后恢复已经失效的令牌。
 * 自然语言触发的动作会把安全终态回执写入历史；结构化快捷动作仍只有确认成功后才释放整组瞬态消息。
 */
export function settleConversationConfirmation<T extends AiConversationStateMessage>(
  messages: T[],
  messageIndex: number,
  settlement: AiToolConfirmationSettlement,
) {
  const target = messages[messageIndex];
  if (!target) return;
  target.pendingConfirmationIds = (target.pendingConfirmationIds || []).filter(
    (id) => id !== settlement.confirmationId,
  );
  target.confirmations = (target.confirmations || []).filter(
    (confirmation) => confirmation.id !== settlement.confirmationId,
  );
  target.actionSettlements = [
    ...(target.actionSettlements || []).filter((item) => item.confirmationId !== settlement.confirmationId),
    {
      confirmationId: settlement.confirmationId,
      toolName: settlement.toolName,
      status: settlement.status,
      summary: settlement.summary,
      settledAt: new Date().toISOString(),
    },
  ];
  if (settlement.status === 'confirmed') target.confirmationSucceeded = true;

  if (
    settlement.status !== 'confirmed' &&
    settlement.summary &&
    !String(target.content || '').endsWith(settlement.summary)
  ) {
    target.content = `${target.content || ''}${target.content ? '\n\n' : ''}${settlement.summary}`;
  }

  releaseConversationGroupIfSettled(messages, target);
}

export function settleConversationInteraction<T extends AiConversationStateMessage>(
  messages: T[],
  messageIndex: number,
  settlement: AiAgentInteractionSettlement,
) {
  const target = messages[messageIndex];
  if (!target) return;
  target.pendingInteractionIds = (target.pendingInteractionIds || []).filter((id) => id !== settlement.interactionId);
  target.interactions = (target.interactions || []).filter((interaction) => interaction.id !== settlement.interactionId);
  if (
    !['advanced', 'resolved'].includes(settlement.status) &&
    settlement.summary &&
    !String(target.content || '').endsWith(settlement.summary)
  ) {
    target.content = `${target.content || ''}${target.content ? '\n\n' : ''}${settlement.summary}`;
  }
  releaseConversationGroupIfSettled(messages, target);
}
