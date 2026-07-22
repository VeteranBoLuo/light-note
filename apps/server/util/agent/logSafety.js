const SECRET_PATTERNS = [
  [/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]'],
  [/\b(?:sk|ds|dashscope|deepseek)[-_][A-Za-z0-9_-]{12,}\b/gi, '[REDACTED_API_KEY]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]'],
  [
    /(["']?\b(?:password|passwd|pwd|secret|token|access[_-]?token|refresh[_-]?token|authorization|cookie|api[_-]?key|verify[_-]?code|otp)\b["']?\s*[:=]\s*["']?)[^\s,;&"']+/gi,
    '$1[REDACTED]',
  ],
  [
    /([?&](?:token|access[_-]?token|refresh[_-]?token|key|api[_-]?key|password|secret|authorization|cookie|email|verify[_-]?code|otp)=)[^&#\s]+/gi,
    '$1[REDACTED]',
  ],
  [
    /((?:https?|redis(?:s)?|mysql|mariadb|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/)[^\s/@:]+:[^\s/@]+@/giu,
    '$1[REDACTED]@',
  ],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]'],
];

export function redactSensitiveText(value, maxLength = 1000) {
  let output = String(value || '');
  for (const [pattern, replacement] of SECRET_PATTERNS) output = output.replace(pattern, replacement);
  return output.slice(0, Math.max(0, Number(maxLength) || 0));
}

export function safeAgentError(error, maxLength = 500) {
  const source = error?.message || error || '';
  return redactSensitiveText(source, maxLength) || 'UNKNOWN_ERROR';
}

export function stableAgentErrorCode(error) {
  const directCode = String(error?.code || '')
    .trim()
    .toUpperCase();
  if (/^[A-Z][A-Z0-9_]{1,63}$/u.test(directCode)) return directCode;
  const message = String(error?.message || error || '').toUpperCase();
  if (/TIMEOUT|DEADLINE/u.test(message)) return 'AI_TIMEOUT';
  if (/ABORT|CANCEL/u.test(message)) return 'AI_ABORTED';
  if (/RATE|QUOTA|429/u.test(message)) return 'AI_RATE_LIMITED';
  if (/AUTH|UNAUTHORIZED|FORBIDDEN|401|403/u.test(message)) return 'AI_PROVIDER_AUTH_FAILED';
  if (/ECONN|NETWORK|SOCKET|FETCH/u.test(message)) return 'AI_NETWORK_ERROR';
  return 'AI_PROVIDER_ERROR';
}
