export async function runActionTurn({ turnSpec, route, planExecution }) {
  const planned = await planExecution();
  return {
    runner: 'action',
    state: planned.validation?.valid ? 'ready_for_tools' : 'blocked',
    turnSpec,
    route,
    plan: planned.plan,
    validation: planned.validation,
    toolCalls: planned.validation?.toolCalls || [],
  };
}
