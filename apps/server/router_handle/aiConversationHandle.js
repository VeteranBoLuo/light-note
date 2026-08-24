import { resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import {
  clearAiIdentityData,
  clearAiConversations,
  deleteAiConversation,
  exportAiConversations,
  getAiConversation,
  listAiConversations,
  resolveAiConversationIdentity,
} from '../util/aiConversationService.js';

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
  if (status >= 500) console.error('[ai-conversation-archive] request failed code=%s', stableAgentErrorCode(error));
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

export async function listConversations(req, res) {
  return run(req, res, (identity) => listAiConversations(identity, req.body || {}));
}

export async function getConversation(req, res) {
  return run(req, res, (identity) =>
    getAiConversation(identity, req.body?.conversationId, { messageLimit: req.body?.messageLimit }),
  );
}

export async function removeConversation(req, res) {
  return run(req, res, (identity) => deleteAiConversation(identity, req.body?.conversationId));
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

export const __testing = { sendError };
