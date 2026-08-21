export async function runAnswerTurn({ turnSpec, route, planExecution }) {
  const planned = await planExecution();
  return {
    runner: 'answer',
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
