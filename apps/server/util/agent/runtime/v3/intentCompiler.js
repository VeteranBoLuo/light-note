import { requestAi } from '../../aiGateway.js';
import { buildTurnSpecV3ToolDefinition, parseTurnSpecV3Response, TURN_SPEC_V3_TOOL_NAME } from './turnSpec.js';
import { extractTemporalMentionsV3 } from './temporalConstraints.js';

const MAX_COMPILER_ATTEMPTS = 2;
const MAX_LATEST_MESSAGE_CHARS = 4_000;

export class IntentCompilerV3Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IntentCompilerV3Error';
    this.code = code;
  }
}

function compactCatalog(catalog) {
  return (Array.isArray(catalog) ? catalog : []).map((entry) => ({
    id: entry.id,
    label: entry.label,
    domains: entry.domains,
    acceptedSourceDomains: entry.acceptedSourceDomains,
    effect: entry.effect,
    operations: entry.operations,
    status: entry.status,
    requiredSlots: entry.requiredSlots,
    dependencies: entry.dependencies,
    acceptedInputKinds: entry.acceptedInputKinds,
    scopePolicy: entry.scopePolicy,
    artifactKind: entry.artifactKind,
    temporalSlots: entry.temporalSlots,
    description: String(entry.description || '').slice(0, 260),
  }));
}

function compactDiscourseProjection(value = {}) {
  const compactResultSet = (item) =>
    item
      ? Object.freeze({
          available: item.available === true,
          handleId: String(item.handleId || '').slice(0, 64),
          domains: Object.freeze(
            [...new Set((Array.isArray(item.domains) ? item.domains : []).map(String))].slice(0, 8),
          ),
          refTypes: Object.freeze(
            [...new Set((Array.isArray(item.refTypes) ? item.refTypes : []).map(String))].slice(0, 8),
          ),
          refCount: Math.max(0, Number(item.refCount) || 0),
        })
      : null;
  return Object.freeze({
    schemaVersion: 3,
    revision: Math.max(0, Number(value.revision) || 0),
    topicEpoch: Math.max(0, Number(value.topicEpoch) || 0),
    activeDomain: String(value.activeDomain || ''),
    lastCapabilityIds: Object.freeze(
      [...new Set((Array.isArray(value.lastCapabilityIds) ? value.lastCapabilityIds : []).map(String))].slice(0, 8),
    ),
    lastRunState: ['idle', 'pending', 'success', 'empty', 'failed', 'degraded'].includes(value.lastRunState)
      ? value.lastRunState
      : 'idle',
    lastResultSet: compactResultSet(value.lastResultSet),
    resultSetCandidates: Object.freeze(
      (Array.isArray(value.resultSetCandidates) ? value.resultSetCandidates : [])
        .slice(0, 6)
        .map(compactResultSet)
        .filter(Boolean),
    ),
    pendingArtifact: value.pendingArtifact
      ? Object.freeze({
          available: value.pendingArtifact.available === true,
          domain: String(value.pendingArtifact.domain || ''),
          state: String(value.pendingArtifact.state || ''),
        })
      : null,
    unresolvedReference: value.unresolvedReference === true,
  });
}

function compactRecentDialogue(messages = []) {
  return Object.freeze(
    (Array.isArray(messages) ? messages : [])
      .filter(
        (message) =>
          ['user', 'assistant'].includes(message?.role) &&
          typeof message?.content === 'string' &&
          message.content.trim(),
      )
      .slice(-8)
      .map((message) =>
        Object.freeze({
          role: message.role,
          content: message.content.trim().slice(0, 1_600),
        }),
      ),
  );
}

