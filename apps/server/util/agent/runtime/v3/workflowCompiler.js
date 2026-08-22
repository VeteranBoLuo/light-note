import { validateExecutionPlan } from '../planValidator.js';

const EXECUTION_PLAN_VERSION = '2.0';

function modelSlotClaims(goal, capability, slotValues = null) {
  const definitions = (Array.isArray(capability?.slots) ? capability.slots : []).filter((slot) =>
    ['model_text', 'model_enum'].includes(slot?.source),
  );
  const allowed = new Set(definitions.map((slot) => slot.name));
  const source = slotValues && typeof slotValues === 'object' ? slotValues : goal?.slotClaims || {};
  const claims = Object.entries(source).filter(([, value]) => value !== null && value !== undefined);
  if (claims.some(([name]) => !allowed.has(name))) return null;
  if (
    definitions.some(
      (slot) =>
        !Object.prototype.hasOwnProperty.call(source, slot.name) ||
        (slot.required && (source[slot.name] === null || source[slot.name] === undefined)),
    )
  ) {
    return undefined;
  }
  return Object.fromEntries(claims);
}

function capabilityForGoal(route, goalRoute) {
  if (!(route?.capabilityByTool instanceof Map) || goalRoute?.toolNames?.length !== 1) return null;
  return route.capabilityByTool.get(goalRoute.toolNames[0]) || null;
}

/**
 * 用 Manifest 的 workflow 契约编译无需模型参与的确定性步骤。
 *
 * 这层不会猜工具、参数或默认值：只有 capability 显式开启 deterministic，且统一
 * Plan Validator 能用服务端时间/资源绑定和已校验 slotClaims 完整通过时才命中。
 * 任一条件不满足只返回 not_applicable，由现有 Planner 继续处理，避免迁移期退化。
 */
export function compileDeterministicAgentWorkflow({
  turnSpec,
  route,
  completedGoalIds = [],
  executionContext = {},
  slotValuesByGoal = new Map(),
  validate = validateExecutionPlan,
} = {}) {
  if (!turnSpec || route?.state !== 'ready') return Object.freeze({ applicable: false, reason: 'route_not_ready' });
  const completed = new Set((Array.isArray(completedGoalIds) ? completedGoalIds : []).map(String));
  const routesByGoal = new Map((route.goalRoutes || []).map((item) => [item.goalId, item]));
  const candidateToolNames = new Set((route.candidates || []).map((tool) => tool.name));
  const steps = [];
  const deferredGoalIds = [];
  const unsupportedGoalIds = [];

  for (const goal of turnSpec.goals || []) {
    if (completed.has(goal.id)) continue;
    const goalRoute = routesByGoal.get(goal.id);
    if (goalRoute?.status !== 'ready') {
      unsupportedGoalIds.push(goal.id);
      continue;
    }
    const capability = capabilityForGoal(route, goalRoute);
    const toolName = goalRoute.toolNames?.[0];
    if (!capability || !candidateToolNames.has(toolName) || capability.workflow?.deterministic !== true) {
      return Object.freeze({ applicable: false, reason: 'workflow_requires_planner' });
    }
    if (
      goal.referentSelectors?.some((selector) => selector.source === 'last_result') &&
      capability.slots?.some((slot) => slot.source === 'dependency_result')
    ) {
      return Object.freeze({ applicable: false, reason: 'workflow_dependency_binding_unresolved' });
    }
    if (goal.dependsOn.some((goalId) => !completed.has(goalId))) {
      deferredGoalIds.push(goal.id);
      continue;
    }
    const argumentsFromClaims = modelSlotClaims(goal, capability, slotValuesByGoal?.get?.(goal.id));
    if (argumentsFromClaims === undefined) {
      return Object.freeze({ applicable: false, reason: 'workflow_model_slots_unresolved' });
    }
    if (argumentsFromClaims === null) {
      return Object.freeze({ applicable: false, reason: 'workflow_slot_contract_mismatch' });
    }
    steps.push({
      id: `wf-${goal.id}`.slice(0, 64),
      goalId: goal.id,
      toolName,
      arguments: argumentsFromClaims,
      dependsOn: [],
      expectedResultKind: capability.resultKind,
    });
  }

  const plan = {
    version: EXECUTION_PLAN_VERSION,
    turnSpecDigest: turnSpec.digest,
    steps,
    deferredGoalIds,
    unsupportedGoalIds,
  };
  const validation = validate({
    turnSpec,
    route,
    parsed: { plan, extraCalls: [], invalid: false },
    completedGoalIds,
    executionContext,
  });
  if (!validation?.valid) {
    return Object.freeze({ applicable: false, reason: 'deterministic_validation_failed', validation });
  }
  return Object.freeze({
    applicable: true,
    plan,
    validation,
    attempts: 0,
    planningMode: 'deterministic',
  });
}

export const __testing = Object.freeze({ capabilityForGoal, modelSlotClaims });
