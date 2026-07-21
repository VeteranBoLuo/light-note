import { resultData } from '../util/common.js';
import { resolveAiConversationIdentity } from '../util/aiConversationService.js';
import { recordAiProductEvent } from '../util/aiProductTelemetry.js';

export async function recordAiEvent(req, res) {
  try {
    const identity = resolveAiConversationIdentity(req);
    const result = await recordAiProductEvent(identity, req.body || {});
    return res.send(resultData(result));
  } catch (error) {
    const status = Number(error?.status || 500);
    const code = String(error?.code || 'AI_EVENT_FAILED');
    const raw = String(error?.message || 'AI 产品事件记录失败');
    const message = raw.startsWith(`${code}:`) ? raw.slice(code.length + 1).trim() : raw;
    if (status >= 500) console.error('[ai-telemetry] 记录失败:', code);
    return res.status(status).send(resultData({ code }, status, status >= 500 ? 'AI 产品事件记录失败' : message));
  }
}
