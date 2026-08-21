export const AGENT_CAPABILITY_POLICY_PROFILES = Object.freeze(['auto', 'chat_only', 'read_only']);

const PROFILES = new Set(AGENT_CAPABILITY_POLICY_PROFILES);

export function normalizeAgentCapabilityPolicyProfile(value) {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? (value.profile ?? value.mode) : value;
  const profile = String(candidate || '')
    .trim()
    .toLowerCase();
  return PROFILES.has(profile) ? profile : 'auto';
}

/**
 * Policy Profile 只消费 Manifest 元数据，不看用户措辞、工具名或历史文本。
 * blocked 能力仍可进入 Compiler 目录用于准确识别请求，但不会获得可执行 toolName。
 */
export function evaluateAgentCapabilityPolicy(capability, profileValue) {
  const profile = normalizeAgentCapabilityPolicyProfile(profileValue);
  if (!capability || typeof capability !== 'object') {
    return Object.freeze({ allowed: false, profile, reason: 'capability_unregistered' });
  }
  if (profile === 'chat_only') {
    const allowed = capability.effect === 'read' && capability.scopePolicy === 'public_product';
    return Object.freeze({ allowed, profile, reason: allowed ? 'allowed' : 'chat_only' });
  }
  if (profile === 'read_only' && capability.effect === 'write') {
    return Object.freeze({ allowed: false, profile, reason: 'read_only' });
  }
  return Object.freeze({ allowed: true, profile, reason: 'allowed' });
}

export function capabilityMatchesPolicyProfile(capability, profileValue) {
  return evaluateAgentCapabilityPolicy(capability, profileValue).allowed;
}
