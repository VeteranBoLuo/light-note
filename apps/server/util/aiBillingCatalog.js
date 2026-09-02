/**
 * AI 计费目录是业务能力、额度门禁和用户用量页共同依赖的唯一事实源。
 *
 * 约束：
 * - 只有 billingMode=token 且真实访问 Provider 的用户主调用才会扣用户额度；
 * - 缓存命中、无材料、本地解析等没有 Provider Span 的执行始终为 0；
 * - 模型输出协议修复属于平台质量成本，不计入用户额度；
 * - 用户计费执行最终没有可交付结果时退回本次额度，但 Provider 用量与频控记录保留；
 * - freeActions 只用于解释产品边界，禁止据此创建可访问 Provider 的免费执行。
 */
import { AI_PROVIDER_STAGE_TYPES, createAiProviderPlan } from './aiExecution/providerPlan.js';
import { AI_EXECUTION_BILLING_RULE_VERSION } from './aiExecution/policy.js';
import {
  AI_SKILL_IMPLICIT_EVIDENCE_RESERVATION_TOKENS,
  AI_SKILL_MAX_CHARS_PER_RESOURCE,
  AI_SKILL_MAX_INPUT_RESERVATION_TOKENS,
  AI_SKILL_MAX_RESERVATION_TOKENS,
  AI_SKILL_MAX_TOTAL_EVIDENCE_CHARS,
  AI_SKILL_PROTOCOL_RESERVATION_TOKENS,
  AI_SKILL_VISION_RESERVATION_TOKENS_PER_FILE,
} from './aiSkill/limits.js';

const DEFAULT_RESERVATION_TOKENS = 5_000;
export const AI_BILLING_RULE_VERSION = AI_EXECUTION_BILLING_RULE_VERSION;

