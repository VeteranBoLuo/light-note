const DEFAULT_MAX_CANDIDATE_TOOLS = 10;
const HARD_MAX_CANDIDATE_TOOLS = 12;

const TOOL_DEPENDENCIES = Object.freeze({
  restore_trash: ['query_trash'],
  save_attachment_to_cloud: ['query_cloud_folders'],
  create_image_note: ['query_cloud_folders'],
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

function goalEffect(goal) {
  return goal.kind === 'read' ? 'read' : 'write';
}

function requestedOperation(goal, turnSpec) {
  if (goal?.kind === 'read') return 'read';
  if (goal?.kind === 'transform' && turnSpec?.requestKind === 'create_artifact') return 'create';
  if (goal?.kind === 'transform' && turnSpec?.requestKind === 'revise_artifact') return 'update';
  return '';
}

function pickCapabilities(goal, catalog, turnSpec) {
  const domainCandidates = (Array.isArray(catalog) ? catalog : [])
    .filter(
      (entry) =>
        (Array.isArray(entry?.appliesToDomains)
          ? entry.appliesToDomains.includes(goal.capabilityDomain)
          : entry?.domain === goal.capabilityDomain) && entry?.effect === goalEffect(goal),
    );
  const operation = requestedOperation(goal, turnSpec);
  const operationCandidates = operation
    ? domainCandidates.filter((entry) => Array.isArray(entry?.operations) && entry.operations.includes(operation))
    : [];
  const candidates = (operationCandidates.length ? operationCandidates : domainCandidates)
    .map((entry) => ({ entry, score: semanticScore(goal, entry) }))
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id));
  if (!candidates.length) return [];
  if (goalEffect(goal) === 'write') return [candidates[0].entry];
  const bestScore = candidates[0].score;
  return candidates
    .filter((candidate, index) => index < 3 && (bestScore > 0 ? candidate.score === bestScore : true))
    .map((candidate) => candidate.entry);
}

function safeLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_MAX_CANDIDATE_TOOLS;
  return Math.max(1, Math.min(HARD_MAX_CANDIDATE_TOOLS, Math.trunc(numeric)));
}

export function routeTurnSpecCapabilities({ turnSpec, catalog = [], tools = [], maxTools } = {}) {
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
    const selected = pickCapabilities(goal, catalog, turnSpec);
    const policyCapability = selected.find((entry) => ['forbidden', 'planned'].includes(entry.status));
    const enabled = selected.filter((entry) => entry.status === 'enabled');
    if (
      policyCapability &&
      (!enabled.length || semanticScore(goal, policyCapability) >= semanticScore(goal, enabled[0]))
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

export const __testing = Object.freeze({ requestedOperation, semanticScore, safeLimit });
