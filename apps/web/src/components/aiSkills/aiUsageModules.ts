export const AI_USAGE_MODULE_KEYS = Object.freeze([
  'note',
  'bookmark',
  'file',
  'todo',
  'search',
  'help',
  'tag',
  'toolbox',
  'other',
]);

export const AI_USAGE_FILTER_MODULE_KEYS = Object.freeze(['all', ...AI_USAGE_MODULE_KEYS]);

export function aiUsageModuleKey(module: string, includeAll = false) {
  const keys: readonly string[] = includeAll ? AI_USAGE_FILTER_MODULE_KEYS : AI_USAGE_MODULE_KEYS;
  return keys.includes(module) ? module : 'other';
}