function compilerPrompt(repairFeedback = '') {
  return [
    '你是轻笺 Agent V3 的唯一语义编译器。你只把“最新一条用户消息”编译成产品能力任务规格。',
    '只允许从 capabilityCatalog 选择 capabilityId；禁止输出工具名、工具参数、SQL 或执行结果。',
    'latestMessage 是本轮动作、对象、时间、参数和事实的唯一文字权威。recentDialogue 是服务端裁剪的最近语义对话，只能帮助理解普通连续问答和“这个、刚才那个、继续”等省略表达；不得从中复制旧时间、旧范围、旧 ID、旧工具参数或私有事实到本轮执行。structuredDiscourse 只含服务端结构化状态，用于解析真实结果集和待确认产物。',
    '用户本轮明确改变对象、领域、时间范围、动作或输出要求时，必须以最新消息为准，并把 topicEpochAction 设为 advance。真正承接上一结果/产物时才设为 keep。',
    'continuationMode=refer_last_result 只表示引用服务端上一结果集；refine_last_artifact 只表示修改仍可用的待确认产物。没有相应结构化状态时不得假装存在。',
    'scope_replacement 只表示：用户正在改写同一份待确认产物，但本轮明确更换了输入材料、时间范围或检索对象；此时新确认必须原子替换旧确认。待确认产物存在时，同领域的 create_artifact 若不是明确要求另建一份互不相关的产物，就不得标成 independent。',
    'resultSetCandidates 多于一个时，只有 types 能唯一筛到一组才允许 refer_last_result；“这些、刚才那些”仍指向多组时必须澄清，不得默认取最后一组或合并。',
    'structuredDiscourse.lastRunState 为 failed/degraded 时，旧 ResultSet 只代表更早的已提交结果，不能冒充刚失败查询的新结果；只有用户明确指回旧结果时才允许引用。',
    '省略指代里的通用对象名称不构成切换产品领域的证据。没有当前显式资源、最新消息也没有明确的新目标类型或新范围时，应优先承接唯一兼容的 ResultSet；确实要切换领域才使用 independent。',
    '当前显式选择的资源足以确定目标时，不要追问用户再次粘贴链接、ID 或标题；使用 current_explicit referentSelector。上一结果集足以确定目标时，使用 last_result selector。',
    '只有用户明确要求把刚才讨论、这段对话或指定会话内容作为待转换材料，并且 currentContext.dialogueAnchorAvailable=true 时，才使用 dialogue_anchor selector。普通连续问答继续只使用 recentDialogue 的语言上下文，不得把它升级成事实材料。',
    '相对日期由 temporalContext 解释，不得把“今天、昨天、最近 N 天”误报为缺少日期。requiredSlots 只表示执行阶段需要抽取的参数，不等于应该向用户追问；只有确实会改变目标且无法从最新消息、当前显式资源或结构化指代得到时，才填写 missingSlots。',
    '时间表达只允许从 authoritativeTemporalMentions 选择，并通过 temporalConstraints 绑定到对应 goalId 与 manifest temporalSlots；不要把时间写进工具参数。单一时间表达式可留空让服务端按 autoBind 绑定，多时间表达式必须逐一分配，不能沿用旧范围。',
    '一个写能力需要前置读取时可以只提交写目标；服务端会按 manifest.dependencies 确定性补齐依赖。需要查询工作区材料后生成笔记时，必须显式提交相应读取能力，并让 note.create 依赖它。',
    '普通总结、分析、回顾、列出和回答属于 answer/read；只有用户明确要求创建、保存、修改、删除、恢复或启动任务时才使用写能力。',
    'conversation 必须没有 goals；低置信或关键槽位缺失必须给出一个具体 clarificationQuestion。',
    repairFeedback ? `上一次结果需要修复或语义边界复核：${repairFeedback}` : '',
    `必须且只能调用 ${TURN_SPEC_V3_TOOL_NAME}，不要输出普通文本。`,
  ]
    .filter(Boolean)
    .join('\n');
}

function resultSetValues(item) {
  return new Set([...(item?.domains || []), ...(item?.refTypes || [])].map(String).filter(Boolean));
}

function availableResultSets(structuredDiscourse = {}) {
  const candidates = (
    Array.isArray(structuredDiscourse.resultSetCandidates) ? structuredDiscourse.resultSetCandidates : []
  ).filter((item) => item?.available === true);
  if (candidates.length) return candidates;
  return structuredDiscourse.lastResultSet?.available === true ? [structuredDiscourse.lastResultSet] : [];
}

