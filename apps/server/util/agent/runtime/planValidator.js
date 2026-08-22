import { validateToolArgumentsAgainstSchema } from '../toolPolicy.js';
import { normalizeToolArguments } from '../toolArguments.js';
import { bindAuthoritativeResourceArguments } from './executionContext.js';
import { getAgentV3CapabilityByToolName } from './v3/capabilityManifest.js';
import { authoritativeTemporalRangesForGoal, bindAuthoritativeTemporalArguments } from './v3/temporalConstraints.js';

function toolCallId(step, index) {
  return `execution-plan-${String(step.id || index + 1)
    .replace(/[^a-z0-9_-]+/giu, '-')
    .slice(0, 64)}`;
}

function toolCall(step, index) {
  return {
    id: toolCallId(step, index),
    type: 'function',
    function: { name: step.toolName, arguments: JSON.stringify(step.arguments) },
  };
}

export function validateExecutionPlan({ turnSpec, route, parsed, completedGoalIds = [], executionContext = {} } = {}) {
  const issues = [];
  const repairFeedback = [];
  const toolsByName = new Map((route?.candidates || []).map((tool) => [tool.name, tool]));
  const capabilitiesByTool = route?.capabilityByTool instanceof Map ? route.capabilityByTool : new Map();
  const goalsById = new Map((turnSpec?.goals || []).map((goal) => [goal.id, goal]));
  const routesByGoal = new Map((route?.goalRoutes || []).map((item) => [item.goalId, item]));
  const completed = new Set(completedGoalIds.map(String));
  if (!parsed?.plan || parsed.invalid) issues.push('execution_plan_invalid');
  if (parsed?.plan?.turnSpecDigest !== turnSpec?.digest) issues.push('turn_spec_digest_mismatch');

  let unsafeExtraWrite = false;
  for (const call of parsed?.extraCalls || []) {
    if (toolsByName.get(call?.function?.name)?.isWrite === true || !toolsByName.has(call?.function?.name)) {
      unsafeExtraWrite = true;
    }
  }
  if (unsafeExtraWrite) issues.push('extra_tool_call_blocked');

  const acceptedSteps = [];
  const temporalBindingsByStepId = new Map();
  const writeGoals = new Set();
  const seenStepIds = new Set();
  const implicitlyDeferred = new Set();
  for (const step of parsed?.plan?.steps || []) {
    if (!step || typeof step !== 'object' || Array.isArray(step) || !step.arguments || Array.isArray(step.arguments)) {
      issues.push('execution_step_invalid');
      continue;
    }
    const stepId = String(step.id || '').trim();
    if (!stepId || seenStepIds.has(stepId)) {
      issues.push('execution_step_id_invalid');
      continue;
    }
    if (!Array.isArray(step.dependsOn) || step.dependsOn.some((id) => !seenStepIds.has(String(id)))) {
      issues.push('execution_step_dependency_invalid');
      continue;
    }
    if (!String(step.expectedResultKind || '').trim()) {
      issues.push('execution_step_result_kind_missing');
      continue;
    }
    seenStepIds.add(stepId);
    const goal = goalsById.get(String(step.goalId || ''));
    const goalRoute = routesByGoal.get(goal?.id);
    const tool = toolsByName.get(String(step.toolName || ''));
    if (!goal || !goalRoute || !tool || !goalRoute.toolNames.includes(tool.name)) {
      if (tool?.isWrite === true || !tool) issues.push('extra_tool_call_blocked');
      continue;
    }
    const expectedResultKind = String(capabilitiesByTool.get(tool.name)?.resultKind || '').trim();
    if (expectedResultKind && step.expectedResultKind !== expectedResultKind) {
      issues.push('execution_step_result_kind_mismatch');
      continue;
    }
    if (goal.dependsOn.some((dependencyId) => !completed.has(dependencyId))) {
      // Planner 偶发提前填写依赖目标。服务端安全地丢弃该步骤并留到下一轮，
      // 不因一个不会执行的提前调用否定同轮已经可执行的前置读取。
      implicitlyDeferred.add(goal.id);
      continue;
    }
    let acceptedStep = step;
    try {
      // 与真实 Tool Policy 使用完全相同的归一化顺序，避免 Planner 门禁验证 raw，
      // 执行阶段却验证 normalized 后产生“计划通过、工具拒绝”的双重契约。
      const resourceBoundArguments = bindAuthoritativeResourceArguments({
        tool,
        args: normalizeToolArguments(tool, step.arguments),
        argumentBindings: step.argumentBindings,
        executionContext,
      });
      const capability = capabilitiesByTool.get(tool.name);
      const manifestCapability = getAgentV3CapabilityByToolName(tool.name);
      const normalizedArguments = bindAuthoritativeTemporalArguments({
        turnSpec,
        goalId: goal.id,
        args: resourceBoundArguments,
        temporalSlots:
          capability?.temporalSlots?.length > 0
            ? capability.temporalSlots
            : manifestCapability?.temporalSlots?.length > 0
              ? manifestCapability.temporalSlots
              : tool.temporalSlots || [],
      });
      validateToolArgumentsAgainstSchema(tool.parameters, normalizedArguments);
      if (typeof tool.validatePlanArgs === 'function') tool.validatePlanArgs(normalizedArguments);
      acceptedStep = { ...step, arguments: normalizedArguments };
    } catch (error) {
      const code = error?.code || 'tool_arguments_invalid';
      issues.push(code);
      repairFeedback.push({
        code,
        toolName: tool.name,
        message: String(error?.message || '工具参数不符合业务约束。').slice(0, 240),
      });
      continue;
    }
    if (tool.isWrite === true && writeGoals.has(goal.id)) {
      issues.push('duplicate_write_goal');
      continue;
    }
    if (tool.isWrite === true) writeGoals.add(goal.id);
    acceptedSteps.push(acceptedStep);
    temporalBindingsByStepId.set(stepId, authoritativeTemporalRangesForGoal(turnSpec, goal.id));
  }

  const deferred = new Set([...(parsed?.plan?.deferredGoalIds || []), ...implicitlyDeferred]);
  for (const goal of turnSpec?.goals || []) {
    const goalRoute = routesByGoal.get(goal.id);
    if (goalRoute?.status !== 'ready' || completed.has(goal.id)) continue;
    const dependenciesReady = goal.dependsOn.every((id) => completed.has(id));
    if (!dependenciesReady) {
      if (!deferred.has(goal.id)) issues.push('dependent_goal_not_deferred');
      continue;
    }
    if (!acceptedSteps.some((step) => step.goalId === goal.id)) issues.push('required_goal_step_missing');
  }

  const uniqueIssues = [...new Set(issues)];
  return {
    valid: uniqueIssues.length === 0,
    issues: uniqueIssues,
    repairFeedback,
    toolCalls: uniqueIssues.length ? [] : acceptedSteps.map(toolCall),
    goalIdsByCallId: uniqueIssues.length
      ? Object.freeze({})
      : Object.freeze(
          Object.fromEntries(acceptedSteps.map((step, index) => [toolCallId(step, index), String(step.goalId)])),
        ),
    temporalBindingsByCallId: uniqueIssues.length
      ? Object.freeze({})
      : Object.freeze(
          Object.fromEntries(
            acceptedSteps.map((step, index) => [
              toolCallId(step, index),
              temporalBindingsByStepId.get(String(step.id || '')) || Object.freeze({}),
            ]),
          ),
        ),
    ignoredExtraReadCount: (parsed?.extraCalls || []).filter(
      (call) => toolsByName.get(call?.function?.name)?.isWrite !== true && toolsByName.has(call?.function?.name),
    ).length,
  };
}
