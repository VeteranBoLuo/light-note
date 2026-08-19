import { requestAi } from '../aiGateway.js';
import {
  buildTurnSpecToolDefinition,
  CAPABILITY_DOMAINS,
  parseTurnSpecResponse,
  TURN_SPEC_TOOL_NAME,
} from './turnSpec.js';
import {
  EPHEMERAL_REPORT_PATTERN,
  EXPLICIT_PREVIEW_ONLY_PATTERN,
  PERSISTED_ARTIFACT_PATTERN,
} from '../semanticPatterns.js';

const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 6_000;
const MAX_COMPILER_ATTEMPTS = 3;
const EXPLICIT_TIME_PATTERN =
  /(?:今天|今日|当天|昨天|昨日|前天|本周|这周|上周|本月|这个月|上月|今年|去年|最近(?:一次|的)?|近期|最近\s*\d+\s*(?:天|日|周|个月|月|年)|过去\s*\d+\s*(?:天|日|周|个月|月|年)|\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?|全部时间|所有时间|不限时间|累计|目前|当前|today|yesterday|recent(?:ly)?|latest|this\s+week|last\s+week|this\s+month|last\s+month|past\s+\d+\s+(?:days?|weeks?|months?|years?)|last\s+\d+\s+(?:days?|weeks?|months?|years?)|all\s+time)/iu;
const EXPLICIT_COLLECTIVE_SCOPE_PATTERN =
  /(?:全平台|平台(?:全部|所有)?|全站|本站|所有用户|全部用户|每个用户|大家|新增用户|新用户|新注册用户|注册用户|他们|这些用户|上述用户|全体|all\s+users?|every\s+user|new\s+users?|platform[-\s]?wide|site[-\s]?wide)/iu;
const TIME_SLOT_PATTERN = /(?:time|date|period|range|when|时间|日期|时段|范围|口径)/iu;
const COLLECTIVE_SCOPE_SLOT_PATTERN =
  /(?:user|account|owner|subject|target|scope|用户|账号|所有者|归属|对象|目标|范围|平台)/iu;

export class IntentCompilerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IntentCompilerError';
    this.code = code;
  }
}

function normalizeHistory(history) {
  const output = [];
  let remaining = MAX_HISTORY_CHARS;
  for (const item of (Array.isArray(history) ? history : []).slice(-MAX_HISTORY_MESSAGES).reverse()) {
    if (remaining <= 0 || !['user', 'assistant'].includes(item?.role)) continue;
    const content = String(item?.content || '').trim();
    if (!content) continue;
    const clipped = content.slice(-Math.min(remaining, 1_200));
    output.unshift({ role: item.role, content: clipped });
    remaining -= clipped.length;
  }
  return output;
}

function normalizeDomainCatalog(catalog) {
  const domains = new Map();
  for (const entry of Array.isArray(catalog) ? catalog : []) {
    const domain = CAPABILITY_DOMAINS.includes(entry?.domain) ? entry.domain : 'none';
    const current = domains.get(domain) || { domain, read: false, write: false, statuses: new Set(), descriptions: [] };
    if (entry?.effect === 'read') current.read = true;
    if (entry?.effect === 'write') current.write = true;
    current.statuses.add(String(entry?.status || 'unavailable'));
    const description = String(entry?.description || '').slice(0, 160);
    if (description && !current.descriptions.includes(description)) current.descriptions.push(description);
    domains.set(domain, current);
  }
  return [...domains.values()].map((entry) => ({
    domain: entry.domain,
    effects: [entry.read ? 'read' : '', entry.write ? 'write' : ''].filter(Boolean),
    statuses: [...entry.statuses].sort(),
    descriptions: entry.descriptions.filter(Boolean),
  }));
}

