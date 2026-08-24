import { resultData } from '../util/common.js';
import { resolveAiIdentity } from '../util/aiIdentity.js';
import { recordAiProductEvent } from '../util/aiProductTelemetry.js';

export async function recordAiEvent(req, res) {
  try {
    // AI 产品事件按登录 owner 隔离。游客客户端可能是旧版或在会话失效前已排队，
    // 服务端应幂等忽略，不把无正文遥测变成持续 401 业务错误。
    if (!req.user?.id || req.user.role === 'visitor') {
      return res.send(resultData({ accepted: false, reason: 'authentication_required' }));
    }
    const identity = resolveAiIdentity(req);
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
