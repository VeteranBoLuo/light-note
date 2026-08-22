import crypto from 'node:crypto';

const MODES = new Set(['legacy', 'shadow', 'enforce']);
const V3_MODES = new Set(['legacy', 'v3_shadow', 'v3_enforce']);
const ROLLOUT_ROLES = new Set(['visitor', 'user', 'root']);
const ROLLOUT_POLICY_KEYS = new Set(['roles', 'actorIds', 'excludeActorIds', 'percentage', 'salt']);
const MAX_ROLLOUT_ACTOR_IDS = 500;
const MAX_ACTOR_ID_LENGTH = 128;
const DEFAULT_ROLLOUT_SALT = 'light-note-agent-runtime-v3';

function freezePolicy(input) {
  return Object.freeze({
    status: input.status,
    source: input.source,
    roles: Object.freeze(input.roles || []),
    actorIds: Object.freeze(input.actorIds || []),
    excludeActorIds: Object.freeze(input.excludeActorIds || []),
    percentage: input.percentage || 0,
    salt: input.salt || DEFAULT_ROLLOUT_SALT,
  });
}

function disabledPolicy(source = 'none') {
  return freezePolicy({ status: 'valid', source, roles: [], actorIds: [], excludeActorIds: [], percentage: 0 });
}

function invalidPolicy() {
  return freezePolicy({
    status: 'invalid',
    source: 'invalid',
    roles: [],
    actorIds: [],
    excludeActorIds: [],
    percentage: 0,
  });
}

function normalizeActorIds(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ROLLOUT_ACTOR_IDS) return null;
  const ids = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const id = item.trim();
    if (!id || id.length > MAX_ACTOR_ID_LENGTH) return null;
    ids.push(id);
  }
  return [...new Set(ids)];
}

function normalizeRoles(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (value.some((item) => typeof item !== 'string' || !item.trim())) return null;
  const roles = [...new Set(value.map((item) => item.trim().toLowerCase()))];
  return roles.every((role) => ROLLOUT_ROLES.has(role)) ? roles : null;
}

function normalizePercentage(value) {
  if (value === undefined) return 0;
  if (typeof value !== 'number') return null;
  const percentage = value;
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
  return Number(percentage.toFixed(2));
}

function parseStructuredRolloutPolicy(raw) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return invalidPolicy();
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidPolicy();
  if (Object.keys(input).some((key) => !ROLLOUT_POLICY_KEYS.has(key))) return invalidPolicy();

  const roles = normalizeRoles(input.roles);
  const actorIds = normalizeActorIds(input.actorIds);
  const excludeActorIds = normalizeActorIds(input.excludeActorIds);
  const percentage = normalizePercentage(input.percentage);
  const salt =
    input.salt === undefined ? DEFAULT_ROLLOUT_SALT : typeof input.salt === 'string' ? input.salt.trim() : '';
  if (!roles || !actorIds || !excludeActorIds || percentage === null || !salt || salt.length > 128) {
    return invalidPolicy();
  }
  return freezePolicy({
    status: 'valid',
    source: 'custom',
    roles,
    actorIds,
    excludeActorIds,
    percentage,
    salt,
  });
}

export function resolveAgentRuntimeRolloutPolicy(env = process.env) {
  const raw = String(env.AI_AGENT_RUNTIME_V3_ROLLOUT || 'none').trim();
  const alias = raw.toLowerCase();
  if (!raw || alias === 'none') return disabledPolicy();
  if (alias === 'root') {
    return freezePolicy({
      status: 'valid',
      source: 'root',
      roles: ['root'],
      actorIds: [],
      excludeActorIds: [],
      percentage: 0,
    });
  }
  if (alias === 'all') {
    return freezePolicy({
      status: 'valid',
      source: 'all',
      roles: [],
      actorIds: [],
      excludeActorIds: [],
      percentage: 100,
    });
  }
  return parseStructuredRolloutPolicy(raw);
}

