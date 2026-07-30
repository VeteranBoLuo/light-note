import { resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { resolveAiConversationIdentity } from '../util/aiConversationService.js';
import {
  listAiResourcePreferences,
  updateAiResourcePreference,
} from '../util/aiResourcePreferenceService.js';

function sendError(res, error) {
  const status = Number.isInteger(Number(error?.status)) ? Number(error.status) : 500;
  const safeStatus = status >= 400 && status <= 599 ? status : 500;
  const code =
    error?.isAiResourcePreferenceError && /^[A-Z][A-Z0-9_]{1,63}$/.test(String(error.code || ''))
      ? error.code
      : 'AI_RESOURCE_PREFERENCE_FAILED';
  if (safeStatus >= 500) {
    console.error('[ai-resource-preference] request failed code=%s', stableAgentErrorCode(error));
  }
  const raw = String(error?.message || '');
  const message =
    safeStatus >= 500
      ? '资源 AI 设置暂时不可用，请稍后重试'
      : raw.startsWith(`${code}:`)
        ? raw.slice(code.length + 1).trim()
        : raw;
  return res.status(safeStatus).send(resultData({ code }, safeStatus, message));
}

async function run(req, res, callback) {
  try {
    const identity = resolveAiConversationIdentity(req);
    return res.send(resultData(await callback(identity)));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listPreferences(req, res) {
  return run(req, res, (identity) => listAiResourcePreferences(identity, req.body || {}));
}

export async function updatePreference(req, res) {
  return run(req, res, (identity) => updateAiResourcePreference(identity, req.body || {}));
}