function selectorMatchesResultSet(selector, resultSet) {
  if (selector?.resultSetHandleId && String(selector.resultSetHandleId) !== String(resultSet?.handleId || '')) {
    return false;
  }
  const types = Array.isArray(selector?.types) ? selector.types.map(String).filter(Boolean) : [];
  if (!types.length) return true;
  const refTypes = new Set((resultSet?.refTypes || []).map(String));
  // resolveSessionResultSet 最终按真实 ref type 过滤，而不是按展示领域过滤；编译门禁
  // 使用同一语义，避免 schema 看似匹配、执行时却得到空引用。
  return types.some((type) => refTypes.has(type));
}

function discourseConsistency(
  turnSpec,
  payload,
  { independentReviewed = false, artifactIndependentReviewed = false } = {},
) {
  const pendingArtifact = payload?.structuredDiscourse?.pendingArtifact;
  const hasPendingArtifact =
    pendingArtifact?.available === true || payload?.currentContext?.hasPendingArtifact === true;
  const artifactGoals = turnSpec.goals.filter((goal) => goal.kind === 'transform');
  const dialogueAnchorSelectors = turnSpec.goals.flatMap((goal) =>
    (goal.referentSelectors || []).filter((selector) => selector.source === 'dialogue_anchor'),
  );
  if (dialogueAnchorSelectors.length && payload?.currentContext?.dialogueAnchorAvailable !== true) {
    return {
      blocking: true,
      feedback:
        '规格引用了 dialogue_anchor，但服务端没有可重新读取的云端消息锚点；不得把临时 session 文本或客户端历史升级成材料。',
    };
  }
  const artifactRequest = ['create_artifact', 'revise_artifact'].includes(turnSpec.requestKind);
  const pendingDomain = String(pendingArtifact?.domain || '');
  const sameArtifactDomain =
    artifactRequest &&
    artifactGoals.length > 0 &&
    (!pendingDomain || artifactGoals.some((goal) => goal.capabilityDomain === pendingDomain));

  if (['refine_last_artifact', 'scope_replacement'].includes(turnSpec.continuationMode)) {
    if (!hasPendingArtifact) {
      return {
        blocking: true,
        feedback: `${turnSpec.continuationMode} 要求存在仍可用的待确认产物，但服务端没有该状态；应改为独立创建或请求澄清。`,
      };
    }
    if (!sameArtifactDomain) {
      return {
        blocking: true,
        feedback: `${turnSpec.continuationMode} 的目标领域与当前待确认产物不一致；不得跨产物领域替换或改写。`,
      };
    }
  }

  // 客户端携带的待确认令牌只是候选，是否承接仍由编译器判断；但同领域产物在存在
  // pending artifact 时直接标成 independent 风险很高：它会留下两张都可执行的卡。
  // 强制一次语义复核，让模型明确区分“另建一份”与“改写/换范围”，不靠固定句式猜测。
  if (
    hasPendingArtifact &&
    sameArtifactDomain &&
    turnSpec.continuationMode === 'independent' &&
    !artifactIndependentReviewed
  ) {
    return {
      blocking: false,
      review: true,
      reviewKind: 'pending_artifact',
      feedback:
        '服务端存在同领域待确认产物，但本规格选择了 independent。请只根据 latestMessage 复核：明确要求额外另建一份才保持 independent；调整原产物内容用 refine_last_artifact；更换材料、时间范围或检索对象后重做用 scope_replacement。',
    };
  }

  const resultSets = availableResultSets(payload?.structuredDiscourse);
  if (turnSpec.continuationMode === 'refer_last_result') {
    if (!resultSets.length) {
      return {
        blocking: true,
        feedback: 'continuationMode=refer_last_result，但服务端没有可用 ResultSet；应改为独立目标或请求澄清。',
      };
    }
    for (const goal of turnSpec.goals) {
      const selectors = (goal.referentSelectors || []).filter((selector) => selector.source === 'last_result');
      const effectiveSelectors = selectors.length ? selectors : [{ types: [], ordinal: null }];
      const selectedSets = [];
      for (const selector of effectiveSelectors) {
        const matches = resultSets.filter((resultSet) => selectorMatchesResultSet(selector, resultSet));
        if (matches.length !== 1) {
          return {
            blocking: true,
            feedback:
              matches.length > 1
                ? 'last_result selector 仍匹配多个 ResultSet；必须收窄 types 或请求澄清。'
                : 'last_result selector 与任何真实引用类型都不匹配；不得改用其他资源领域猜测。',
          };
        }
        if (!selectedSets.includes(matches[0])) selectedSets.push(matches[0]);
      }
      if (goal.kind !== 'read') continue;
      const compatible = selectedSets.some((resultSet) => resultSetValues(resultSet).has(goal.capabilityDomain));
      if (!compatible) {
        return {
          blocking: true,
          feedback: `读取目标 ${goal.capabilityId} 的领域与所引用 ResultSet 不兼容；应选择能读取该结果类型的能力，不能切到无关资源。`,
        };
      }
    }
    return { blocking: false, feedback: '' };
  }

  if (independentReviewed || resultSets.length !== 1 || turnSpec.continuationMode !== 'independent') {
    return { blocking: false, feedback: '' };
  }
  const currentContext = payload?.currentContext || {};
  const hasCurrentContext =
    Number(currentContext.selectedResourceCount || 0) > 0 || Number(currentContext.attachmentCount || 0) > 0;
  const hasCurrentSelector = turnSpec.goals.some((goal) =>
    (goal.referentSelectors || []).some((selector) => selector.source === 'current_explicit'),
  );
  const hasFreshTemporalScope = (turnSpec.temporalConstraints || []).length > 0;
  const resultValues = resultSetValues(resultSets[0]);
  const crossesDomain = turnSpec.goals
    .filter((goal) => goal.kind === 'read')
    .some((goal) => !resultValues.has(goal.capabilityDomain));
  if (!hasCurrentContext && !hasCurrentSelector && !hasFreshTemporalScope && crossesDomain) {
    return {
      blocking: false,
      review: true,
      reviewKind: 'result_set',
      feedback:
        '当前只有一个可用 ResultSet，但本规格在没有显式资源或新时间范围时切换到了不兼容领域。请复核：只有 latestMessage 明确指定了新的产品目标类型才保持 independent；否则应引用唯一 ResultSet。',
    };
  }
  return { blocking: false, feedback: '' };
}

