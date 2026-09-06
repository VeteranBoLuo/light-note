const DISABLED_VALUES = new Set(['0', 'false', 'off', 'no']);

export function isOrganizeAiSuggestionsEnabled(env = process.env) {
  const raw = env.ORGANIZE_AI_SUGGESTIONS_ENABLED;
  if (raw == null || String(raw).trim() === '') return true;
  return !DISABLED_VALUES.has(String(raw).trim().toLowerCase());
}
