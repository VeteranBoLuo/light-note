import { stableAgentErrorCode } from '../agent/logSafety.js';

const PUBLIC_AI_EXECUTION_ERRORS = Object.freeze({
  AI_QUOTA_EXCEEDED: { status: 429, message: '今日 AI 额度已用完' },
  AI_ACCESS_RESTRICTED: { status: 403, message: '当前账号的 AI 使用权限已被限制' },
});

/**
 * 所有 HTTP 入口共用的 AI Execution 错误边界。
 * 已登记的用户错误保留稳定状态码；未知服务端错误只返回调用方提供的安全文案。
 */
export function resolvePublicAiExecutionError(error, fallbackMessage = 'AI 能力暂时不可用，请稍后重试') {
  const code = String(error?.code || stableAgentErrorCode(error) || 'AI_EXECUTION_FAILED');
  const known = PUBLIC_AI_EXECUTION_ERRORS[code];
  if (known) return Object.freeze({ code, ...known });
  const candidateStatus = Number(error?.status || 0);
  if (candidateStatus >= 400 && candidateStatus < 500) {
    return Object.freeze({
      code,
      status: candidateStatus,
      message: String(error?.message || fallbackMessage),
    });
  }
  return Object.freeze({ code, status: 500, message: fallbackMessage });
}

export const aiExecutionPublicErrorInternals = Object.freeze({ PUBLIC_AI_EXECUTION_ERRORS });
