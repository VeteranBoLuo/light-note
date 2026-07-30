export type AiSystemErrorKind = 'quota' | 'timeout' | 'network' | 'permission' | 'content' | 'generic';

export interface AiSystemErrorPresentation {
  kind: AiSystemErrorKind;
  titleKey: string;
  descriptionKey: string;
  retryable: boolean;
  referenceCode: string;
}

function stableCode(value: unknown): string {
  const code = String(value || '').trim();
  // 只展示服务端约定的稳定错误码，避免把 Provider 原始报错、URL 或请求细节
  // 经过字符替换后伪装成“参考码”泄露到历史消息。
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : 'AI_RESPONSE_FAILED';
}

export function resolveAiSystemError(code: unknown): AiSystemErrorPresentation {
  const referenceCode = stableCode(code);
  if (/QUOTA|LIMIT|BALANCE|TOKEN_EXHAUSTED/.test(referenceCode)) {
    return {
      kind: 'quota',
      titleKey: 'ai.systemError.quotaTitle',
      descriptionKey: 'ai.systemError.quotaDescription',
      retryable: false,
      referenceCode,
    };
  }
  if (/TIMEOUT|TERMINAL_MISSING|DEADLINE/.test(referenceCode)) {
    return {
      kind: 'timeout',
      titleKey: 'ai.systemError.timeoutTitle',
      descriptionKey: 'ai.systemError.timeoutDescription',
      retryable: true,
      referenceCode,
    };
  }
  if (/NETWORK|ECONN|GATEWAY|UNAVAILABLE|PROVIDER|STREAM/.test(referenceCode)) {
    return {
      kind: 'network',
      titleKey: 'ai.systemError.networkTitle',
      descriptionKey: 'ai.systemError.networkDescription',
      retryable: true,
      referenceCode,
    };
  }
  if (/PERMISSION|FORBIDDEN|READONLY|UNAUTHORIZED|IDENTITY/.test(referenceCode)) {
    return {
      kind: 'permission',
      titleKey: 'ai.systemError.permissionTitle',
      descriptionKey: 'ai.systemError.permissionDescription',
      retryable: false,
      referenceCode,
    };
  }
  if (/CONTENT|SAFETY|FILTER|POLICY/.test(referenceCode)) {
    return {
      kind: 'content',
      titleKey: 'ai.systemError.contentTitle',
      descriptionKey: 'ai.systemError.contentDescription',
      retryable: false,
      referenceCode,
    };
  }
  return {
    kind: 'generic',
    titleKey: 'ai.systemError.genericTitle',
    descriptionKey: 'ai.systemError.genericDescription',
    retryable: true,
    referenceCode,
  };
}

/**
 * 兼容旧版把 Provider 报错正文当作 assistant content 保存的历史记录。
 * 只识别短小、明显属于请求失败的文本，避免把用户正常讨论“Provider error”
 * 的长回答误判为系统故障。
 */
export function resolveLegacyAiSystemErrorCode(content: unknown): string | null {
  const text = String(content || '').trim();
  if (!text || text.length > 500 || text.includes('\n\n')) return null;
  const failure =
    /^(?:error|request failed|ai request failed|provider error|模型请求失败|ai 请求失败|大模型服务异常)[:：\s]/i.test(
      text,
    ) ||
    /(?:provider|deepseek|dashscope|qwen|模型|大模型).{0,32}(?:error|failed|失败|异常|不可用)/i.test(text) ||
    /(?:error|failed|失败|异常).{0,32}(?:provider|deepseek|dashscope|qwen|模型|大模型)/i.test(text);
  if (!failure) return null;
  if (/429|quota|balance|余额|额度|限额/i.test(text)) return 'AI_QUOTA_EXHAUSTED';
  if (/timeout|timed out|超时|deadline/i.test(text)) return 'AI_RESPONSE_TIMEOUT';
  if (/permission|forbidden|unauthorized|无权|权限/i.test(text)) return 'AI_PERMISSION_DENIED';
  if (/content|safety|filter|policy|内容审核|安全策略/i.test(text)) return 'AI_CONTENT_FILTERED';
  return 'PROVIDER_UNAVAILABLE';
}
