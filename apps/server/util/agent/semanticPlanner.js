export const SEMANTIC_PLAN_TOOL_NAME = 'submit_agent_plan';
export const SEMANTIC_PLAN_VERSION = '1.0';

const REQUEST_CLASSES = new Set(['conversation', 'product_help', 'data_query', 'data_action', 'mixed', 'ambiguous']);
const INTENT_KINDS = new Set(['read', 'write']);
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);
const MAX_INTENTS = 4;
const MAX_TOOL_CALLS = 8;
const MAX_DEPENDENCY_DEPTH = 3;
const MAX_GOAL_LENGTH = 240;
const MAX_TARGET_LENGTH = 240;
const MAX_CLARIFICATION_LENGTH = 300;

function normalizeString(value, maxLength) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function capabilityMap(catalog) {
  return new Map((Array.isArray(catalog) ? catalog : []).map((entry) => [String(entry?.id || ''), entry]));
}

function capabilityByToolMap(catalog) {
  const byTool = new Map();
  for (const entry of Array.isArray(catalog) ? catalog : []) {
    for (const toolName of entry?.toolNames || []) {
      if (!byTool.has(toolName)) byTool.set(toolName, entry);
    }
  }
  return byTool;
}

function safeParseToolArguments(call) {
  try {
    const parsed = JSON.parse(String(call?.function?.arguments || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeEmbeddedToolCalls(rawToolCalls, catalog, { toolCallIdPrefix = 'semantic-plan-tool' } = {}) {
  if (!Array.isArray(rawToolCalls) || rawToolCalls.length > MAX_TOOL_CALLS) return null;
  const byTool = capabilityByToolMap(catalog);
  const calls = [];
  for (const [index, rawCall] of rawToolCalls.entries()) {
    if (!rawCall || typeof rawCall !== 'object' || Array.isArray(rawCall)) return null;
    const toolName = String(rawCall.toolName || '').trim();
    const args = rawCall.arguments;
    const capability = byTool.get(toolName);
    if (
      !toolName ||
      !capability ||
      capability.status !== 'enabled' ||
      !args ||
      typeof args !== 'object' ||
      Array.isArray(args)
    ) {
      return null;
    }
    calls.push({
      id: `${String(toolCallIdPrefix || 'semantic-plan-tool').slice(0, 80)}-${index + 1}`,
      type: 'function',
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    });
  }
  return calls;
}

function normalizeIntent(raw, index, catalogById, { dependenciesAlreadySatisfied = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const kind = INTENT_KINDS.has(raw.kind) ? raw.kind : '';
  const capabilityId = String(raw.capabilityId || '').trim();
  const capability = catalogById.get(capabilityId) || null;
  if (!Array.isArray(raw.dependsOn) || raw.dependsOn.length > MAX_INTENTS) return null;
  const rawDependencies = raw.dependsOn.map((value) => Number(value));
  if (rawDependencies.some((value) => !Number.isInteger(value) || value < 0 || value >= MAX_INTENTS)) {
    return null;
  }
  // 依赖只能指向前面的 intent，天然形成拓扑序；禁止未来依赖、自依赖和循环依赖
  // 被静默“修正”后继续执行。唯一例外是服务端已经按原始 DAG 证明前置条件全部满足的
  // 依赖轮；该轮只暴露 ready 能力，模型偶尔复述的旧下标不再具有当前计划内含义，可安全归零。
  if (!dependenciesAlreadySatisfied && rawDependencies.some((value) => value >= index)) return null;
  const dependsOn = dependenciesAlreadySatisfied ? [] : [...new Set(rawDependencies)];
  if (!kind || (!capability && capabilityId !== 'unknown') || (capability && capability.effect !== kind)) {
    return null;
  }
  return {
    kind,
    capabilityId,
    goal: normalizeString(raw.goal, MAX_GOAL_LENGTH),
    targetDescription: normalizeString(raw.targetDescription, MAX_TARGET_LENGTH),
    dependsOn,
  };
}

function normalizePlan(raw, catalog, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (String(raw.version || '') !== SEMANTIC_PLAN_VERSION) return null;
  if (!REQUEST_CLASSES.has(raw.requestClass)) return null;
  if (!CONFIDENCE_LEVELS.has(raw.confidence)) return null;
  if (!Array.isArray(raw.intents) || raw.intents.length > MAX_INTENTS) return null;
  const byId = capabilityMap(catalog);
  const intents = raw.intents.map((intent, index) => normalizeIntent(intent, index, byId, options)).filter(Boolean);
  if (intents.length !== raw.intents.length) return null;
  // 调度器按 capabilityId 记录完成状态，同一计划重复声明同一能力会让依赖归属变得含糊。
  // 同时限制最长依赖链为一次请求允许的 3 轮工具，避免接受一个注定无法完成的计划。
  if (new Set(intents.map((intent) => intent.capabilityId)).size !== intents.length) return null;
  // Agent 主请求里的写工具只生成确认卡，并没有真正提交数据，所以任何后续步骤都不能
  // 把 write intent 当成“已完成依赖”。允许的拓扑只有 read→read 与 read→write；
  // write→read / write→write 会造成确认前继续执行或静默丢步骤，必须整体拒绝。
  if (intents.some((intent) => intent.dependsOn.some((dependencyIndex) => intents[dependencyIndex]?.kind !== 'read'))) {
    return null;
  }
  const dependencyDepths = [];
  for (const intent of intents) {
    dependencyDepths.push(
      1 + Math.max(0, ...intent.dependsOn.map((dependencyIndex) => dependencyDepths[dependencyIndex] || 0)),
    );
  }
  if (dependencyDepths.some((depth) => depth > MAX_DEPENDENCY_DEPTH)) return null;
  const needsClarification = raw.needsClarification === true;
  const clarificationQuestion = normalizeString(raw.clarificationQuestion, MAX_CLARIFICATION_LENGTH);
  if (needsClarification && !clarificationQuestion) return null;
  let requestClass = raw.requestClass;
  if (
    options.dependenciesAlreadySatisfied &&
    !needsClarification &&
    ['data_query', 'data_action', 'mixed'].includes(requestClass) &&
    intents.length > 0
  ) {
    const hasRead = intents.some((intent) => intent.kind === 'read');
    const hasWrite = intents.some((intent) => intent.kind === 'write');
    requestClass = hasRead && hasWrite ? 'mixed' : hasWrite ? 'data_action' : 'data_query';
  }
  return Object.freeze({
    version: SEMANTIC_PLAN_VERSION,
    requestClass,
    confidence: raw.confidence,
    intents: Object.freeze(intents.map((intent) => Object.freeze(intent))),
    needsClarification,
    clarificationQuestion,
  });
}

function derivePlanFromToolCalls(toolCalls, catalog) {
  const byTool = capabilityByToolMap(catalog);
  const capabilities = [];
  for (const call of toolCalls) {
    const entry = byTool.get(String(call?.function?.name || ''));
    if (entry && !capabilities.some((item) => item.id === entry.id)) capabilities.push(entry);
  }
  if (!capabilities.length) return null;
  const hasWrite = capabilities.some((entry) => entry.effect === 'write');
  const hasRead = capabilities.some((entry) => entry.effect === 'read');
  return Object.freeze({
    version: SEMANTIC_PLAN_VERSION,
    requestClass: hasWrite && hasRead ? 'mixed' : hasWrite ? 'data_action' : 'data_query',
    confidence: 'medium',
    intents: Object.freeze(
      capabilities.map((entry) =>
        Object.freeze({
          kind: entry.effect,
          capabilityId: entry.id,
          goal: '',
          targetDescription: '',
          dependsOn: [],
        }),
      ),
    ),
    needsClarification: false,
    clarificationQuestion: '',
  });
}

function buildEmbeddedToolCallSchema(catalog, tools) {
  const enabledToolNames = new Set(
    uniqueStrings(
      (catalog || []).filter((entry) => entry?.status === 'enabled').flatMap((entry) => entry?.toolNames || []),
    ),
  );
  const variants = (Array.isArray(tools) ? tools : [])
    .filter((tool) => enabledToolNames.has(String(tool?.name || '')) && tool?.parameters)
    .map((tool) => ({
      type: 'object',
      additionalProperties: false,
      properties: {
        toolName: {
          type: 'string',
          enum: [tool.name],
          description: tool.description || tool.name,
        },
        arguments: tool.parameters,
      },
      required: ['toolName', 'arguments'],
    }));

  if (variants.length === 1) return variants[0];
  if (variants.length > 1) return { oneOf: variants };

  // 兼容只构造能力目录的离线调用方；生产主链始终传入注册后的真实工具，
  // 因此 arguments 会被上面的逐工具 schema 约束。
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      toolName: { type: 'string', enum: [...enabledToolNames] },
      arguments: {
        type: 'object',
        description: '必须符合对应真实工具参数 schema 的完整参数对象。',
        additionalProperties: true,
      },
    },
    required: ['toolName', 'arguments'],
  };
}

export function buildSemanticPlanToolDefinition(catalog, tools = [], { dependenciesAlreadySatisfied = false } = {}) {
  const capabilityIds = uniqueStrings([...(catalog || []).map((entry) => entry?.id), 'unknown']);
  return {
    type: 'function',
    function: {
      name: SEMANTIC_PLAN_TOOL_NAME,
      description:
        '提交本轮唯一的结构化语义计划，并在 toolCalls 中列出需要执行的真实工具及参数。每轮必须调用且只能调用一次；计划本身不执行数据操作。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          version: { type: 'string', enum: [SEMANTIC_PLAN_VERSION] },
          requestClass: { type: 'string', enum: [...REQUEST_CLASSES] },
          confidence: { type: 'string', enum: [...CONFIDENCE_LEVELS] },
          intents: {
            type: 'array',
            maxItems: MAX_INTENTS,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', enum: [...INTENT_KINDS] },
                capabilityId: { type: 'string', enum: capabilityIds },
                goal: { type: 'string', maxLength: MAX_GOAL_LENGTH },
                targetDescription: { type: 'string', maxLength: MAX_TARGET_LENGTH },
                dependsOn: {
                  type: 'array',
                  maxItems: dependenciesAlreadySatisfied ? 0 : MAX_INTENTS,
                  items: { type: 'integer', minimum: 0, maximum: MAX_INTENTS - 1 },
                  description: dependenciesAlreadySatisfied
                    ? '服务端已经确认本轮能力的全部前置依赖，本轮必须传空数组。'
                    : '当前计划内排在本 intent 前面的依赖下标。',
                },
              },
              required: ['kind', 'capabilityId', 'goal', 'targetDescription', 'dependsOn'],
            },
          },
          needsClarification: { type: 'boolean' },
          clarificationQuestion: { type: 'string', maxLength: MAX_CLARIFICATION_LENGTH },
          toolCalls: {
            type: 'array',
            maxItems: MAX_TOOL_CALLS,
            description:
              '本轮立即可执行的真实工具调用。无依赖的 enabled intent 必须给出对应工具和完整参数；dependsOn 尚未满足的 intent 本轮不得提前调用，服务端会在真实结果返回后重新规划。闲聊、澄清、planned、forbidden、unavailable、unknown 能力必须为空数组。',
            items: buildEmbeddedToolCallSchema(catalog, tools),
          },
        },
        required: [
          'version',
          'requestClass',
          'confidence',
          'intents',
          'needsClarification',
          'clarificationQuestion',
          'toolCalls',
        ],
      },
    },
  };
}

