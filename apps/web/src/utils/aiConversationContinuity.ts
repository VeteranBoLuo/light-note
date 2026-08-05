export interface AiConversationRecency {
  id: string;
  lastMessageAt: string;
}

export type AiConversationContinuityDecision = 'load_latest' | 'keep_current' | 'offer_latest';

function recencyTime(value: string) {
  const timestamp = new Date(String(value || '')).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function compareAiConversationRecency(left: AiConversationRecency, right: AiConversationRecency) {
  const timeDifference = recencyTime(left.lastMessageAt) - recencyTime(right.lastMessageAt);
  if (timeDifference !== 0) return timeDifference;
  return String(left.id || '').localeCompare(String(right.id || ''));
}

/**
 * 本地没有当前会话时，是否还要去加载云端最近活跃会话。
 *
 * 「没有 conversationId」有两种来源，必须区分开：
 * - 新设备 / 首次打开：应该接上云端最近会话，这是跨设备连续性的设计意图；
 * - 用户刚点了「新建对话」、还没发出第一条消息：应该保持空白，否则他的显式操作
 *   会被静默推翻（关掉抽屉再打开就回到旧对话）。
 *
 * 后一种由 `newConversationPending` 标记，它随本地会话状态持久化 —— 移动端页面被
 * 系统回收对用户是无感的，只放内存会让同一个「划走再回来」时好时坏。
 */
export function shouldLoadLatestConversationOnOpen(input: {
  currentConversationId: string;
  newConversationPending: boolean;
}): boolean {
  // 已有当前会话时走另一条路径（是否提示切到更新的会话），这里只管「本地为空」的情况
  if (String(input.currentConversationId || '').trim()) return false;
  return !input.newConversationPending;
}

export function decideAiConversationContinuity(input: {
  current: AiConversationRecency | null;
  latest: AiConversationRecency | null;
  checkpoint: AiConversationRecency | null;
}): AiConversationContinuityDecision {
  const { current, latest, checkpoint } = input;
  if (!latest) return 'keep_current';
  if (!current?.id) return 'load_latest';
  if (latest.id === current.id) return 'keep_current';

  const baseline = checkpoint && compareAiConversationRecency(checkpoint, current) > 0 ? checkpoint : current;
  return compareAiConversationRecency(latest, baseline) > 0 ? 'offer_latest' : 'keep_current';
}
