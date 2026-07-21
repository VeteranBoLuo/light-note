import { resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { resolveAiConversationIdentity } from '../util/aiConversationService.js';
import {
  applyAiChangeSet,
  createAiChangeSet,
  getAiChangeSet,
  listAiChangeSets,
  revalidateAiChangeSetRetry,
  retryAiChangeSet,
  undoAiChangeSet,
  updateAiChangeSet,
} from '../util/aiChangeSetService.js';

function sendError(res, error) {
  const status = Number(error?.status || 500);
  const rawCode = String(error?.code || 'AI_CHANGE_SET_FAILED');
  const code =
    /^[A-Z][A-Z0-9_]{1,63}$/.test(rawCode) && (status < 500 || error?.isAiChangeError === true)
      ? rawCode
      : 'AI_CHANGE_SET_FAILED';
  const raw = String(error?.message || 'AI 变更服务暂时不可用');
  const message = raw.startsWith(`${rawCode}:`) ? raw.slice(rawCode.length + 1).trim() : raw;
  if (status >= 500) console.error('[ai-change-set] request failed code=%s', stableAgentErrorCode(error));
  return res
    .status(status)
    .send(resultData({ code }, status, status >= 500 ? 'AI 变更服务暂时不可用，请稍后重试' : message));
}

async function run(req, res, callback, { requireMaintain = false } = {}) {
  try {
    const identity = resolveAiConversationIdentity(req);
    if (requireMaintain && req.adminContext && req.adminContext.mode !== 'maintain') {
      const error = new Error('ADMIN_PREVIEW_READONLY: 只读预览模式不能执行知识库变更');
      error.code = 'ADMIN_PREVIEW_READONLY';
      error.status = 403;
      throw error;
    }
    return res.send(resultData(await callback(identity)));
  } catch (error) {
    return sendError(res, error);
  }
}

export const createChangeSet = (req, res) => run(req, res, (identity) => createAiChangeSet(identity, req.body || {}));

export const listChangeSets = (req, res) => run(req, res, (identity) => listAiChangeSets(identity, req.body || {}));

export const getChangeSet = (req, res) => run(req, res, (identity) => getAiChangeSet(identity, req.body?.changeSetId));

export const updateChangeSet = (req, res) =>
  run(req, res, (identity) => updateAiChangeSet(identity, req.body?.changeSetId, req.body?.patch || {}));

export const applyChangeSet = (req, res) =>
  run(req, res, (identity) => applyAiChangeSet(identity, req.body?.changeSetId, req.body?.selectedItemIds ?? null), {
    requireMaintain: true,
  });

export const revalidateChangeSetRetry = (req, res) =>
  run(req, res, (identity) => revalidateAiChangeSetRetry(identity, req.body?.changeSetId), {
    requireMaintain: true,
  });

export const retryChangeSet = (req, res) =>
  run(req, res, (identity) => retryAiChangeSet(identity, req.body?.changeSetId, req.body?.previewRevision), {
    requireMaintain: true,
  });

export const undoChangeSet = (req, res) =>
  run(req, res, (identity) => undoAiChangeSet(identity, req.body?.changeSetId), { requireMaintain: true });
