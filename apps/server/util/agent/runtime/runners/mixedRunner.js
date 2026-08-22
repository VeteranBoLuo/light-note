export async function runMixedTurn({ turnSpec, route, planExecution }) {
  const planned = await planExecution();
  return {
    runner: 'mixed',
    state: planned.validation?.valid ? 'ready_for_tools' : 'blocked',
    turnSpec,
    route,
    plan: planned.plan,
    validation: planned.validation,
    plannerAttempts: planned.attempts,
    planningMode: planned.planningMode || 'planner',
    deterministicFallbackReason: planned.deterministicFallbackReason || null,
    toolCalls: planned.validation?.toolCalls || [],
  };
}
