import { SEMANTIC_PLAN_VERSION } from '../semanticPlanner.js';

function legacyRequestClass(requestKind) {
  if (requestKind === 'conversation') return 'conversation';
  if (requestKind === 'product_help') return 'product_help';
  if (requestKind === 'mixed') return 'mixed';
  if (['action', 'create_artifact', 'revise_artifact'].includes(requestKind)) return 'data_action';
  return 'data_query';
}

function selectedCapabilityId(goalRoute, catalogById) {
  return (goalRoute?.capabilityIds || []).find((id) => catalogById.has(id)) || 'unknown';
}

export function adaptRuntimeOutcomeToLegacy(outcome, catalog = []) {
  const turnSpec = outcome?.turnSpec;
  if (!turnSpec) {
    return {
      semanticPlan: null,
      semanticPolicy: {
        state: 'blocked',
        resolution: 'semantic_plan_missing',
        capabilities: [],
      },
      writeToolNames: [],
    };
  }
  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((entry) => [entry.id, entry]));
  const routesByGoal = new Map((outcome?.route?.goalRoutes || []).map((route) => [route.goalId, route]));
  const goalIndex = new Map(turnSpec.goals.map((goal, index) => [goal.id, index]));
  const intents = turnSpec.goals.map((goal) => {
    const capabilityId = selectedCapabilityId(routesByGoal.get(goal.id), catalogById);
    const capability = catalogById.get(capabilityId);
    return Object.freeze({
      kind: capability?.effect === 'read' || goal.kind === 'read' ? 'read' : 'write',
      capabilityId,
      goal: goal.description,
      targetDescription: goal.targetDescription,
      dependsOn: goal.dependsOn.map((id) => goalIndex.get(id)).filter(Number.isInteger),
    });
  });
  const semanticPlan = Object.freeze({
    version: SEMANTIC_PLAN_VERSION,
    requestClass: legacyRequestClass(turnSpec.requestKind),
    confidence: turnSpec.confidence,
    intents: Object.freeze(intents),
    needsClarification: outcome.state === 'clarification',
    clarificationQuestion: outcome.question || '',
  });
  const selectedCapabilities = intents.map((intent) => catalogById.get(intent.capabilityId)).filter(Boolean);
  const writeToolNames = selectedCapabilities
    .filter((capability) => capability.effect === 'write')
    .flatMap((capability) => capability.toolNames || []);

  let semanticPolicy = null;
  if (outcome.state === 'clarification') {
    semanticPolicy = {
      state: 'clarification',
      resolution: 'ambiguous',
      capabilities: selectedCapabilities,
      message: outcome.question,
    };
  } else if (outcome.state === 'unsupported') {
    const firstStatus = selectedCapabilities.find((capability) => capability.status !== 'enabled')?.status;
    semanticPolicy = {
      state: 'blocked',
      resolution: firstStatus === 'planned' || firstStatus === 'forbidden' ? firstStatus : 'unknown_mutation',
      capabilities: selectedCapabilities,
    };
  } else if (outcome.state === 'blocked') {
    semanticPolicy = {
      state: 'blocked',
      resolution: 'semantic_conflict',
      capabilities: selectedCapabilities,
    };
  }
  return { semanticPlan, semanticPolicy, writeToolNames };
}
