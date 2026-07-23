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
