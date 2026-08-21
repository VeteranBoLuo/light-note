const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeAgentUuid(value) {
  const normalized = String(value || '').trim();
  return UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : '';
}

export function isAgentUuid(value) {
  return Boolean(normalizeAgentUuid(value));
}
