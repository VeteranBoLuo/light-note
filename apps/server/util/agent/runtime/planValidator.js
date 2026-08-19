import { validateToolArgumentsAgainstSchema } from '../toolPolicy.js';

function toolCall(step, index) {
  return {
    id: `execution-plan-${String(step.id || index + 1)
      .replace(/[^a-z0-9_-]+/giu, '-')
      .slice(0, 64)}`,
    type: 'function',
    function: { name: step.toolName, arguments: JSON.stringify(step.arguments) },
  };
}

export function validateExecutionPlan({ turnSpec, route, parsed, completedGoalIds = [] } = {}) {
  const issues = [];
  const toolsByName = new Map((route?.candidates || []).map((tool) => [tool.name, tool]));
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
    if (goal.dependsOn.some((dependencyId) => !completed.has(dependencyId))) {
      // Planner 偶发提前填写依赖目标。服务端安全地丢弃该步骤并留到下一轮，
      // 不因一个不会执行的提前调用否定同轮已经可执行的前置读取。
      implicitlyDeferred.add(goal.id);
      continue;
    }
    try {
      validateToolArgumentsAgainstSchema(tool.parameters, step.arguments);
    } catch (error) {
      issues.push(error?.code || 'tool_arguments_invalid');
      continue;
    }
    if (tool.isWrite === true && writeGoals.has(goal.id)) {
      issues.push('duplicate_write_goal');
      continue;
    }
    if (tool.isWrite === true) writeGoals.add(goal.id);
    acceptedSteps.push(step);
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
    toolCalls: uniqueIssues.length ? [] : acceptedSteps.map(toolCall),
    ignoredExtraReadCount: (parsed?.extraCalls || []).filter(
      (call) => toolsByName.get(call?.function?.name)?.isWrite !== true && toolsByName.has(call?.function?.name),
    ).length,
  };
}