export function formatSemanticCapabilityCatalog(catalog) {
  return (Array.isArray(catalog) ? catalog : [])
    .map((entry) => {
      const tools = entry.toolNames?.length ? `；工具=${entry.toolNames.join(',')}` : '';
      const guidance = entry.guidance ? `；边界=${entry.guidance}` : '';
      return `- ${entry.id}｜${entry.effect}｜${entry.status}｜${entry.description}${tools}${guidance}`;
    })
    .join('\n');
}

export function parseSemanticPlannerResponse(plannerResponse, catalog, options = {}) {
  const allCalls = Array.isArray(plannerResponse?.toolCalls) ? plannerResponse.toolCalls : [];
  const planCalls = allCalls.filter((call) => call?.function?.name === SEMANTIC_PLAN_TOOL_NAME);
  const providerToolCalls = allCalls.filter((call) => call?.function?.name !== SEMANTIC_PLAN_TOOL_NAME);
  const parsed = planCalls.length === 1 ? safeParseToolArguments(planCalls[0]) : null;
  const semanticPlan = normalizePlan(parsed, catalog, options);
  const embeddedToolCalls = semanticPlan ? normalizeEmbeddedToolCalls(parsed?.toolCalls, catalog, options) : null;
  const hasConflictingCallChannels =
    Array.isArray(embeddedToolCalls) && embeddedToolCalls.length > 0 && providerToolCalls.length > 0;
  const byTool = capabilityByToolMap(catalog);
  const hasUnsafeProviderToolCalls = providerToolCalls.some(
    (call) => byTool.get(String(call?.function?.name || ''))?.effect !== 'read',
  );
  const validSemanticPlan =
    semanticPlan && Array.isArray(embeddedToolCalls) && !hasConflictingCallChannels && !hasUnsafeProviderToolCalls
      ? semanticPlan
      : null;
  // 新协议把业务调用封装进唯一的 submit_agent_plan，避免依赖 Provider 在同一轮并行调用
  // “元计划 + 真实工具”。旧 Provider 若仍返回空内嵌数组 + 独立只读调用，则保守兼容。
  const toolCalls =
    Array.isArray(embeddedToolCalls) && embeddedToolCalls.length > 0 ? embeddedToolCalls : providerToolCalls;
  // 只有 Provider 完全漏掉 meta call、但给出了可核验的只读调用时才兼容派生。
  // 显式但格式无效/重复的计划必须失败关闭；写工具绝不允许绕过 Intent Envelope。
  const derivedPlan = planCalls.length === 0 ? derivePlanFromToolCalls(toolCalls, catalog) : null;
  const safeDerivedPlan = derivedPlan?.intents.some((intent) => intent.kind === 'write') ? null : derivedPlan;
  const plan = validSemanticPlan || safeDerivedPlan;
  return {
    plan,
    toolCalls,
    source: validSemanticPlan ? 'semantic' : safeDerivedPlan ? 'tool_calls' : 'missing',
    invalidPlan: planCalls.length !== 1 || !validSemanticPlan,
  };
}

