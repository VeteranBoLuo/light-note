// 用量统计、筛选与展示共同使用的模块边界。
export const AI_USAGE_MODULE_KEYS = Object.freeze([
  "note",
  "bookmark",
  "file",
  "todo",
  "search",
  "help",
  "tag",
  "toolbox",
  "organize",
  "routine",
  "general",
  "other",
]);
export const AI_USAGE_FILTER_MODULE_KEYS = Object.freeze([
  "all",
  ...AI_USAGE_MODULE_KEYS,
]);
export function aiUsageModuleKey(module, includeAll = false) {
  return (includeAll
    ? AI_USAGE_FILTER_MODULE_KEYS
    : AI_USAGE_MODULE_KEYS
  ).includes(module)
    ? module
    : "other";
}
