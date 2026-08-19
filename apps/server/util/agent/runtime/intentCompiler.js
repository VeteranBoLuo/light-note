import { requestAi } from '../aiGateway.js';
import {
  buildTurnSpecToolDefinition,
  CAPABILITY_DOMAINS,
  parseTurnSpecResponse,
  TURN_SPEC_TOOL_NAME,
} from './turnSpec.js';

const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 6_000;

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
    if (current.descriptions.length < 4) current.descriptions.push(String(entry?.description || '').slice(0, 160));
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
    '用户只要求回答时，不能因为历史里有写操作而生成 write/transform goal。',
    '问“怎么用、在哪里操作、是否支持”属于 product_help，不得生成真实写目标；需要查询产品帮助中心时应生成 content 域 read goal。普通寒暄和无需产品数据的闲聊使用 conversation 且 goals=[]。',
    '目标、时间、数量、位置、状态或对象会改变结果且无法唯一确定时，列出 missingSlots；confidence=low 或存在 missingSlots 时必须给出一个具体 clarificationQuestion。',
    '无注册能力的动作仍要用 capabilityDomain=none 明确记录，后续服务端会标为 unsupported；不要把它改成普通闲聊。',
    '创建或改写笔记等内容产物必须使用 create_artifact/revise_artifact 与 transform goal；如果必须先查询工作区材料，要先列出 read goal，并让 transform goal 依赖这些 read goal。',
    'action 至少包含一个 write 或 transform goal；只有 read goal 的事实查询使用 answer。直接创建笔记内容属于 create_artifact + transform，不是 action + write。',
    '明确请求永久删除、修改账号安全或成长奖励等禁止能力时，不需要追问具体目标；用高置信目标交给服务端确定性拒绝。',
    'groundingPolicy 必须逐字复制输入中的 authoritativeGroundingPolicy；不得自行放宽为 workspace_query 或 general_knowledge。',
    repairFeedback ? `上一次协议无效：${repairFeedback}。请修正该约束并重新提交完整 TurnSpec。` : '',
    `必须且只能调用 ${TURN_SPEC_TOOL_NAME}，不要输出普通文本。`,
  ]
    .filter(Boolean)
    .join('\n');
}

function repairFeedbackForResponse(response, authoritativeGroundingPolicy) {
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
  const hasRead = goals.some((goal) => goal?.kind === 'read');
  const hasMutation = goals.some((goal) => goal?.kind === 'write' || goal?.kind === 'transform');
  if (raw?.groundingPolicy !== authoritativeGroundingPolicy) {
    return `groundingPolicy 必须为 ${authoritativeGroundingPolicy}`;
  }
  if (raw?.requestKind === 'action' && !hasMutation) {
    return 'action 必须包含 write 或 transform goal；纯读取请求应使用 answer';
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
    },
    authoritativeGroundingPolicy,
    capabilityDomains: normalizeDomainCatalog(domainCatalog),
  };

  let repairFeedback = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
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
    if (turnSpec) return { turnSpec, attempts: attempt, finishReason: response?.finishReason || null };
    repairFeedback = repairFeedbackForResponse(response, authoritativeGroundingPolicy);
  }
  throw new IntentCompilerError('TURN_SPEC_INVALID', 'AI 没有返回可核验的任务规格，本轮未执行任何操作。');
}

export const __testing = Object.freeze({ normalizeDomainCatalog, normalizeHistory, repairFeedbackForResponse });
