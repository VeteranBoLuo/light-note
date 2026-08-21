const DEFAULT_HISTORY_CHAR_BUDGET = 16_000;
const MAX_CLIENT_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 8_000;

export const AGENT_RECENT_DIALOGUE_STAGES = Object.freeze({
  compiler: Object.freeze({ maxTurns: 4, charBudget: 1_600 }),
  dialogueComposer: Object.freeze({ maxTurns: 10, charBudget: 8_000 }),
  groundedComposer: Object.freeze({ maxTurns: 4, charBudget: 2_400 }),
});

function normalizeDialogueMessage(message) {
  const role = message?.role;
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  if (!['user', 'assistant'].includes(role) || !content) return null;
  if (message?.status && message.status !== 'completed') return null;
  return {
    role,
    content,
    id: String(message?.id || ''),
    versionGroupId: String(message?.versionGroupId || message?.version_group_id || ''),
  };
}

function normalizeCloudDialogue(messages) {
  const normalized = (Array.isArray(messages) ? messages : []).map(normalizeDialogueMessage).filter(Boolean);
  const seenVersionGroups = new Set();
  const selected = [];
  // 云端回答可能包含“重新生成”的多个版本。只保留同一版本组中时间线最后一个已完成版本，
  // 防止互斥回答同时进入上下文；普通消息没有版本组，保持原顺序。
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const message = normalized[index];
    const versionGroupId = message.role === 'assistant' ? message.versionGroupId : '';
    if (versionGroupId && seenVersionGroups.has(versionGroupId)) continue;
    if (versionGroupId) seenVersionGroups.add(versionGroupId);
    selected.unshift(message);
  }
  return selected;
}

function normalizeSessionDialogue(turns) {
  return (Array.isArray(turns) ? turns : [])
    .flatMap((turn) => [
      { role: 'user', content: turn?.user },
      { role: 'assistant', content: turn?.assistant },
    ])
    .map(normalizeDialogueMessage)
    .filter(Boolean);
}

function clipDialogueContent(content, limit) {
  if (content.length <= limit) return content;
  if (limit <= 24) return content.slice(0, limit);
  const marker = '\n…[中间省略]…\n';
  const available = limit - marker.length;
  const head = Math.ceil(available * 0.6);
  return `${content.slice(0, head)}${marker}${content.slice(content.length - (available - head))}`;
}

/**
 * V3 的原始语义上下文只能来自服务端：云端 Conversation 可用时以消息表为准，
 * 临时会话才回退到服务端 session turns。客户端 history 永远不参与此选择。
 */
export function resolveServerAuthoritativeRecentDialogue({ cloudMessages = [], sessionTurns = [] } = {}) {
  const cloudDialogue = normalizeCloudDialogue(cloudMessages);
  const sessionDialogue = cloudDialogue.length ? [] : normalizeSessionDialogue(sessionTurns);
  const selected = cloudDialogue.length ? cloudDialogue : sessionDialogue;
  const messages = Object.freeze(
    selected.map((message) =>
      Object.freeze({
        role: message.role,
        content: message.content,
      }),
    ),
  );
  return Object.freeze({
    source: cloudDialogue.length ? 'cloud' : sessionDialogue.length ? 'session' : 'none',
    messages,
  });
}

export function selectServerAuthoritativeRecentDialogue(input = {}) {
  return resolveServerAuthoritativeRecentDialogue(input).messages;
}

/**
 * recentDialogue 只帮助理解省略指代和普通连续问答。各模型阶段共享同一裁剪实现，
 * 避免 Compiler 与 Composer 各自维护一套容易漂移的预算规则。
 */
export function budgetAgentRecentDialogue(messages, stage = 'compiler') {
  const policy = AGENT_RECENT_DIALOGUE_STAGES[stage] || AGENT_RECENT_DIALOGUE_STAGES.compiler;
  const valid = (Array.isArray(messages) ? messages : []).map(normalizeDialogueMessage).filter(Boolean);
  const turnLimited = valid.slice(-policy.maxTurns * 2);
  const selected = [];
  let remaining = policy.charBudget;
  for (let index = turnLimited.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const message = turnLimited[index];
    if (message.content.length > remaining && selected.length) break;
    const content = clipDialogueContent(message.content, remaining);
    selected.unshift(Object.freeze({ role: message.role, content }));
    remaining -= content.length;
  }
  return Object.freeze(selected);
}

/**
 * 这个入口只负责 Planner/Tool 历史。Legacy 仍可读取客户端最近原始对话；V3 Planner/Tool
 * 一律返回空数组。V3 Compiler/Composer 的受限上下文由上面的服务端权威入口单独提供。
 */
export function selectAgentConversationHistory({
  runtimeMode,
  clientHistory = [],
  sessionTurns = [],
  charBudget = DEFAULT_HISTORY_CHAR_BUDGET,
} = {}) {
  if (runtimeMode === 'v3_enforce') return Object.freeze([]);
  const budget = Math.max(1, Number(charBudget) || DEFAULT_HISTORY_CHAR_BUDGET);
  if (Array.isArray(clientHistory) && clientHistory.length) {
    const valid = clientHistory
      .slice(-MAX_CLIENT_MESSAGES)
      .filter(
        (message) =>
          message &&
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.content === 'string' &&
          message.content.length > 0 &&
          message.content.length <= MAX_MESSAGE_CHARS,
      );
    const kept = [];
    let chars = 0;
    for (let index = valid.length - 1; index >= 0; index -= 1) {
      chars += valid[index].content.length;
      if (chars > budget && kept.length) break;
      kept.unshift(Object.freeze({ role: valid[index].role, content: valid[index].content }));
    }
    return Object.freeze(kept);
  }
  return Object.freeze(
    (Array.isArray(sessionTurns) ? sessionTurns : [])
      .flatMap((turn) => [
        { role: 'user', content: turn?.user },
        { role: 'assistant', content: turn?.assistant },
      ])
      .filter((message) => typeof message.content === 'string' && message.content.length > 0)
      .map(Object.freeze),
  );
}

export const __testing = Object.freeze({
  DEFAULT_HISTORY_CHAR_BUDGET,
  MAX_CLIENT_MESSAGES,
  MAX_MESSAGE_CHARS,
  clipDialogueContent,
  normalizeCloudDialogue,
  normalizeSessionDialogue,
});
