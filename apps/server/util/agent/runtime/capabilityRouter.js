const DEFAULT_MAX_CANDIDATE_TOOLS = 10;
const HARD_MAX_CANDIDATE_TOOLS = 12;
const PLATFORM_TARGET_PATTERN =
  /(?:全平台|平台(?:全部|所有)?|全站|本站|所有用户|全部用户|全体用户|大家|这些用户|上述用户|他们|新增用户|新用户|新注册用户|注册用户|platform[-\s]?wide|site[-\s]?wide|all\s+users?|new\s+users?)/iu;
const SINGLE_OWNER_TARGET_PATTERN =
  /(?:我的|(?<![给帮诉让替请为])我(?!们)|本人|当前(?:用户|账号)|这个账号|该账号|某一位用户|某个用户)/iu;

const TOOL_DEPENDENCIES = Object.freeze({
  restore_trash: ['query_trash'],
  save_attachment_to_cloud: ['query_cloud_folders'],
  set_todo_status: ['query_todos'],
  delete_todo: ['query_todos'],
  create_todo_plan: ['preview_todo_plan'],
});

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function shingles(value) {
  const text = normalizeText(value);
  const output = new Set();
  for (let index = 0; index < text.length; index += 1) {
    output.add(text.slice(index, index + (text.codePointAt(index) > 255 ? 2 : 4)));
  }
  return output;
}

function semanticScore(goal, capability) {
  const goalShingles = shingles(`${goal.description}${goal.targetDescription}`);
  const candidateShingles = shingles(
    `${capability.description}${capability.label}${Object.values(capability.labels || {}).join('')}`,
  );
  let overlap = 0;
  for (const item of goalShingles) if (candidateShingles.has(item)) overlap += 1;
  return overlap;
}

function patternMatches(pattern, text) {
  if (pattern instanceof RegExp) {
    pattern.lastIndex = 0;
    return pattern.test(text);
  }
  const needle = normalizeText(pattern);
  return Boolean(needle) && normalizeText(text).includes(needle);
}

function matchesAny(patterns, text) {
  return (Array.isArray(patterns) ? patterns : []).some((pattern) => patternMatches(pattern, text));
}

function targetScopeEligible(scope, text) {
  if (scope === 'single_owner' && PLATFORM_TARGET_PATTERN.test(text)) return false;
  if (scope === 'platform' && SINGLE_OWNER_TARGET_PATTERN.test(text) && !PLATFORM_TARGET_PATTERN.test(text)) {
    return false;
  }
  return true;
}

function routingText(goal, turnSpec, message) {
  return [message, goal?.description, goal?.targetDescription, turnSpec?.clarificationQuestion]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n');
}

function routingEligible(capability, text) {
  const routing = capability?.routing;
  if (!routing) return true;
  if (!targetScopeEligible(routing.targetScope, text)) return false;
  if (matchesAny(routing.excludeAny, text)) return false;
  return !routing.requireAny?.length || matchesAny(routing.requireAny, text);
}

function routedSemanticScore(goal, capability, turnSpec, message, contextTypes = []) {
  const text = routingText(goal, turnSpec, message);
  const preferenceBonus = matchesAny(capability?.routing?.preferAny, text) ? 10_000 : 0;
  const selectedTypes = new Set(
    (Array.isArray(contextTypes) ? contextTypes : []).map((item) => String(item || '').trim()).filter(Boolean),
  );
  // 已选资源能通过工具的声明式 resourceBindings 满足必填参数时，这是比文本相似度更强的
  // 结构化路由信号。只提高候选优先级，不读取绑定值，也不绕过后续 owner/session 校验。
  const resourceBindingBonus = (capability?.resourceBindingDomains || []).some(
    (domain) => domain === goal?.capabilityDomain && selectedTypes.has(domain),
  )
    ? 20_000
    : 0;
  return resourceBindingBonus + preferenceBonus + semanticScore(goal, capability);
}

function goalEffect(goal) {
  return goal.kind === 'read' ? 'read' : 'write';
}

function requestedOperation(goal, turnSpec) {
  if (goal?.operation) return goal.operation;
  if (goal?.kind === 'read') return 'read';
  if (goal?.kind === 'transform' && turnSpec?.requestKind === 'create_artifact') return 'create';
  if (goal?.kind === 'transform' && turnSpec?.requestKind === 'revise_artifact') return 'update';
  return '';
}