function responseFeedback(response) {
  const calls = (Array.isArray(response?.toolCalls) ? response.toolCalls : []).filter(
    (call) => call?.function?.name === TURN_SPEC_V3_TOOL_NAME,
  );
  if (calls.length !== 1) return '必须且只能提交一次 submit_turn_spec_v3';
  try {
    JSON.parse(String(calls[0]?.function?.arguments || '{}'));
  } catch {
    return 'arguments 不是完整有效的 JSON';
  }
  return '字段、能力 ID、操作、依赖顺序、范围或输出契约不符合服务端 schema；请只按同一最新消息修复';
}

export async function compileAgentTurnSpecV3({
  message,
  catalog = [],
  recentDialogue = [],
  discourseProjection = {},
  contextSummary = {},
  capabilityScope = null,
  authoritativeGroundingPolicy = 'none',
  outputContract = null,
  temporalContext = {},
  actorRole = 'user',
  signal,
  traceId = '',
  request = requestAi,
  onResponse,
} = {}) {
  const latestMessage = String(message || '')
    .trim()
    .slice(0, MAX_LATEST_MESSAGE_CHARS);
  if (!latestMessage) throw new IntentCompilerV3Error('TURN_SPEC_V3_INPUT_INVALID', '用户消息不能为空。');
  const compilerCatalog = (Array.isArray(catalog) ? catalog : []).filter((entry) => entry.status !== 'unavailable');
  if (!compilerCatalog.length) {
    throw new IntentCompilerV3Error('TURN_SPEC_V3_CAPABILITY_EMPTY', '当前没有可用于编译请求的产品能力。');
  }
  const payload = Object.freeze({
    latestMessage,
    recentDialogue: compactRecentDialogue(recentDialogue),
    structuredDiscourse: compactDiscourseProjection(discourseProjection),
    currentContext: Object.freeze({
      selectedResourceTypes: Object.freeze(
        [
          ...new Set(
            (Array.isArray(contextSummary.selectedResourceTypes) ? contextSummary.selectedResourceTypes : []).map(
              String,
            ),
          ),
        ].slice(0, 12),
      ),
      selectedResourceCount: Math.max(0, Number(contextSummary.selectedResourceCount) || 0),
      attachmentCount: Math.max(0, Number(contextSummary.attachmentCount) || 0),
      hasPendingArtifact: contextSummary.hasPendingArtifact === true,
      dialogueAnchorAvailable: contextSummary.dialogueAnchorAvailable === true,
    }),
    temporalContext: Object.freeze({
      timeZone: String(temporalContext.timeZone || ''),
      currentDate: String(temporalContext.currentDate || ''),
      currentDateTime: String(temporalContext.currentDateTime || ''),
    }),
    authoritativeTemporalMentions: extractTemporalMentionsV3(latestMessage),
    authoritativeGroundingPolicy,
    authoritativeCapabilityScope: capabilityScope || null,
    authoritativeOutputContract: outputContract ? structuredClone(outputContract) : null,
    capabilityCatalog: compactCatalog(compilerCatalog),
  });

  let feedback = '';
  let independentReviewed = false;
  let artifactIndependentReviewed = false;
  for (let attempt = 1; attempt <= MAX_COMPILER_ATTEMPTS; attempt += 1) {
    const response = await request(
      [
        { role: 'system', content: compilerPrompt(feedback) },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      {
        tools: [
          buildTurnSpecV3ToolDefinition({ catalog: compilerCatalog, groundingPolicy: authoritativeGroundingPolicy }),
        ],
        toolChoice: { type: 'function', function: { name: TURN_SPEC_V3_TOOL_NAME } },
        signal,
        maxTokens: 1_800,
        temperature: 0,
        trace: { traceId, stage: attempt === 1 ? 'intent_compiler_v3' : 'intent_compiler_v3_repair' },
      },
    );
    onResponse?.(response, attempt);
    const turnSpec = parseTurnSpecV3Response(response, {
      catalog: compilerCatalog,
      authoritativeGroundingPolicy,
      outputContract,
      capabilityScope,
      actorRole,
      latestMessage,
      temporalContext,
      resultSetHandleIds: payload.structuredDiscourse.resultSetCandidates.map((item) => item.handleId).filter(Boolean),
    });
    if (turnSpec) {
      const consistency = discourseConsistency(turnSpec, payload, {
        independentReviewed,
        artifactIndependentReviewed,
      });
      if (consistency.feedback) {
        feedback = consistency.feedback;
        if (consistency.reviewKind === 'result_set') independentReviewed = true;
        if (consistency.reviewKind === 'pending_artifact') artifactIndependentReviewed = true;
        if (attempt < MAX_COMPILER_ATTEMPTS) continue;
        if (consistency.blocking) break;
      }
      return Object.freeze({ turnSpec, attempts: attempt, finishReason: response?.finishReason || null });
    }
    feedback = responseFeedback(response);
  }
  throw new IntentCompilerV3Error('TURN_SPEC_V3_INVALID', 'AI 没有返回可核验的任务规格，本轮未执行任何操作。');
}

export const __testing = Object.freeze({
  availableResultSets,
  compactCatalog,
  compactDiscourseProjection,
  compactRecentDialogue,
  compilerPrompt,
  discourseConsistency,
  responseFeedback,
  selectorMatchesResultSet,
});
