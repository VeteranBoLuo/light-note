const FIXED_GOAL_STATES = new Set(['planned', 'unsupported', 'unavailable', 'forbidden']);
const FAILURE_GOAL_STATES = new Set(['failed', 'unknown', 'cancelled']);

function toolResultGoalState(status) {
  if (status === 'success') return 'completed';
  if (status === 'confirmation_required') return 'awaiting_confirmation';
  if (status === 'interaction_required') return 'awaiting_interaction';
  if (status === 'error') return 'failed';
  return '';
}

function outcomePriority(status) {
  if (status === 'failed') return 4;
  if (status === 'awaiting_interaction') return 3;
  if (status === 'awaiting_confirmation') return 2;
  if (status === 'completed') return 1;
  return 0;
}

function goalIdForCall(goalIdsByCallId, callId) {
  if (goalIdsByCallId instanceof Map) return String(goalIdsByCallId.get(callId) || '');
  return String(goalIdsByCallId?.[callId] || '');
}

export function mergeAgentRunGoalOutcomes(current = {}, results = [], goalIdsByCallId = {}) {
  const next = { ...(current && typeof current === 'object' ? current : {}) };
  for (const item of Array.isArray(results) ? results : []) {
    const goalId = goalIdForCall(goalIdsByCallId, item?.toolCallId);
    const status = toolResultGoalState(item?.result?.status);
    if (!goalId || !status) continue;
    if (outcomePriority(status) >= outcomePriority(next[goalId])) next[goalId] = status;
  }
  return Object.freeze(next);
}

export function settleAgentRunGoalStates({ goalStates = [], goalOutcomes = {}, turnSpec = null, runStatus } = {}) {
  const goalsById = new Map((turnSpec?.goals || []).map((goal) => [String(goal.id), goal]));
  return Object.freeze(
    (Array.isArray(goalStates) ? goalStates : []).map((goalState) => {
      const goalId = String(goalState?.goalId || '');
      const currentStatus = String(goalState?.status || 'pending');
      if (FIXED_GOAL_STATES.has(currentStatus)) return Object.freeze({ ...goalState, status: currentStatus });
      const observedStatus = String(goalOutcomes?.[goalId] || '');
      if (observedStatus) return Object.freeze({ ...goalState, status: observedStatus });
      const goal = goalsById.get(goalId);
      let status = currentStatus;
      if (runStatus === 'awaiting_confirmation' && ['write', 'transform'].includes(goal?.kind)) {
        status = 'awaiting_confirmation';
      } else if (runStatus === 'awaiting_interaction') {
        status = 'awaiting_interaction';
      } else if (['clarification', 'cancelled', 'failed', 'unknown'].includes(runStatus)) {
        status = runStatus;
      } else if (runStatus === 'completed') {
        status = 'completed';
      }
      return Object.freeze({ ...goalState, status });
    }),
  );
}

export function deriveAgentRunStatus(requestedStatus, goalStates = []) {
  if (['cancelled', 'failed', 'unknown'].includes(requestedStatus)) return requestedStatus;
  const statuses = (Array.isArray(goalStates) ? goalStates : []).map((item) => String(item?.status || ''));
  if (statuses.includes('awaiting_confirmation')) return 'awaiting_confirmation';
  if (statuses.includes('awaiting_interaction')) return 'awaiting_interaction';
  if (requestedStatus === 'clarification' || statuses.includes('clarification')) return 'clarification';

  const hasCompleted = statuses.includes('completed');
  const hasFailure = statuses.some((status) => FAILURE_GOAL_STATES.has(status));
  const hasUnsupported = statuses.some((status) => FIXED_GOAL_STATES.has(status));
  if ((hasFailure || hasUnsupported) && hasCompleted) return 'partial';
  if (hasFailure) return statuses.includes('unknown') ? 'unknown' : 'failed';
  if (hasUnsupported && statuses.every((status) => FIXED_GOAL_STATES.has(status))) {
    return statuses.includes('forbidden') ? 'forbidden' : 'unsupported';
  }
  return requestedStatus || 'completed';
}