export function stableAgentRuntimeRolloutBucket(actorKey, salt = DEFAULT_ROLLOUT_SALT) {
  const key = String(actorKey || '').trim();
  if (!key) return null;
  const digest = crypto
    .createHash('sha256')
    .update(`${String(salt)}\n${key}`)
    .digest('hex');
  return Number.parseInt(digest.slice(0, 8), 16) % 10_000;
}

export function resolveAgentRuntimeV2Mode(env = process.env) {
  const value = String(env.AI_AGENT_RUNTIME_V2_MODE || 'enforce')
    .trim()
    .toLowerCase();
  return MODES.has(value) ? value : 'enforce';
}

/**
 * 这里只解析部署声明的 V3 目标模式；本请求是否真正进入 V3 还必须经过账号灰度决策。
 * legacy 表示继续走当前已上线链路；shadow 只编译和比对，绝不执行 V3 计划；
 * enforce 才会让 V3 成为本轮唯一执行语义源。
 */
export function resolveAgentRuntimeMode(env = process.env) {
  const value = String(env.AI_AGENT_RUNTIME_MODE || 'legacy')
    .trim()
    .toLowerCase();
  return V3_MODES.has(value) ? value : 'legacy';
}

/**
 * 把全局目标模式与账号级灰度策略求交，得到本请求真正执行的模式。
 *
 * actor 始终取认证后的计费/操作账号，而不是管理员正在查看的资源账号；这样 Root
 * 代管普通用户时仍属于 Root 灰度，不会把被查看账号意外带入 V3。任何无效或缺失
 * 的灰度配置都失败关闭到 legacy，且不会触发 V3 shadow 的额外模型调用。
 */
export function resolveAgentRuntimeDecision({
  env = process.env,
  configuredMode = resolveAgentRuntimeMode(env),
  actorId,
  actorRole,
  actorKey,
} = {}) {
  const normalizedConfiguredMode = V3_MODES.has(configuredMode) ? configuredMode : 'legacy';
  const policy = resolveAgentRuntimeRolloutPolicy(env);
  const normalizedActorId = String(actorId || '').trim();
  const normalizedActorRole = String(actorRole || '')
    .trim()
    .toLowerCase();
  const stableActorKey = String(actorKey || normalizedActorId).trim();
  const base = {
    configuredMode: normalizedConfiguredMode,
    effectiveMode: 'legacy',
    enrolled: false,
    rolloutPercentage: policy.percentage,
  };

  if (normalizedConfiguredMode === 'legacy') {
    return Object.freeze({ ...base, reason: 'global_legacy' });
  }
  if (policy.status !== 'valid') {
    return Object.freeze({ ...base, reason: 'invalid_policy' });
  }
  if (policy.excludeActorIds.includes(normalizedActorId)) {
    return Object.freeze({ ...base, reason: 'excluded' });
  }
  if (policy.source === 'all') {
    return Object.freeze({ ...base, effectiveMode: normalizedConfiguredMode, enrolled: true, reason: 'all' });
  }
  if (normalizedActorId && policy.actorIds.includes(normalizedActorId)) {
    return Object.freeze({
      ...base,
      effectiveMode: normalizedConfiguredMode,
      enrolled: true,
      reason: 'actor_allowlist',
    });
  }
  if (ROLLOUT_ROLES.has(normalizedActorRole) && policy.roles.includes(normalizedActorRole)) {
    return Object.freeze({
      ...base,
      effectiveMode: normalizedConfiguredMode,
      enrolled: true,
      reason: 'role_allowlist',
    });
  }
  if (policy.percentage > 0 && stableActorKey) {
    const bucket = stableAgentRuntimeRolloutBucket(stableActorKey, policy.salt);
    if (bucket !== null && bucket < Math.round(policy.percentage * 100)) {
      return Object.freeze({
        ...base,
        effectiveMode: normalizedConfiguredMode,
        enrolled: true,
        reason: 'percentage',
      });
    }
  }
  return Object.freeze({ ...base, reason: policy.source === 'none' ? 'policy_disabled' : 'not_selected' });
}
