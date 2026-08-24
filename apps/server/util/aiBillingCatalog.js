/**
 * AI 计费目录是业务能力、额度门禁和用户用量页共同依赖的唯一事实源。
 *
 * 约束：
 * - 只有 billingMode=token 且真实访问 Provider 的用户主调用才会扣用户额度；
 * - 缓存命中、无材料、本地解析等没有 Provider Span 的执行始终为 0；
 * - 模型输出协议修复属于平台质量成本，不计入用户额度；
 * - freeActions 只用于解释产品边界，禁止据此创建可访问 Provider 的免费执行。
 */

const DEFAULT_RESERVATION_TOKENS = 5_000;

function tokenAction({
  id,
  module,
  labelKey,
  taskTypes = [],
  unit = 'request',
  maxUserProviderCalls = 1,
  maxPlatformProviderCalls = 1,
  reservationTokens = DEFAULT_RESERVATION_TOKENS,
}) {
  return Object.freeze({
    id,
    module,
    labelKey,
    billingMode: 'token',
    chargeWhen: 'provider_call',
    unit,
    taskTypes: Object.freeze([...taskTypes]),
    maxUserProviderCalls,
    maxPlatformProviderCalls,
    reservationTokens,
  });
}

export const AI_BILLING_ACTIONS = Object.freeze([
  tokenAction({
    id: 'search.answer',
    module: 'search',
    labelKey: 'searchAnswer',
    taskTypes: ['skill_search_answer'],
  }),
  tokenAction({
    id: 'help.answer',
    module: 'help',
    labelKey: 'helpAnswer',
    taskTypes: ['skill_help_answer'],
  }),
  tokenAction({
    id: 'search.summarize_selected',
    module: 'search',
    labelKey: 'searchSummarizeSelected',
    taskTypes: ['skill_search_summarize_selected'],
  }),
  tokenAction({
    id: 'search.compare_selected',
    module: 'search',
    labelKey: 'searchCompareSelected',
    taskTypes: ['skill_search_compare_selected'],
  }),
  tokenAction({
    id: 'file.summarize',
    module: 'file',
    labelKey: 'fileSummarize',
    taskTypes: ['skill_file_summarize'],
    maxUserProviderCalls: 2,
    reservationTokens: 8_000,
  }),
  tokenAction({
    id: 'file.ask',
    module: 'file',
    labelKey: 'fileAsk',
    taskTypes: ['skill_file_ask'],
    maxUserProviderCalls: 2,
    reservationTokens: 8_000,
  }),
  tokenAction({
    id: 'file.compare',
    module: 'file',
    labelKey: 'fileCompare',
    taskTypes: ['skill_file_compare'],
    maxUserProviderCalls: 6,
    reservationTokens: 18_000,
  }),
  tokenAction({
    id: 'file.create_note_preview',
    module: 'file',
    labelKey: 'fileCreateNotePreview',
    taskTypes: ['skill_file_create_note_preview'],
    maxUserProviderCalls: 6,
    reservationTokens: 18_000,
  }),
  tokenAction({
    id: 'note.batch_summarize',
    module: 'note',
    labelKey: 'noteBatchSummarize',
    taskTypes: ['skill_note_batch_summarize'],
  }),
  tokenAction({
    id: 'note.batch_compare',
    module: 'note',
    labelKey: 'noteBatchCompare',
    taskTypes: ['skill_note_batch_compare'],
  }),
  tokenAction({
    id: 'note.create_from_sources',
    module: 'note',
    labelKey: 'noteCreateFromSources',
    taskTypes: ['skill_note_create_from_sources'],
  }),
  tokenAction({
    id: 'note.transform_text',
    module: 'note',
    labelKey: 'noteTransformText',
    taskTypes: ['skill_note_transform_text'],
  }),
  tokenAction({
    id: 'bookmark.summarize_page',
    module: 'bookmark',
    labelKey: 'bookmarkSummarizePage',
    taskTypes: ['skill_bookmark_summarize_page', 'bookmark_summary', 'bookmark_archive_summary'],
    reservationTokens: 8_000,
  }),
  tokenAction({
    id: 'bookmark.compare_pages',
    module: 'bookmark',
    labelKey: 'bookmarkComparePages',
    taskTypes: ['skill_bookmark_compare_pages'],
  }),
  tokenAction({
    id: 'bookmark.create_note_preview',
    module: 'bookmark',
    labelKey: 'bookmarkCreateNotePreview',
    taskTypes: ['skill_bookmark_create_note_preview'],
  }),
  tokenAction({
    id: 'bookmark.parse_url',
    module: 'bookmark',
    labelKey: 'bookmarkParseUrl',
    taskTypes: ['skill_bookmark_parse_url'],
    reservationTokens: 8_000,
  }),
  tokenAction({
    id: 'todo.parse_draft',
    module: 'todo',
    labelKey: 'todoParseDraft',
    taskTypes: ['skill_todo_parse_draft'],
  }),
  tokenAction({
    id: 'todo.breakdown',
    module: 'todo',
    labelKey: 'todoBreakdown',
    taskTypes: ['skill_todo_breakdown'],
  }),
  tokenAction({
    id: 'note.extract_todos',
    module: 'note',
    labelKey: 'noteExtractTodos',
    taskTypes: ['skill_note_extract_todos'],
  }),
  tokenAction({
    id: 'file.extract_todos',
    module: 'file',
    labelKey: 'fileExtractTodos',
    taskTypes: ['skill_file_extract_todos'],
    maxUserProviderCalls: 2,
    reservationTokens: 8_000,
  }),
  tokenAction({
    id: 'note.organize_tags',
    module: 'note',
    labelKey: 'noteOrganizeTags',
    taskTypes: ['organize_note_tags'],
    unit: 'item',
    maxUserProviderCalls: 20,
    maxPlatformProviderCalls: 0,
    reservationTokens: 100_000,
  }),
  tokenAction({
    id: 'bookmark.organize',
    module: 'bookmark',
    labelKey: 'bookmarkOrganize',
    taskTypes: ['organize_bookmark_meta'],
    unit: 'item',
    maxUserProviderCalls: 20,
    maxPlatformProviderCalls: 0,
    reservationTokens: 100_000,
  }),
  tokenAction({
    id: 'tag.icon_keywords',
    module: 'tag',
    labelKey: 'tagIconKeywords',
    taskTypes: ['tag_icon_search'],
    maxPlatformProviderCalls: 0,
  }),
]);