function tokenAction({
  id,
  module,
  labelKey,
  taskTypes = [],
  unit = 'request',
  maxUserProviderCalls = 1,
  maxPlatformProviderCalls = 1,
  reservationTokens = DEFAULT_RESERVATION_TOKENS,
  publicCatalog = true,
  allowedBillingPolicies = ['user', 'system'],
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
    publicCatalog,
    allowedBillingPolicies: Object.freeze([...allowedBillingPolicies]),
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
  }),
  tokenAction({
    id: 'file.ask',
    module: 'file',
    labelKey: 'fileAsk',
    taskTypes: ['skill_file_ask'],
  }),
  tokenAction({
    id: 'file.compare',
    module: 'file',
    labelKey: 'fileCompare',
    taskTypes: ['skill_file_compare'],
  }),
  tokenAction({
    id: 'file.create_note_preview',
    module: 'file',
    labelKey: 'fileCreateNotePreview',
    taskTypes: ['skill_file_create_note_preview'],
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
  tokenAction({
    id: 'tag.analyze',
    module: 'tag',
    labelKey: 'tagAnalyze',
    taskTypes: ['skill_tag_analyze'],
  }),
  ...[
    ['idea_to_draft', 'toolboxIdeaToDraft'],
    ['material_to_note', 'toolboxMaterialToNote'],
    ['research_brief', 'toolboxResearchBrief'],
    ['study_kit', 'toolboxStudyKit'],
    ['concept_map', 'toolboxConceptMap'],
    ['action_plan', 'toolboxActionPlan'],
    ['source_comparison', 'toolboxSourceComparison'],
    ['knowledge_audit', 'toolboxKnowledgeAudit'],
  ].map(([profileId, labelKey]) =>
    tokenAction({
      id: `toolbox.${profileId}`,
      module: 'toolbox',
      labelKey,
      taskTypes: [`skill_toolbox_${profileId}`],
      reservationTokens: 12_000,
      publicCatalog: true,
      allowedBillingPolicies: ['user', 'system'],
    }),
  ),
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
  if (!action.allowedBillingPolicies.includes('user')) {
    const error = new Error('该 AI 能力不使用用户 AI 额度');
    error.code = 'AI_BILLING_POLICY_NOT_ALLOWED';
    error.status = 500;
    throw error;
  }
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

function normalizedResourceRefs(request, context) {
  if (Array.isArray(context?.resourceRefs)) return context.resourceRefs;
  return Array.isArray(request?.scope?.resourceRefs) ? request.scope.resourceRefs : [];
}

function resolvePolicyValue(value, context, fallback) {
  const resolved = typeof value === 'function' ? value(context) : value;
  const number = Number(resolved ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function estimateInputReservationTokens(request) {
  if (request?.input == null) return 0;
  let serialized;
  try {
    serialized = JSON.stringify(request.input);
  } catch {
    return AI_SKILL_MAX_INPUT_RESERVATION_TOKENS;
  }
  if (!serialized) return 0;
  // UTF-8 字节数 / 3 同时对中文保持约 1 字 1 token 的保守上界，
  // 对英文也比常见的约 4 字符 1 token 更保守。真正额度仍只按 Provider 回报结算。
  return Math.min(AI_SKILL_MAX_INPUT_RESERVATION_TOKENS, Math.ceil(Buffer.byteLength(serialized, 'utf8') / 3));
}

export function compileAiSkillProviderPlan(skill, request, context) {
  const refs = normalizedResourceRefs(request, context);
  const policyContext = Object.freeze({ resourceCount: refs.length, resourceRefs: refs, request, context });
  const modelGenerationCalls = Math.max(
    0,
    Math.floor(resolvePolicyValue(skill?.providerPlanPolicy?.modelGenerationCalls, policyContext, 1)),
  );
  const outputRepairCalls = Math.max(
    0,
    Math.floor(resolvePolicyValue(skill?.providerPlanPolicy?.outputRepairCalls, policyContext, modelGenerationCalls)),
  );
  const imageRecognitionCalls = skill?.providerPlanPolicy?.imageRecognition
    ? refs.filter((ref) => ref?.type === 'file').length
    : 0;
  return createAiProviderPlan({
    ...(imageRecognitionCalls
      ? {
          [AI_PROVIDER_STAGE_TYPES.IMAGE_RECOGNITION]: {
            billingScope: 'user',
            maxCalls: imageRecognitionCalls,
          },
        }
      : {}),
    [AI_PROVIDER_STAGE_TYPES.MODEL_GENERATION]: { billingScope: 'user', maxCalls: modelGenerationCalls },
    [AI_PROVIDER_STAGE_TYPES.OUTPUT_REPAIR]: { billingScope: 'platform', maxCalls: outputRepairCalls },
  });
}

export function estimateAiSkillReservationTokens(skill, request, action = getAiBillingAction(skill?.id), context) {
  const refs = normalizedResourceRefs(request, context);
  const policy = skill?.providerPlanPolicy || {};
  const policyContext = Object.freeze({ resourceCount: refs.length, resourceRefs: refs, request, context });
  const maxCharsPerResource = Math.max(
    1,
    Math.floor(resolvePolicyValue(policy.maxCharsPerResource, policyContext, AI_SKILL_MAX_CHARS_PER_RESOURCE)),
  );
  const maxTotalEvidenceChars = Math.max(
    1,
    Math.floor(resolvePolicyValue(policy.maxTotalEvidenceChars, policyContext, AI_SKILL_MAX_TOTAL_EVIDENCE_CHARS)),
  );
  const explicitEvidenceTokens = refs.length
    ? Math.min(maxTotalEvidenceChars, refs.length * maxCharsPerResource)
    : AI_SKILL_IMPLICIT_EVIDENCE_RESERVATION_TOKENS;
  const imageFileCount = policy.imageRecognition ? refs.filter((ref) => ref?.type === 'file').length : 0;
  const generationCalls = Math.max(1, Math.floor(resolvePolicyValue(policy.modelGenerationCalls, policyContext, 1)));
  const resolvedModelPolicy =
    typeof skill?.resolveModelPolicy === 'function'
      ? skill.resolveModelPolicy(request?.input || {}) || skill.modelPolicy
      : skill?.modelPolicy;
  const requested =
    explicitEvidenceTokens +
    estimateInputReservationTokens(request) +
    imageFileCount * AI_SKILL_VISION_RESERVATION_TOKENS_PER_FILE +
    generationCalls *
      (Math.max(1, Math.floor(Number(resolvedModelPolicy?.maxTokens || 1_024))) +
        AI_SKILL_PROTOCOL_RESERVATION_TOKENS);
  return Math.min(
    AI_SKILL_MAX_RESERVATION_TOKENS,
    Math.max(action.reservationTokens, Math.max(1, Math.floor(requested))),
  );
}

/**
 * Skill 的调用阶段由“能力声明 + 本轮已校验材料”编译。计费目录只负责动作身份；
 * 图片数、修复数和预占预算不再由每个 action 手工复制。
 */
export function createAiSkillExecutionConfig(skill, request, overrides = {}, context) {
  const action = getAiBillingAction(skill?.id);
  const providerPlan = compileAiSkillProviderPlan(skill, request, context);
  const billingPolicy = String(overrides.billingPolicy || 'user');
  if (!['user', 'system'].includes(billingPolicy)) {
    const error = new Error('AI Skill 额度策略无效');
    error.code = 'AI_SKILL_BILLING_POLICY_INVALID';
    error.status = 500;
    throw error;
  }
  if (!action.allowedBillingPolicies.includes(billingPolicy)) {
    const error = new Error('当前 AI 能力不允许使用该额度策略');
    error.code = 'AI_BILLING_POLICY_NOT_ALLOWED';
    error.status = 500;
    throw error;
  }
  return {
    taskType: action.taskTypes[0] || action.id.replaceAll('.', '_'),
    ...overrides,
    // 只有服务端内部调用方能传 overrides；公开 Skill HTTP 协议没有该字段。工具箱积分任务
    // 使用 system 额度承担固定产物的模型成本，避免同一次执行同时扣积分和用户 AI 额度。
    billingPolicy,
    skillId: action.id,
    providerPlan,
    reservationTokens: estimateAiSkillReservationTokens(skill, request, action, context),
    maxUserProviderCalls: providerPlan.maxUserProviderCalls,
    maxPlatformProviderCalls: providerPlan.maxPlatformProviderCalls,
    billingRuleVersion: AI_BILLING_RULE_VERSION,
  };
}

/** 只返回用户可以理解的稳定字段，不泄露任务名、Provider 或内部预算。 */
export function listPublicAiBillingCatalog() {
  return {
    ruleVersion: AI_BILLING_RULE_VERSION,
    chargingRule: 'provider_actual_tokens',
    repairBilling: 'platform',
    failedExecutionBilling: 'platform',
    missingUsageBilling: 'request_estimate_capped',
    tokenActions: AI_BILLING_ACTIONS.filter((action) => action.publicCatalog).map(({ id, module, labelKey, unit }) => ({
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

export const aiBillingCatalogInternals = Object.freeze({
  DEFAULT_RESERVATION_TOKENS,
  estimateInputReservationTokens,
  normalizedResourceRefs,
});
