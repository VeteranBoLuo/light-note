import { resultData } from '../util/agent/data.js';
import { recoverAiResponse, resolveAiResponseRecoveryIdentity } from '../util/aiResponseRecoveryService.js';

/**
 * POST /api/chat/agent/recover
 *
 * 只按服务端解析出的 actor + subject + admin context 身份读取，requestId 本身不构成授权。
 */
export async function recoverAgentResponse(req, res) {
  try {
    const identity = resolveAiResponseRecoveryIdentity(req);
    const result = await recoverAiResponse(identity, {
      requestId: req.body?.requestId,
      lastEventId: req.body?.lastEventId,
    });
    return res.send(resultData(result));
  } catch (error) {
    const status = Number(error?.status || 500);
    const code = String(error?.code || 'AI_RESPONSE_RECOVERY_FAILED').slice(0, 64);
    const message =
      status >= 500
        ? '暂时无法恢复 AI 回答，请稍后重试。'
        : String(error?.message || '恢复失败').replace(/^[A-Z0-9_]+:\s*/, '');
    return res.status(status).send(resultData({ code }, status, message));
  }
}
