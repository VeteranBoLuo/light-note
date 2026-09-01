import { stableAgentErrorCode } from '../agent/logSafety.js';

const PUBLIC_AI_EXECUTION_ERRORS = Object.freeze({
  AI_QUOTA_EXCEEDED: { status: 429, message: '今日 AI 额度已用完' },
  AI_ACCESS_RESTRICTED: { status: 403, message: '当前账号的 AI 使用权限已被限制' },
  AI_FIRST_TOKEN_TIMEOUT: { status: 504, message: 'AI 首次响应超时，请稍后重试' },
  AI_STREAM_IDLE_TIMEOUT: { status: 504, message: 'AI 生成中断，请重新生成' },
  AI_GATEWAY_TIMEOUT: { status: 504, message: 'AI 请求超时，请稍后重试' },
  AI_TIMEOUT: { status: 504, message: 'AI 请求超时，本次未生成内容，请重新尝试' },
  AI_RATE_LIMITED: { status: 503, message: 'AI 服务当前繁忙，本次未生成内容，请稍后重试' },
  AI_NETWORK_ERROR: { status: 503, message: 'AI 服务连接失败，本次未生成内容，请稍后重试' },
  AI_PROVIDER_AUTH_FAILED: { status: 503, message: 'AI 服务配置异常，暂时无法生成内容' },
  AI_PROVIDER_REQUEST_INVALID: { status: 502, message: 'AI 服务暂时无法处理本次材料，请稍后重试' },
  AI_PROVIDER_ERROR: { status: 503, message: 'AI 服务暂时不可用，本次未生成内容，请稍后重试' },
  AI_SKILL_OUTPUT_EMPTY: { status: 502, message: 'AI 没有生成可用内容，请重新生成' },
  AI_SKILL_OUTPUT_TOO_LONG: { status: 502, message: '生成内容超过单次处理上限，请减少材料后重试' },
  AI_SKILL_OUTPUT_TOO_SHORT: {
    status: 502,
    message: '生成内容未达到要求，自动重试后仍失败，请减少材料或调整篇幅后重试',
  },
  AI_SKILL_OUTPUT_SOURCE_INVALID: { status: 502, message: '生成结果的来源引用校验未通过，请重新生成' },
  AI_SKILL_OUTPUT_SOURCE_REQUIRED: { status: 502, message: '生成结果缺少必要来源，请重新生成' },
  AI_SKILL_OUTPUT_COVERAGE_OVERCLAIM: {
    status: 502,
    message: '生成结果超出了本次可读取材料范围，自动修复后仍未通过，请重新生成',
  },
  AI_SKILL_OUTPUT_PROFILE_INVALID: {
    status: 502,
    message: '生成结果未满足当前工具的固定结构，自动修复后仍未通过',
  },
  AI_SKILL_STRUCTURED_OUTPUT_MISSING: { status: 502, message: 'AI 没有返回可用草稿，请重新生成' },
  AI_SKILL_STRUCTURED_OUTPUT_INVALID: { status: 502, message: 'AI 返回的草稿格式未通过校验，请重新生成' },
  UNSUPPORTED_FILE_TYPE: { status: 400, message: '该文件格式暂不支持 AI 解析' },
  FILE_TOO_LARGE: { status: 400, message: '文件超过 20MB，暂时无法用于 AI 分析' },
  FILE_TYPE_MISMATCH: { status: 400, message: '文件扩展名与实际类型不一致，无法安全解析' },
  FILE_NOT_AVAILABLE: { status: 409, message: '文件尚未完成上传或已不可用，暂时无法解析' },
});

/**
 * 所有 HTTP 入口共用的 AI Execution 错误边界。
 * 已登记的用户错误保留稳定状态码；未知服务端错误只返回调用方提供的安全文案。
 */
export function resolvePublicAiExecutionError(error, fallbackMessage = 'AI 能力暂时不可用，请稍后重试') {
  const directCode = String(error?.code || '')
    .trim()
    .toUpperCase();
  const code = directCode || stableAgentErrorCode(error) || 'AI_EXECUTION_FAILED';
  // 只有经过业务层或 Gateway 明确分类的错误才能命中公开文案。
  // 未分类的数据库、程序异常即使可被日志分类器兜底为 AI_PROVIDER_ERROR，
  // 也必须继续使用调用方提供的安全文案，避免把内部故障误报成模型故障。
  const known = directCode ? PUBLIC_AI_EXECUTION_ERRORS[code] : null;
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