function compilerSystemPrompt(repairFeedback = '') {
  return [
    '你是轻笺 Agent 的 Intent Compiler，只负责把最新用户要求编译成 TurnSpec V2。',
    '你不能选择具体工具、不能填写工具参数、不能执行操作、不能扩展服务端给出的材料策略。',
    '历史仅用于理解省略指代；最新消息重新指定范围或目标时，必须以最新消息为准。',
    '把用户明确要求的每一项独立目标都列为 goal，禁止静默漏项。read 表示查询事实，write 表示修改数据，transform 表示创建或改写内容产物。',
    '每个 goal 都必须填写 operation：读取用 read；创建、修改、删除、恢复、保存、上传、完成、重新打开、移动分别用 create/update/delete/restore/save/upload/complete/reopen/move。operation 必须忠实表达用户动词，不能仅凭同领域猜测。',
    '“立即开始/启动/触发/重新运行”检查、扫描、体检、同步、分析等后台任务属于 action：即使后续具体工具不需要确认，也必须用 write goal，并按启动新任务使用 operation=create（重配已有任务才用 update）；不能写成 action + read。',
    '用户只要求回答时，不能因为历史里有写操作而生成 write/transform goal。',
    '用户明确要求“只预览/仅模拟/不要创建或执行”时，这是只读请求：必须使用 answer + read，不能生成 write/transform goal。',
    '“生成回顾/复盘/摘要/概览/分析/报告”默认表示在当前回答中生成只读结果；只有最新消息明确要求创建、保存、写入或导出为笔记/文档/文件等持久化产物时，才使用 action 或 create_artifact/revise_artifact。',
    '问“怎么用、在哪里操作、是否支持”属于 product_help，不得生成真实写目标；需要查询产品帮助中心时应生成 content 域 read goal。普通寒暄和无需产品数据的闲聊使用 conversation 且 goals=[]。',
    '目标、时间、数量、位置、状态或对象会改变结果且无法唯一确定时，列出 missingSlots；confidence=low 或存在 missingSlots 时必须给出一个具体 clarificationQuestion。',
    'missingSlots 只表示用户确实没有提供、且无法从最新消息或上下文唯一确定的信息；绝不能因为你猜测某个工具不可用而制造 missingSlot。能力是否可用由后续服务端路由裁决。',
    '“今天/昨天/本周/本月/最近 N 天”等相对时间是完整时间条件；“全平台/所有用户/全部新用户/大家”等集合表达是完整对象范围，不得追问具体日期或单个用户。',
    'contextSummary.actorRole 是服务端鉴权后的权威角色；actorRole=root 时允许编译跨用户、平台统计和管理员只读目标，不得根据能力摘要臆测为仅能查询当前用户。',
    '无注册能力的动作仍要用 capabilityDomain=none 明确记录，后续服务端会标为 unsupported；不要把它改成普通闲聊。',
    '创建或改写笔记等内容产物必须使用 create_artifact/revise_artifact 与 transform goal；如果必须先查询工作区材料，要先列出 read goal，并让 transform goal 依赖这些 read goal。',
    '“读取材料后生成一篇笔记”只有一个最终产物，读取只是依赖，必须使用 create_artifact/revise_artifact，不能标成 mixed；只有用户还要求另一个独立写入结果时才使用 mixed。',
    '输入中的 authoritativeOutputContract 由服务端决定且不可修改。format=note_markdown 时必须且只能用 note 域 transform 表示该笔记产物；标题可由草稿生成器自动拟定，禁止把 title/笔记标题列为 missingSlot，也不得改成知识库或其他内容写入。',
    'action 至少包含一个 write 或 transform goal；只有 read goal 的事实查询使用 answer。直接创建笔记内容属于 create_artifact + transform，不是 action + write。',
    '明确请求永久删除、修改账号安全或成长奖励等禁止能力时，不需要追问具体目标；用高置信目标交给服务端确定性拒绝。',
    'groundingPolicy 必须逐字复制输入中的 authoritativeGroundingPolicy；不得自行放宽为 workspace_query 或 general_knowledge。',
    repairFeedback ? `上一次协议无效：${repairFeedback}。请修正该约束并重新提交完整 TurnSpec。` : '',
    `必须且只能调用 ${TURN_SPEC_TOOL_NAME}，不要输出普通文本。`,
  ]
    .filter(Boolean)
    .join('\n');
}

function contradictedMissingSlotFeedback(turnSpec, latestMessage, actorRole) {
  const slots = Array.isArray(turnSpec?.missingSlots) ? turnSpec.missingSlots : [];
  if (!slots.length) return '';
  const message = String(latestMessage || '');
  const hasExplicitTime = EXPLICIT_TIME_PATTERN.test(message);
  const hasCollectiveScope = EXPLICIT_COLLECTIVE_SCOPE_PATTERN.test(message);
  const contradictions = [];
  for (const slot of slots) {
    const slotText = [slot?.name, slot?.reason, slot?.question].map(String).join(' ');
    if (hasExplicitTime && TIME_SLOT_PATTERN.test(slotText)) contradictions.push('时间范围');
    if (actorRole === 'root' && hasCollectiveScope && COLLECTIVE_SCOPE_SLOT_PATTERN.test(slotText)) {
      contradictions.push('集合用户/平台范围');
    }
  }
  if (!contradictions.length) return '';
  return `最新消息已经明确给出${[...new Set(contradictions)].join('和')}，必须移除相应 missingSlots 并按原请求编译；不要用工具可用性猜测替代用户语义`;
}

