const MODES = new Set(['legacy', 'shadow', 'enforce']);

export function resolveAgentRuntimeV2Mode(env = process.env) {
  const value = String(env.AI_AGENT_RUNTIME_V2_MODE || 'enforce')
    .trim()
    .toLowerCase();
  return MODES.has(value) ? value : 'enforce';
}
