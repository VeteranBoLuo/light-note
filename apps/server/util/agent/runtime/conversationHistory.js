const DEFAULT_HISTORY_CHAR_BUDGET = 16_000;
const MAX_CLIENT_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 8_000;

/**
 * Legacy 仍可读取最近原始对话；V3 强制模式一律返回空数组，只允许消费结构化 DiscourseState。
 * 将边界放在组装 messages 的唯一入口，避免 Compiler 已隔离、Composer 却重新拿到历史正文。
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
});