function policyPriority(status) {
  if (status === 'forbidden') return 4;
  if (status === 'unavailable') return 3;
  if (status === 'planned') return 2;
  return 0;
}

function intentDependsOn(intents, intentIndex, dependencyIndex, visited = new Set()) {
  if (intentIndex === dependencyIndex || visited.has(intentIndex)) return false;
  visited.add(intentIndex);
  const dependencies = intents[intentIndex]?.dependsOn || [];
  return dependencies.some(
    (index) => index === dependencyIndex || intentDependsOn(intents, index, dependencyIndex, new Set(visited)),
  );
}

export function adjudicateSemanticPlan({ plan, toolCalls = [], catalog = [] } = {}) {
  const byId = capabilityMap(catalog);
  const byTool = capabilityByToolMap(catalog);
  const selected = [];
  const selectedIds = new Set();
  for (const intent of plan?.intents || []) {
    const capability = byId.get(intent.capabilityId) || null;
    if (capability && !selectedIds.has(capability.id)) {
      selected.push(capability);
      selectedIds.add(capability.id);
    }
  }

  if (plan?.needsClarification || plan?.requestClass === 'ambiguous' || plan?.confidence === 'low') {
    return {
      state: 'clarification',
      resolution: 'ambiguous',
      plan,
      capabilities: selected,
      toolCalls: [],
      writeToolNames: [],
      message: plan?.clarificationQuestion || '我还不能确定你想查询还是修改数据，请再具体说明一下。',
    };
  }

  const planIntents = plan?.intents || [];
  const dataActionReadIndexes = planIntents
    .map((intent, index) => ({ intent, index }))
    .filter(({ intent }) => intent.kind === 'read')
    .map(({ index }) => index);
  const dataActionWriteIndexes = planIntents
    .map((intent, index) => ({ intent, index }))
    .filter(({ intent }) => intent.kind === 'write')
    .map(({ index }) => index);
  const dataActionReadsOnlySupportWrites = dataActionReadIndexes.every((readIndex) =>
    dataActionWriteIndexes.some((writeIndex) => intentDependsOn(planIntents, writeIndex, readIndex)),
  );

  if (
    plan &&
    ((plan.requestClass === 'conversation' && plan.intents.length > 0) ||
      (plan.requestClass === 'product_help' && plan.intents.some((intent) => intent.kind === 'write')) ||
      (plan.requestClass === 'data_query' && plan.intents.some((intent) => intent.kind === 'write')) ||
      (plan.requestClass === 'data_action' && dataActionReadIndexes.length > 0 && !dataActionReadsOnlySupportWrites))
  ) {
    return {
      state: 'blocked',
      resolution: 'semantic_conflict',
      plan,
      capabilities: selected,
      toolCalls: [],
      writeToolNames: [],
    };
  }

  const policyCapability = [...selected].sort(
    (left, right) => policyPriority(right.status) - policyPriority(left.status),
  )[0];
  if (policyCapability && policyPriority(policyCapability.status) > 0) {
    return {
      state: 'blocked',
      resolution: policyCapability.status === 'unavailable' ? 'forbidden_context' : policyCapability.status,
      plan,
      capabilities: [policyCapability],
      toolCalls: [],
      writeToolNames: [],
    };
  }

  const hasUnknownWrite =
    (plan?.intents || []).some((intent) => intent.kind === 'write' && intent.capabilityId === 'unknown') ||
    (['data_action', 'mixed'].includes(plan?.requestClass) &&
      !selected.some((capability) => capability.effect === 'write'));
  if (hasUnknownWrite) {
    return {
      state: 'blocked',
      resolution: 'unknown_mutation',
      plan,
      capabilities: [],
      toolCalls: [],
      writeToolNames: [],
    };
  }

  const hasUnknownRead =
    (plan?.intents || []).some((intent) => intent.kind === 'read' && intent.capabilityId === 'unknown') ||
    (['product_help', 'data_query', 'mixed'].includes(plan?.requestClass) &&
      !selected.some((capability) => capability.effect === 'read'));
  if (hasUnknownRead) {
    return {
      state: 'blocked',
      resolution: 'unknown_query',
      plan,
      capabilities: [],
      toolCalls: [],
      writeToolNames: [],
    };
  }

  const immediateCapabilityIds = new Set(
    (plan?.intents || []).filter((intent) => intent.dependsOn.length === 0).map((intent) => intent.capabilityId),
  );
  const deferredCapabilityIds = [
    ...new Set(
      (plan?.intents || []).filter((intent) => intent.dependsOn.length > 0).map((intent) => intent.capabilityId),
    ),
  ];
  const selectedToolNames = new Set(selected.flatMap((capability) => capability.toolNames || []));
  const allowedCalls = [];
  const immediateCallCounts = new Map();
  let conflict = false;
  for (const call of toolCalls) {
    const toolName = String(call?.function?.name || '');
    const capability = byTool.get(toolName);
    if (!capability || capability.status !== 'enabled' || (plan && !selectedToolNames.has(toolName))) {
      conflict = true;
      continue;
    }
    // 依赖尚未完成的 intent 即使被模型提前填出了参数也不能执行。保留其能力 ID，
    // 由后续轮在拿到真实工具结果后重新规划，而不是信任本轮猜出的目标。
    if (!immediateCapabilityIds.has(capability.id)) continue;
    const nextCount = (immediateCallCounts.get(capability.id) || 0) + 1;
    immediateCallCounts.set(capability.id, nextCount);
    // 一个计划只允许声明一次同一写能力，因此同轮也只能有一次对应写调用。
    // 否则模型可借一个 intent 批量生成多个确认。读取能力仍允许多参数并发查询。
    if (capability.effect === 'write' && nextCount > 1) {
      conflict = true;
      continue;
    }
    allowedCalls.push(call);
  }
  if (conflict) {
    return {
      state: 'blocked',
      resolution: 'semantic_conflict',
      plan,
      capabilities: selected,
      toolCalls: [],
      writeToolNames: [],
    };
  }

  const writeCapabilities = selected.filter((capability) => capability.effect === 'write');
  const readCapabilities = selected.filter((capability) => capability.effect === 'read');
  const immediateWriteCapabilities = writeCapabilities.filter((capability) =>
    immediateCapabilityIds.has(capability.id),
  );
  const immediateReadCapabilities = readCapabilities.filter((capability) => immediateCapabilityIds.has(capability.id));
  const actualToolNames = new Set(allowedCalls.map((call) => call?.function?.name));
  const missingWriteCall =
    immediateWriteCapabilities.length > 0 &&
    !immediateWriteCapabilities.every((capability) =>
      capability.toolNames.some((toolName) => actualToolNames.has(toolName)),
    );
  if (missingWriteCall) {
    return {
      state: 'blocked',
      resolution: 'unverified',
      plan,
      capabilities: immediateWriteCapabilities,
      toolCalls: [],
      writeToolNames: writeCapabilities.flatMap((capability) => capability.toolNames),
    };
  }
  const missingReadCall =
    immediateReadCapabilities.length > 0 &&
    !immediateReadCapabilities.every((capability) =>
      capability.toolNames.some((toolName) => actualToolNames.has(toolName)),
    );
  if (missingReadCall) {
    return {
      state: 'blocked',
      resolution: 'unverified_query',
      plan,
      capabilities: readCapabilities,
      toolCalls: [],
      writeToolNames: [],
    };
  }

  return {
    state: 'ready',
    resolution: 'enabled',
    plan,
    capabilities: selected,
    toolCalls: allowedCalls,
    writeToolNames: writeCapabilities.flatMap((capability) => capability.toolNames),
    deferredCapabilityIds,
  };
}

