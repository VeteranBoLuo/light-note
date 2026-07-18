export const AI_SOURCE_COLLAPSE_THRESHOLD = 3;
export const AI_SOURCE_COMPACT_PREVIEW_LIMIT = 2;

/** 来源较多时只展示紧凑摘要，避免一次插入整列卡片撑高对话。 */
export function shouldCollapseAiSources(sourceCount: number) {
  return Number.isFinite(sourceCount) && sourceCount >= AI_SOURCE_COLLAPSE_THRESHOLD;
}

/** 来源栏固定为一行：一到两个来源直接展示，更多来源只预览第一项。 */
export function getAiSourceCompactPreviewCount(sourceCount: number) {
  if (!Number.isFinite(sourceCount) || sourceCount <= 0) return 0;
  return sourceCount <= AI_SOURCE_COMPACT_PREVIEW_LIMIT ? sourceCount : 1;
}