function pickCapabilities(goal, catalog, turnSpec, message, contextTypes) {
  const text = routingText(goal, turnSpec, message);
  const domainCandidates = (Array.isArray(catalog) ? catalog : []).filter(
    (entry) =>
      (Array.isArray(entry?.appliesToDomains)
        ? entry.appliesToDomains.includes(goal.capabilityDomain)
        : entry?.domain === goal.capabilityDomain) &&
      entry?.effect === goalEffect(goal) &&
      routingEligible(entry, text),
  );
  const operation = requestedOperation(goal, turnSpec);
  const operationCandidates = operation
    ? domainCandidates.filter((entry) => Array.isArray(entry?.operations) && entry.operations.includes(operation))
    : [];
  const candidates = (operationCandidates.length ? operationCandidates : domainCandidates)
    .map((entry) => ({ entry, score: routedSemanticScore(goal, entry, turnSpec, message, contextTypes) }))
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id));
  if (!candidates.length) return [];
  // “未选择/未开放”只描述本轮不可调用，不能凭描述相似度压掉同域内真正可执行的能力。
  // 当至少存在 enabled/planned/forbidden 候选时，先排除 unavailable；若全部不可用则仍保留
  // 最高分项，让调用方返回明确的 unavailable，而不是伪装成无能力。
  const routableCandidates = candidates.some((candidate) => candidate.entry.status !== 'unavailable')
    ? candidates.filter((candidate) => candidate.entry.status !== 'unavailable')
    : candidates;
  if (goalEffect(goal) === 'write') return [routableCandidates[0].entry];
  const bestScore = routableCandidates[0].score;
  return routableCandidates
    .filter((candidate, index) => index < 3 && (bestScore > 0 ? candidate.score === bestScore : true))
    .map((candidate) => candidate.entry);
}

function safeLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_MAX_CANDIDATE_TOOLS;
  return Math.max(1, Math.min(HARD_MAX_CANDIDATE_TOOLS, Math.trunc(numeric)));
}

export function routeTurnSpecCapabilities({
  turnSpec,
  catalog = [],
  tools = [],
  maxTools,
  message = '',
  contextTypes = [],
} = {}) {
  if (!turnSpec) return { state: 'blocked', reason: 'turn_spec_missing', candidates: [], goalRoutes: [] };
  if (turnSpec.confidence === 'low' || turnSpec.missingSlots.length > 0) {
    return { state: 'clarification', reason: 'turn_spec_ambiguous', candidates: [], goalRoutes: [] };
  }
  const toolsByName = new Map((Array.isArray(tools) ? tools : []).map((tool) => [tool?.name, tool]));
  const catalogByTool = new Map();
  for (const entry of catalog) {
    for (const name of entry?.toolNames || []) catalogByTool.set(name, entry);
  }
  const goalRoutes = [];
  const candidateNames = [];
  const unsupportedGoals = [];
  for (const goal of turnSpec.goals) {
    if (goal.capabilityDomain === 'none') {
      unsupportedGoals.push(goal.id);
      goalRoutes.push({ goalId: goal.id, capabilityIds: [], toolNames: [], status: 'unsupported' });
      continue;
    }
    const selected = pickCapabilities(goal, catalog, turnSpec, message, contextTypes);
    const policyCapability = selected.find((entry) => ['forbidden', 'planned'].includes(entry.status));
    const enabled = selected.filter((entry) => entry.status === 'enabled');
    if (
      policyCapability &&
      (!enabled.length ||
        routedSemanticScore(goal, policyCapability, turnSpec, message, contextTypes) >=
          routedSemanticScore(goal, enabled[0], turnSpec, message, contextTypes))
    ) {
      unsupportedGoals.push(goal.id);
      goalRoutes.push({
        goalId: goal.id,
        capabilityIds: [policyCapability.id],
        toolNames: [],
        status: policyCapability.status,
      });
      continue;
    }
    const toolNames = enabled.flatMap((entry) => entry.toolNames || []).filter((name) => toolsByName.has(name));
    for (const name of toolNames) {
      if (!candidateNames.includes(name)) candidateNames.push(name);
      for (const dependency of TOOL_DEPENDENCIES[name] || []) {
        if (toolsByName.has(dependency) && !candidateNames.includes(dependency)) candidateNames.push(dependency);
      }
    }
    goalRoutes.push({
      goalId: goal.id,
      capabilityIds: enabled.map((entry) => entry.id),
      toolNames,
      status: toolNames.length ? 'ready' : 'unavailable',
    });
    if (!toolNames.length) unsupportedGoals.push(goal.id);
  }

  const limit = safeLimit(maxTools);
  if (candidateNames.length > limit) {
    return {
      state: 'clarification',
      reason: 'candidate_budget_exceeded',
      candidates: [],
      goalRoutes,
      candidateToolCount: candidateNames.length,
      maxCandidateTools: limit,
      unsupportedGoals,
    };
  }
  const candidates = candidateNames.map((name) => toolsByName.get(name)).filter(Boolean);
  const hasForbiddenGoal = goalRoutes.some((goalRoute) => goalRoute.status === 'forbidden');
  return {
    state:
      hasForbiddenGoal || (unsupportedGoals.length === turnSpec.goals.length && turnSpec.goals.length)
        ? 'unsupported'
        : 'ready',
    reason: hasForbiddenGoal ? 'forbidden_goal' : unsupportedGoals.length ? 'partial_support' : 'ready',
    candidates,
    goalRoutes,
    candidateToolCount: candidates.length,
    candidateDomainCount: new Set(turnSpec.goals.map((goal) => goal.capabilityDomain).filter((item) => item !== 'none'))
      .size,
    unsupportedGoals,
    capabilityByTool: catalogByTool,
  };
}

export const __testing = Object.freeze({
  matchesAny,
  requestedOperation,
  routedSemanticScore,
  routingEligible,
  semanticScore,
  safeLimit,
  targetScopeEligible,
});