export function buildSemanticPolicyMessage(outcome, locale = 'zh-CN') {
  const english = String(locale || '')
    .toLowerCase()
    .startsWith('en');
  const capability = outcome?.capabilities?.[0] || null;
  const language = english ? 'en' : 'zh';
  const label = String(capability?.labels?.[language] || capability?.label || capability?.description || '').trim();
  const rawGuidance =
    capability?.guidanceByLocale?.[language] ??
    capability?.guidance?.[language] ??
    (typeof capability?.guidance === 'string' ? capability.guidance : '');
  const guidance = String(rawGuidance || '').trim();
  switch (outcome?.resolution) {
    case 'planned':
      return english
        ? `AI does not currently support ${label || 'this operation'}, so nothing was executed.`
        : `当前 AI 暂不支持“${label || '这项操作'}”，因此没有执行任何操作。${guidance ? ` ${guidance}` : ''}`;
    case 'forbidden':
      return english
        ? `AI is not allowed to perform ${label || 'this operation'} for safety reasons. Nothing was changed.`
        : `出于安全原因，AI 不允许执行“${label || '这项操作'}”。本次没有修改任何数据。${guidance ? ` ${guidance}` : ''}`;
    case 'forbidden_context':
      return english
        ? 'This capability is unavailable in the current account or access mode. Nothing was executed.'
        : '当前账号或访问模式不能使用这项能力，本次没有执行任何操作。';
    case 'unknown_mutation':
      return english
        ? 'This is a request to change data, but no registered executable capability matches it. Nothing was executed.'
        : '这是一个数据修改请求，但当前没有匹配的已注册可执行能力，因此没有执行任何操作。';
    case 'unknown_query':
      return english
        ? 'AI cannot currently query that data source, so no result was fabricated.'
        : '当前 AI 还不能查询这类数据，因此没有编造查询结果。';
    case 'unverified_query':
      return english
        ? 'The required data query was not executed, so AI cannot provide a reliable answer. Please try again.'
        : '本轮没有成功发起必要的数据查询，因此无法提供可靠答案，请重试。';
    case 'semantic_conflict':
      return english
        ? 'The semantic plan conflicted with the proposed tool action, so the request was stopped safely. Nothing was executed.'
        : 'AI 的语义判断与拟调用能力不一致，本次已安全停止，没有执行任何操作，请更明确地说明目标后重试。';
    case 'semantic_plan_missing':
      return english
        ? 'AI did not return a verifiable semantic plan, so no query or action was performed. Please try again.'
        : 'AI 没有返回可核验的语义计划，本轮未执行查询或修改，请重试。';
    case 'dependency_failed':
      return english
        ? 'The prerequisite query did not produce a reliable target, so no confirmation was created and nothing was changed.'
        : '前置查询未能确定可靠目标，因此没有生成操作确认，也没有修改任何数据。';
    case 'dependency_incomplete':
      return english
        ? 'The dependent task could not be completed within this request. No confirmation was created and nothing was changed.'
        : '本轮未能完成全部依赖步骤，因此没有生成操作确认，也没有修改任何数据。';
    case 'unverified':
    default:
      return english
        ? 'The action was not executed because no verifiable confirmation was produced.'
        : '该操作尚未执行：服务端没有生成可核验的确认，请明确目标后重试。';
  }
}