function contradictedReadOnlyIntentFeedback(turnSpec, latestMessage) {
  const message = String(latestMessage || '').trim();
  const goals = Array.isArray(turnSpec?.goals) ? turnSpec.goals : [];
  const hasMutation = goals.some((goal) => goal?.kind === 'write' || goal?.kind === 'transform');
  const isReadAnswer = turnSpec?.requestKind === 'answer' && goals.length > 0 && !hasMutation;
  if (isReadAnswer) return '';
  if (EXPLICIT_PREVIEW_ONLY_PATTERN.test(message)) {
    return '最新消息明确要求只预览、模拟或不创建/不执行；必须编译为 answer + read，不能包含 write 或 transform goal';
  }
  if (EPHEMERAL_REPORT_PATTERN.test(message) && !PERSISTED_ARTIFACT_PATTERN.test(message)) {
    return '最新消息只要求在回答中生成回顾、复盘、摘要、概览、分析或报告，没有要求持久化产物；必须编译为 answer + read。只有明确创建或保存为笔记、文档、文件等时才可写入';
  }
  return '';
}

function repairFeedbackForResponse(response, authoritativeGroundingPolicy, outputContract = null) {
  const calls = (Array.isArray(response?.toolCalls) ? response.toolCalls : []).filter(
    (call) => call?.function?.name === TURN_SPEC_TOOL_NAME,
  );
  if (calls.length !== 1) return '必须且只能调用一次 submit_turn_spec';
  let raw;
  try {
    raw = JSON.parse(String(calls[0]?.function?.arguments || '{}'));
  } catch {
    return 'arguments 必须是完整有效的 JSON';
  }
  const goals = Array.isArray(raw?.goals) ? raw.goals : [];
  if (goals.some((goal) => !goal?.operation)) {
    return '每个 goal 都必须填写 operation，并与用户明确要求的读取、创建、修改、删除、恢复、保存、上传、完成、重新打开或移动动作一致';
  }
  const hasRead = goals.some((goal) => goal?.kind === 'read');
  const hasMutation = goals.some((goal) => goal?.kind === 'write' || goal?.kind === 'transform');
  if (raw?.groundingPolicy !== authoritativeGroundingPolicy) {
    return `groundingPolicy 必须为 ${authoritativeGroundingPolicy}`;
  }
  if (String(outputContract?.format || '') === 'note_markdown') {
    const noteTransforms = goals.filter((goal) => goal?.kind === 'transform' && goal?.capabilityDomain === 'note');
    const independentMutations = goals.filter(
      (goal) =>
        (goal?.kind === 'write' || goal?.kind === 'transform') &&
        !(goal?.kind === 'transform' && goal?.capabilityDomain === 'note'),
    );
    if (
      noteTransforms.length !== 1 ||
      goals.some((goal) => goal?.kind === 'transform' && goal?.capabilityDomain !== 'note')
    ) {
      return '服务端 OutputContract 要求生成一篇 Markdown 笔记：必须且只能有一个 note 域 transform 产物目标，不能路由到知识库或其他内容产物';
    }
    if (
      (Array.isArray(raw?.missingSlots) ? raw.missingSlots : []).some((slot) =>
        /^(?:title|note[_\s-]?title|document[_\s-]?title|标题|笔记标题|文档标题)$/iu.test(
          String(slot?.name || '').trim(),
        ),
      )
    ) {
      return '笔记标题由草稿生成器自动拟定，不能把 title 或笔记标题列为 missingSlot';
    }
    if (!independentMutations.length && !['create_artifact', 'revise_artifact'].includes(raw?.requestKind)) {
      return '读取材料后生成一篇笔记仍是单一产物任务，requestKind 必须为 create_artifact 或 revise_artifact，不能使用 mixed';
    }
    if (raw?.groundingPolicy === 'workspace_query' && hasRead && !noteTransforms[0]?.dependsOn?.length) {
      return '工作区材料生成笔记时，note transform 必须依赖前置 read goal';
    }
  }
  if (raw?.requestKind === 'action' && !hasMutation) {
    return 'action 必须包含 write 或 transform goal；立即开始、启动、触发或重新运行检查/扫描/体检/同步/分析等后台任务要使用 write + create（重配已有任务用 update），即使具体工具无需确认也不能写成 action + read；真正的纯读取请求应使用 answer + read';
  }
  if (['product_help', 'answer'].includes(raw?.requestKind) && hasMutation) {
    return `${raw.requestKind} 不能包含 write 或 transform goal`;
  }
  if (raw?.requestKind === 'mixed' && !(hasRead && hasMutation)) {
    return 'mixed 必须同时包含 read 和 write/transform goal';
  }
  if (
    ['create_artifact', 'revise_artifact'].includes(raw?.requestKind) &&
    !goals.some((goal) => goal?.kind === 'transform')
  ) {
    return `${raw.requestKind} 必须至少包含一个 transform goal；内容产物创建不是 write goal`;
  }
  if (raw?.requestKind === 'conversation' && goals.length) return 'conversation 的 goals 必须为空数组';
  return '字段组合、依赖顺序或必填字段不符合 TurnSpec V2 schema';
}

