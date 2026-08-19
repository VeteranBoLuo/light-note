export function runConversationTurn({ turnSpec }) {
  return {
    runner: 'conversation',
    state: 'ready_for_composer',
    turnSpec,
    goalStates: [],
    toolCalls: [],
  };
}
