type ErrorLike = { code?: unknown; status?: unknown } | null | undefined;

const EXACT_ERROR_KEYS: Readonly<Record<string, string>> = Object.freeze({
  AI_SKILL_SCOPE_STALE: 'toolbox.error.sourceChanged',
  TOOLBOX_RESOURCE_STALE: 'toolbox.error.sourceChanged',
  TOOLBOX_RESOURCE_UNAVAILABLE: 'toolbox.error.sourceUnavailable',
  TOOLBOX_WORKSPACE_RESOURCE_UNAVAILABLE: 'toolbox.error.sourceUnavailable',
  TOOLBOX_QUOTE_EXPIRED: 'toolbox.error.quoteExpired',
  TOOLBOX_POINTS_INSUFFICIENT: 'toolbox.error.pointsInsufficient',
  POINTS_INSUFFICIENT: 'toolbox.error.pointsInsufficient',
  AI_RATE_LIMITED: 'toolbox.error.temporarilyUnavailable',
  AI_PROVIDER_ERROR: 'toolbox.error.temporarilyUnavailable',
  AI_GATEWAY_TIMEOUT: 'toolbox.error.temporarilyUnavailable',
  AI_TIMEOUT: 'toolbox.error.temporarilyUnavailable',
  AI_FIRST_TOKEN_TIMEOUT: 'toolbox.error.temporarilyUnavailable',
  AI_STREAM_IDLE_TIMEOUT: 'toolbox.error.temporarilyUnavailable',
});

export function toolboxErrorMessageKey(error: ErrorLike, fallbackKey: string) {
  const code = String(error?.code || '').trim();
  if (EXACT_ERROR_KEYS[code]) return EXACT_ERROR_KEYS[code];
  if (code.startsWith('TOOLBOX_INPUT_') || code === 'TOOLBOX_REQUEST_ID_INVALID') {
    return 'toolbox.error.invalidInput';
  }
  if (code.startsWith('TOOLBOX_UPLOAD_') || code.startsWith('TOOLBOX_DOCUMENT_')) {
    return 'toolbox.error.documentUnavailable';
  }
  return fallbackKey;
}
