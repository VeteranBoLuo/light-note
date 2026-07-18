export const AI_SOURCE_COLLAPSE_THRESHOLD = 3;

/** 来源较多时只展示紧凑摘要，避免一次插入整列卡片撑高对话。 */
export function shouldCollapseAiSources(sourceCount: number) {
  return Number.isFinite(sourceCount) && sourceCount >= AI_SOURCE_COLLAPSE_THRESHOLD;
}
