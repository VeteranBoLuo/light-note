import { reqLang, resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { createNote } from '../util/services/noteService.js';
import {
  assertAiCloudHistoryEnabled,
  branchAiConversation,
  clearAiIdentityData,
  clearAiConversations,
  createAiConversation,
  deleteAiConversation,
  exportAiConversations,
  getAiConversation,
  getAiConversationLineage,
  getOwnedAiMessage,
  listAiConversations,
  listAiMessageVersions,
  prepareAiMessageVersionGroup,
  recoverAiConversationFromLocal,
  resolveAiConversationIdentity,
  restoreDeletedAiConversation,
  saveAiFeedback,
  saveAiMessage,
  updateAiConversation,
} from '../util/aiConversationService.js';
import {
  buildReferencedNoteContent,
  listAiResultReusableBlocks,
  listAiResultNoteTargets,
  prepareAiResultNoteReuse,
  safeSourceHref,
} from '../util/aiResultReuseService.js';

function sendError(res, error) {
  const submittedStatus = Number(error?.status || 500);
  const status =
    Number.isInteger(submittedStatus) && submittedStatus >= 400 && submittedStatus <= 599 ? submittedStatus : 500;
  const submittedCode = String(error?.code || '')
    .trim()
    .toUpperCase();
  const hasValidCode = /^[A-Z][A-Z0-9_]{1,63}$/u.test(submittedCode);
  const code =
    hasValidCode && (status < 500 || error?.isAiConversationError === true) ? submittedCode : 'AI_CONVERSATION_FAILED';
  const raw = String(error?.message || 'AI 会话服务暂时不可用');
  const message = raw.startsWith(`${code}:`) ? raw.slice(code.length + 1).trim() : raw;
  if (status >= 500) console.error('[ai-conversation] request failed code=%s', stableAgentErrorCode(error));
  return res
    .status(status)
    .send(resultData({ code }, status, status >= 500 ? 'AI 会话服务暂时不可用，请稍后重试' : message));
}

async function run(req, res, callback) {
  try {
    const identity = resolveAiConversationIdentity(req);
    return res.send(resultData(await callback(identity)));
  } catch (error) {
    return sendError(res, error);
  }
}

function resultNoteIdempotencyKey(identity, message) {
  return `ai-result:${identity.subjectUserId}:${message.requestId || message.id}`;
}

export async function createConversation(req, res) {
  return run(req, res, async (identity) => {
    await assertAiCloudHistoryEnabled(identity);
    return createAiConversation(identity, req.body || {});
  });
}

export async function recoverLocalConversation(req, res) {
  return run(req, res, async (identity) => {
    await assertAiCloudHistoryEnabled(identity);
    return recoverAiConversationFromLocal(identity, req.body || {});
  });
}

export async function listConversations(req, res) {
  return run(req, res, (identity) => listAiConversations(identity, req.body || {}));
}

export async function getConversation(req, res) {
  return run(req, res, (identity) =>
    getAiConversation(identity, req.body?.conversationId, { messageLimit: req.body?.messageLimit }),
  );
}

export async function getConversationLineage(req, res) {
  return run(req, res, (identity) => getAiConversationLineage(identity, req.body?.conversationId));
}

export async function listMessageVersions(req, res) {
  return run(req, res, (identity) => listAiMessageVersions(identity, req.body?.conversationId, req.body?.messageId));
}

export async function prepareMessageVersionGroup(req, res) {
  return run(req, res, (identity) =>
    prepareAiMessageVersionGroup(identity, req.body?.conversationId, req.body?.messageId),
  );
}

export async function updateConversation(req, res) {
  return run(req, res, (identity) =>
    updateAiConversation(identity, req.body?.conversationId, req.body?.patch || req.body || {}),
  );
}

export async function removeConversation(req, res) {
  return run(req, res, (identity) => deleteAiConversation(identity, req.body?.conversationId));
}

export async function restoreConversation(req, res) {
  return run(req, res, (identity) => restoreDeletedAiConversation(identity, req.body?.conversationId));
}

export async function clearConversations(req, res) {
  return run(req, res, (identity) => clearAiConversations(identity));
}

export async function clearAllAiData(req, res) {
  return run(req, res, (identity) => clearAiIdentityData(identity));
}

export async function exportConversations(req, res) {
  return run(req, res, (identity) => exportAiConversations(identity));
}

export async function saveMessage(req, res) {
  return run(req, res, async (identity) => {
    await assertAiCloudHistoryEnabled(identity);
    return saveAiMessage(identity, req.body?.conversationId, req.body?.message || {});
  });
}

export async function branchConversation(req, res) {
  return run(req, res, (identity) =>
    branchAiConversation(identity, req.body?.conversationId, {
      throughMessageId: req.body?.throughMessageId,
      title: req.body?.title,
    }),
  );
}

export async function submitFeedback(req, res) {
  return run(req, res, (identity) => saveAiFeedback(identity, req.body || {}));
}

export async function listResultNoteTargets(req, res) {
  return run(req, res, (identity) => listAiResultNoteTargets(identity, req.body || {}));
}

export async function listMessageReusableBlocks(req, res) {
  return run(req, res, (identity) => listAiResultReusableBlocks(identity, req.body || {}));
}

export async function prepareMessageNoteReuse(req, res) {
  return run(req, res, (identity) => prepareAiResultNoteReuse(identity, { ...(req.body || {}), locale: reqLang(req) }));
}

export async function saveMessageAsNote(req, res) {
  return run(req, res, async (identity) => {
    if (req.adminContext && req.adminContext.mode !== 'maintain') {
      const error = new Error('ADMIN_PREVIEW_READONLY: 只读预览模式不能创建笔记');
      error.code = 'ADMIN_PREVIEW_READONLY';
      error.status = 403;
      throw error;
    }
    const message = await getOwnedAiMessage(identity, req.body?.conversationId, req.body?.messageId);
    if (message.role !== 'assistant' || message.status !== 'completed') {
      const error = new Error('MESSAGE_NOT_SAVABLE: 只能保存已经完成的助手回答');
      error.code = 'MESSAGE_NOT_SAVABLE';
      error.status = 400;
      throw error;
    }
    const conversation = await getAiConversation(identity, req.body?.conversationId, { messageLimit: 0 });
    const locale = reqLang(req);
    const note = await createNote({
      userId: identity.subjectUserId,
      userRole: identity.subjectRole,
      note: {
        title: String(
          req.body?.title || conversation.title || (locale === 'en-US' ? 'AI research note' : 'AI 研究笔记'),
        )
          .trim()
          .slice(0, 255),
        type: 'markdown',
        content: buildReferencedNoteContent(message, { locale }),
      },
      addToInbox: Boolean(req.body?.addToInbox),
      inboxSource: 'ai_result',
      request: req,
      suppressUserRewards: Boolean(req.suppressUserRewards || req.adminContext),
      // 固定笔记 ID 的幂等键必须包含资源 owner；不同用户的模型 requestId 可能相同，不能共享主键命名空间。
      idempotencyKey: resultNoteIdempotencyKey(identity, message),
    });
    return {
      note,
      sourceMessageId: message.id,
      sourceCount: message.sources.length,
      evidenceCount: message.evidence.length,
      receipt: {
        action: 'create_note',
        target: { resourceType: 'note', resourceId: note.id, title: note.title },
        sourceMessageId: message.id,
        sourceCount: message.sources.length,
        evidenceCount: message.evidence.length,
        appliedAt: new Date().toISOString(),
        undo: {
          supported: false,
          reasonCode: 'CREATED_NOTE_REQUIRES_MANUAL_TRASH',
        },
      },
    };
  });
}

export const __testing = { buildReferencedNoteContent, resultNoteIdempotencyKey, safeSourceHref, sendError };
