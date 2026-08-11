const TERMINAL_POLICY = 'terminal';
const FINAL_REPLY_POLICY = 'final_reply';

/**
 * 根据 Semantic Planner 的结构化请求分类决定确认成功后是否还需要 AI 收尾。
 *
 * data_action 表示用户目标在权威写入回执出现后已经完成，即使其中包含仅用于定位
 * 写入目标的 read intent，也不应再让模型复述一次结果。mixed 表示写操作之外仍有
 * 自然语言回答或独立查询结果需要交付，才允许进入无工具的 Final Reply。
 */
export function resolveActionContinuationPolicy(plan) {
  const intents = Array.isArray(plan?.intents) ? plan.intents : [];
  const hasWriteIntent = intents.some((intent) => intent?.kind === 'write');

  if (plan?.needsClarification || !hasWriteIntent) return TERMINAL_POLICY;
  return plan?.requestClass === 'mixed' ? FINAL_REPLY_POLICY : TERMINAL_POLICY;
}
