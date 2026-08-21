const DEFAULT_MAX_CANDIDATE_TOOLS = 10;
const HARD_MAX_CANDIDATE_TOOLS = 12;

function safeLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_MAX_CANDIDATE_TOOLS;
  return Math.max(1, Math.min(HARD_MAX_CANDIDATE_TOOLS, Math.trunc(numeric)));
}

/**
 * V3 路由器只执行精确映射：TurnSpec.capabilityId -> Manifest -> registered tool。
 * 这里故意不接收 message，也没有关键词、正则、相似度或历史文本入口。
 */
export function routeTurnSpecCapabilitiesV3({
  turnSpec,
  catalog = [],
  tools = [],
  availableInputKinds = ['latest_message'],
  maxTools,
} = {}) {
  if (!turnSpec) return { state: 'blocked', reason: 'turn_spec_missing', candidates: [], goalRoutes: [] };
  if (turnSpec.confidence === 'low' || turnSpec.missingSlots.length > 0) {
    return { state: 'clarification', reason: 'turn_spec_ambiguous', candidates: [], goalRoutes: [] };
  }

  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((entry) => [entry.id, entry]));
  const toolsByName = new Map((Array.isArray(tools) ? tools : []).map((tool) => [tool?.name, tool]));
  const candidates = [];
  const candidateNames = new Set();
  const goalRoutes = [];
  const unsupportedGoals = [];
  const inputs = new Set((Array.isArray(availableInputKinds) ? availableInputKinds : []).map(String));

  for (const goal of turnSpec.goals) {
    const capability = catalogById.get(goal.capabilityId);
    let status = capability?.status || 'unavailable';
    let toolNames = [];
    if (capability && !capability.operations.includes(goal.operation)) status = 'unavailable';
    const acceptedInputKinds = capability?.acceptedInputKinds?.length
      ? capability.acceptedInputKinds
      : ['latest_message'];
    if (capability && !acceptedInputKinds.some((kind) => inputs.has(kind))) status = 'unavailable';
    if (status === 'enabled') {
      const tool = toolsByName.get(capability.toolName);
      if (!tool) status = 'unavailable';
      else {
        toolNames = [tool.name];
        if (!candidateNames.has(tool.name)) {
          candidateNames.add(tool.name);
          candidates.push(tool);
        }
      }
    }
    if (status !== 'enabled') unsupportedGoals.push(goal.id);
    goalRoutes.push(
      Object.freeze({
        goalId: goal.id,
        capabilityIds: capability ? Object.freeze([capability.id]) : Object.freeze([]),
        toolNames: Object.freeze(toolNames),
        status: status === 'enabled' ? 'ready' : status,
      }),
    );
  }

  const limit = safeLimit(maxTools);
  if (candidates.length > limit) {
    return {
      state: 'clarification',
      reason: 'candidate_budget_exceeded',
      candidates: [],
      goalRoutes: Object.freeze(goalRoutes),
      candidateToolCount: candidates.length,
      maxCandidateTools: limit,
      unsupportedGoals: Object.freeze(unsupportedGoals),
    };
  }

  const hasForbiddenGoal = goalRoutes.some((goalRoute) => goalRoute.status === 'forbidden');
  const hasPolicyBlockedGoal = goalRoutes.some((goalRoute) => goalRoute.status === 'policy_blocked');
  const allUnsupported = unsupportedGoals.length === turnSpec.goals.length && turnSpec.goals.length > 0;
  return Object.freeze({
    state: hasForbiddenGoal || hasPolicyBlockedGoal || allUnsupported ? 'unsupported' : 'ready',
    reason: hasForbiddenGoal
      ? 'forbidden_goal'
      : hasPolicyBlockedGoal
        ? 'policy_blocked_goal'
        : unsupportedGoals.length
          ? 'partial_support'
          : 'ready',
    candidates: Object.freeze(candidates),
    goalRoutes: Object.freeze(goalRoutes),
    candidateToolCount: candidates.length,
    candidateDomainCount: new Set(turnSpec.goals.map((goal) => goal.capabilityDomain)).size,
    unsupportedGoals: Object.freeze(unsupportedGoals),
    capabilityByTool: new Map(
      (Array.isArray(catalog) ? catalog : []).filter((entry) => entry.toolName).map((entry) => [entry.toolName, entry]),
    ),
  });
}

export const __testing = Object.freeze({ safeLimit });
