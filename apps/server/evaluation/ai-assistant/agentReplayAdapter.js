function usage(totalTokens = 1) {
  return { promptTokens: totalTokens, completionTokens: 0, totalTokens };
}

function semanticPlanCall(plan, index) {
  return {
    id: `replay-semantic-plan-${index + 1}`,
    type: 'function',
    function: {
      name: 'submit_agent_plan',
      arguments: JSON.stringify({
        version: '1.0',
        confidence: 'high',
        needsClarification: false,
        clarificationQuestion: '',
        toolCalls: [],
        ...plan,
      }),
    },
  };
}

function noteDraftCall(draft, index) {
  return {
    id: `replay-note-draft-${index + 1}`,
    type: 'function',
    function: {
      name: 'submit_note_draft',
      arguments: JSON.stringify(draft || {}),
    },
  };
}

/** 笔记入口的受约束语义分类：决定本轮是否进入统一草稿协议。 */
function noteDraftTaskCall(task, index) {
  return {
    id: `replay-note-draft-task-${index + 1}`,
    type: 'function',
    function: {
      name: 'classify_note_draft_task',
      arguments: JSON.stringify({
        producesNote: task?.producesNote !== false,
        otherMutations: task?.otherMutations === true,
        needsWorkspaceRetrieval: task?.needsWorkspaceRetrieval === true,
        workspaceQueries: Array.isArray(task?.workspaceQueries) ? task.workspaceQueries : [],
      }),
    },
  };
}

export function buildReplayProviderResponses(steps = []) {
  return steps.map((step, index) => ({
    content: String(step.content || ''),
    toolCalls: step.plan
      ? [semanticPlanCall(step.plan, index)]
      : step.draft
        ? [noteDraftCall(step.draft, index)]
        : step.task
          ? [noteDraftTaskCall(step.task, index)]
          : [],
    usage: usage(Number(step.totalTokens || 1)),
    usageStatus: 'reported',
    finishReason: step.plan || step.draft || step.task ? 'tool_calls' : 'stop',
  }));
}

export function evaluateAgentReplayObservation(replayCase, observation) {
  const errors = [];
  const response = String(observation.response || '');
  const stages = Array.isArray(observation.providerStages) ? observation.providerStages : [];
  const confirmations = Array.isArray(observation.confirmations) ? observation.confirmations : [];
  const executedTools = Array.isArray(observation.executedTools) ? observation.executedTools : [];
  const expected = replayCase.expected || {};

  if (Number.isInteger(expected.providerCalls) && stages.length !== expected.providerCalls) {
    errors.push(`Provider 调用应为 ${expected.providerCalls} 次，实际 ${stages.length} 次`);
  }
  for (const stage of expected.requiredStages || []) {
    if (!stages.includes(stage)) errors.push(`缺少 Provider 阶段 ${stage}`);
  }
  for (const toolName of expected.requiredExecutedTools || []) {
    if (!executedTools.includes(toolName)) errors.push(`未执行预期读取工具 ${toolName}`);
  }
  if (Number.isInteger(expected.confirmations) && confirmations.length !== expected.confirmations) {
    errors.push(`确认卡应为 ${expected.confirmations} 张，实际 ${confirmations.length} 张`);
  }
  for (const text of expected.responseIncludes || []) {
    if (!response.includes(text)) errors.push(`回答缺少“${text}”`);
  }
  for (const text of expected.responseExcludes || []) {
    if (response.includes(text)) errors.push(`回答不应包含“${text}”`);
  }
  return { id: replayCase.id, passed: errors.length === 0, errors, observation };
}

export async function runAgentReplayCase(replayCase, { setProviderResponses, invokeAgent, observe }) {
  const responses = buildReplayProviderResponses(replayCase.providerSteps);
  setProviderResponses(responses);
  const runtime = await invokeAgent(replayCase.request);
  return evaluateAgentReplayObservation(replayCase, observe(runtime));
}