export async function compileAgentTurnSpec({
  message,
  history = [],
  domainCatalog = [],
  contextSummary = {},
  authoritativeGroundingPolicy = 'none',
  outputContract = null,
  signal,
  traceId = '',
  request = requestAi,
  onResponse,
} = {}) {
  const latestMessage = String(message || '').trim();
  if (!latestMessage) throw new IntentCompilerError('TURN_SPEC_INPUT_INVALID', '用户消息不能为空。');
  const allowedDomains = [
    ...new Set(
      normalizeDomainCatalog(domainCatalog)
        .map((entry) => entry.domain)
        .filter((domain) => domain !== 'none'),
    ),
    'none',
  ];
  const payload = {
    latestMessage,
    recentDiscourse: normalizeHistory(history),
    contextSummary: {
      selectedResourceTypes: Array.isArray(contextSummary?.selectedResourceTypes)
        ? [...new Set(contextSummary.selectedResourceTypes.map(String))].slice(0, 12)
        : [],
      selectedResourceCount: Math.max(0, Number(contextSummary?.selectedResourceCount) || 0),
      attachmentCount: Math.max(0, Number(contextSummary?.attachmentCount) || 0),
      hasPendingArtifact: contextSummary?.hasPendingArtifact === true,
      actorRole: String(contextSummary?.actorRole || 'user') === 'root' ? 'root' : 'user',
    },
    authoritativeOutputContract: outputContract ? structuredClone(outputContract) : null,
    authoritativeGroundingPolicy,
    capabilityDomains: normalizeDomainCatalog(domainCatalog),
  };

  let repairFeedback = '';
  for (let attempt = 1; attempt <= MAX_COMPILER_ATTEMPTS; attempt += 1) {
    const response = await request(
      [
        { role: 'system', content: compilerSystemPrompt(repairFeedback) },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      {
        tools: [buildTurnSpecToolDefinition({ allowedDomains, groundingPolicy: authoritativeGroundingPolicy })],
        toolChoice: { type: 'function', function: { name: TURN_SPEC_TOOL_NAME } },
        signal,
        maxTokens: 1_500,
        temperature: 0,
        trace: { traceId, stage: attempt === 1 ? 'intent_compiler' : 'intent_compiler_repair' },
      },
    );
    onResponse?.(response, attempt);
    const turnSpec = parseTurnSpecResponse(response, {
      authoritativeGroundingPolicy,
      outputContract,
      allowedDomains,
    });
    if (turnSpec) {
      const semanticFeedback = contradictedReadOnlyIntentFeedback(turnSpec, latestMessage);
      if (semanticFeedback) {
        repairFeedback = semanticFeedback;
        continue;
      }
      const ambiguityFeedback = contradictedMissingSlotFeedback(
        turnSpec,
        latestMessage,
        payload.contextSummary.actorRole,
      );
      if (!ambiguityFeedback) return { turnSpec, attempts: attempt, finishReason: response?.finishReason || null };
      repairFeedback = ambiguityFeedback;
      continue;
    }
    repairFeedback = repairFeedbackForResponse(response, authoritativeGroundingPolicy, outputContract);
  }
  throw new IntentCompilerError('TURN_SPEC_INVALID', 'AI 没有返回可核验的任务规格，本轮未执行任何操作。');
}

export const __testing = Object.freeze({
  contradictedMissingSlotFeedback,
  contradictedReadOnlyIntentFeedback,
  normalizeDomainCatalog,
  normalizeHistory,
  repairFeedbackForResponse,
});
