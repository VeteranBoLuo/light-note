import { requestAi } from '../aiGateway.js';

export const EXECUTION_PLAN_VERSION = '2.0';
export const EXECUTION_PLAN_TOOL_NAME = 'submit_execution_plan';

function embeddedStepSchema(candidateTools) {
  const variants = (Array.isArray(candidateTools) ? candidateTools : []).map((tool) => ({
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 64 },
      goalId: { type: 'string', minLength: 1, maxLength: 40 },
      toolName: { type: 'string', enum: [tool.name] },
      arguments: tool.parameters || { type: 'object', additionalProperties: false },
      dependsOn: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 64 } },
      expectedResultKind: { type: 'string', minLength: 1, maxLength: 80 },
    },
    required: ['id', 'goalId', 'toolName', 'arguments', 'dependsOn', 'expectedResultKind'],
  }));
  if (variants.length === 1) return variants[0];
  return { oneOf: variants };
}

export function buildExecutionPlanToolDefinition({ turnSpec, candidateTools = [] } = {}) {
  return {
    type: 'function',
    function: {
      name: EXECUTION_PLAN_TOOL_NAME,
      description: '在不可变 TurnSpec 范围内提交执行步骤。不能增加目标、材料范围或输出要求。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          version: { type: 'string', enum: [EXECUTION_PLAN_VERSION] },
          turnSpecDigest: { type: 'string', enum: [turnSpec?.digest || 'missing'] },
          steps: {
            type: 'array',
            maxItems: 8,
            items: embeddedStepSchema(candidateTools),
          },
          deferredGoalIds: {
            type: 'array',
            maxItems: 4,
            items: { type: 'string', enum: (turnSpec?.goals || []).map((goal) => goal.id) },
          },
          unsupportedGoalIds: {
            type: 'array',
            maxItems: 4,
            items: { type: 'string', enum: (turnSpec?.goals || []).map((goal) => goal.id) },
          },
        },
        required: ['version', 'turnSpecDigest', 'steps', 'deferredGoalIds', 'unsupportedGoalIds'],
      },
    },
  };
}

function parseArguments(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasOnlyKeys(value, keys) {
  return (
    value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key))
  );
}

export function parseExecutionPlannerResponse(response) {
  const calls = Array.isArray(response?.toolCalls) ? response.toolCalls : [];
  const planCalls = calls.filter((call) => call?.function?.name === EXECUTION_PLAN_TOOL_NAME);
  const extraCalls = calls.filter((call) => call?.function?.name !== EXECUTION_PLAN_TOOL_NAME);
  if (planCalls.length !== 1) return { plan: null, extraCalls, invalid: true };
  const raw = parseArguments(planCalls[0]?.function?.arguments);
  if (!raw || raw.version !== EXECUTION_PLAN_VERSION) return { plan: null, extraCalls, invalid: true };
  if (!hasOnlyKeys(raw, ['version', 'turnSpecDigest', 'steps', 'deferredGoalIds', 'unsupportedGoalIds'])) {
    return { plan: null, extraCalls, invalid: true };
  }
  if (!Array.isArray(raw.steps) || raw.steps.length > 8) return { plan: null, extraCalls, invalid: true };
  if (
    raw.steps.some(
      (step) =>
        !hasOnlyKeys(step, ['id', 'goalId', 'toolName', 'arguments', 'dependsOn', 'expectedResultKind']) ||
        !String(step.id || '').trim() ||
        !Array.isArray(step.dependsOn) ||
        !String(step.expectedResultKind || '').trim(),
    )
  ) {
    return { plan: null, extraCalls, invalid: true };
  }
  if (!Array.isArray(raw.deferredGoalIds) || !Array.isArray(raw.unsupportedGoalIds)) {
    return { plan: null, extraCalls, invalid: true };
  }
  return {
    plan: {
      version: EXECUTION_PLAN_VERSION,
      turnSpecDigest: String(raw.turnSpecDigest || ''),
      steps: raw.steps,
      deferredGoalIds: [...new Set(raw.deferredGoalIds.map(String))],
      unsupportedGoalIds: [...new Set(raw.unsupportedGoalIds.map(String))],
    },
    extraCalls,
    invalid: false,
  };
}

function plannerPrompt(repair = false) {
  return [
    '你是轻笺 Agent 的 Execution Planner。TurnSpec 是不可变的唯一意图；只能为其中目标填写候选工具参数。',
    '不得增加目标、扩大材料范围、改变 OutputContract，不能把历史中的旧动作当成本轮目标。',
    '依赖未满足的目标写入 deferredGoalIds，不得猜测目标 ID 或提前调用。',
    '候选工具缺少会改变结果的必需参数时，不得猜值；不要为该目标生成 step。',
    repair ? '上一次执行计划未通过服务端校验；请严格按同一 TurnSpec 修复。' : '',
    `必须且只能调用 ${EXECUTION_PLAN_TOOL_NAME}，不要输出普通文本或额外工具调用。`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function planAgentExecution({
  turnSpec,
  route,
  completedGoalIds = [],
  dependencyResults = [],
  signal,
  traceId = '',
  stagePrefix = 'execution_planner',
  request = requestAi,
  validate,
  onResponse,
} = {}) {
  if (!turnSpec || route?.state !== 'ready') return { plan: null, validation: null, attempts: 0 };
  const candidateTools = route.candidates || [];
  const payload = {
    turnSpec: {
      version: turnSpec.version,
      digest: turnSpec.digest,
      requestKind: turnSpec.requestKind,
      goals: turnSpec.goals,
      groundingPolicy: turnSpec.groundingPolicy,
      outputContract: turnSpec.outputContract,
    },
    completedGoalIds: [...new Set(completedGoalIds.map(String))],
    dependencyResults,
    candidateCapabilities: route.goalRoutes,
  };
  let lastValidation = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await request(
      [
        { role: 'system', content: plannerPrompt(attempt > 1) },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      {
        tools: [buildExecutionPlanToolDefinition({ turnSpec, candidateTools })],
        toolChoice: { type: 'function', function: { name: EXECUTION_PLAN_TOOL_NAME } },
        signal,
        maxTokens: 2_500,
        temperature: 0,
        trace: { traceId, stage: attempt === 1 ? stagePrefix : `${stagePrefix}_repair` },
      },
    );
    onResponse?.(response, attempt);
    const parsed = parseExecutionPlannerResponse(response);
    lastValidation = validate?.({ turnSpec, route, parsed, completedGoalIds }) || {
      valid: !parsed.invalid,
      toolCalls: [],
      issues: parsed.invalid ? ['execution_plan_invalid'] : [],
    };
    if (lastValidation.valid) return { plan: parsed.plan, validation: lastValidation, attempts: attempt };
  }
  return { plan: null, validation: lastValidation, attempts: 2 };
}