export const AI_FREE_ACTION_GROUPS = Object.freeze([
  Object.freeze({
    id: 'core_editing',
    module: 'general',
    labelKey: 'coreEditing',
    descriptionKey: 'coreEditingDescription',
  }),
  Object.freeze({
    id: 'local_search',
    module: 'search',
    labelKey: 'localSearch',
    descriptionKey: 'localSearchDescription',
  }),
  Object.freeze({
    id: 'file_local_processing',
    module: 'file',
    labelKey: 'fileLocalProcessing',
    descriptionKey: 'fileLocalProcessingDescription',
  }),
  Object.freeze({
    id: 'bookmark_snapshot',
    module: 'bookmark',
    labelKey: 'bookmarkSnapshot',
    descriptionKey: 'bookmarkSnapshotDescription',
  }),
  Object.freeze({
    id: 'tag_icon_direct_search',
    module: 'tag',
    labelKey: 'tagIconDirectSearch',
    descriptionKey: 'tagIconDirectSearchDescription',
  }),
  Object.freeze({
    id: 'cache_or_no_model',
    module: 'general',
    labelKey: 'cacheOrNoModel',
    descriptionKey: 'cacheOrNoModelDescription',
  }),
]);

const actionById = new Map(AI_BILLING_ACTIONS.map((action) => [action.id, action]));
const actionByTaskType = new Map(
  AI_BILLING_ACTIONS.flatMap((action) => action.taskTypes.map((taskType) => [taskType, action])),
);

export function getAiBillingAction(actionId) {
  const action = actionById.get(String(actionId || ''));
  if (!action) {
    const error = new Error('AI 能力缺少计费目录声明');
    error.code = 'AI_BILLING_ACTION_NOT_FOUND';
    error.status = 500;
    throw error;
  }
  return action;
}

export function resolveAiBillingAction({ skillId, taskType } = {}) {
  return actionByTaskType.get(String(taskType || '')) || actionById.get(String(skillId || '')) || null;
}

export function createUserAiExecutionConfig(actionId, overrides = {}) {
  const action = getAiBillingAction(actionId);
  return {
    billingPolicy: 'user',
    taskType: action.taskTypes[0] || action.id.replaceAll('.', '_'),
    skillId: action.id,
    reservationTokens: action.reservationTokens,
    maxUserProviderCalls: action.maxUserProviderCalls,
    maxPlatformProviderCalls: action.maxPlatformProviderCalls,
    ...overrides,
  };
}

/** 只返回用户可以理解的稳定字段，不泄露任务名、Provider 或内部预算。 */
export function listPublicAiBillingCatalog() {
  return {
    ruleVersion: 1,
    chargingRule: 'provider_actual_tokens',
    repairBilling: 'platform',
    missingUsageBilling: 'request_estimate_capped',
    tokenActions: AI_BILLING_ACTIONS.map(({ id, module, labelKey, unit }) => ({
      id,
      module,
      labelKey,
      unit,
    })),
    freeActions: AI_FREE_ACTION_GROUPS.map(({ id, module, labelKey, descriptionKey }) => ({
      id,
      module,
      labelKey,
      descriptionKey,
    })),
  };
}

export const aiBillingCatalogInternals = Object.freeze({ DEFAULT_RESERVATION_TOKENS });
