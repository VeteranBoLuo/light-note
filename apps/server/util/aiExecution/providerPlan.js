export const AI_PROVIDER_STAGE_TYPES = Object.freeze({
  IMAGE_RECOGNITION: 'image_recognition',
  MODEL_GENERATION: 'model_generation',
  OUTPUT_REPAIR: 'output_repair',
});

const VALID_BILLING_SCOPES = new Set(['user', 'platform']);
const VALID_STAGE_TYPES = new Set(Object.values(AI_PROVIDER_STAGE_TYPES));

export function classifyAiProviderStage(stage) {
  const normalized = String(stage || '')
    .trim()
    .toLowerCase();
  if (normalized === 'image_recognition' || normalized.startsWith('image_recognition_')) {
    return AI_PROVIDER_STAGE_TYPES.IMAGE_RECOGNITION;
  }
  if (normalized.endsWith('_repair')) return AI_PROVIDER_STAGE_TYPES.OUTPUT_REPAIR;
  return AI_PROVIDER_STAGE_TYPES.MODEL_GENERATION;
}

function providerPlanError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 500;
  return error;
}

function normalizeRule(stageType, rule) {
  const keys = rule && typeof rule === 'object' && !Array.isArray(rule) ? Object.keys(rule) : [];
  if (
    !VALID_STAGE_TYPES.has(stageType) ||
    !rule ||
    typeof rule !== 'object' ||
    Array.isArray(rule) ||
    !Object.hasOwn(rule, 'billingScope') ||
    !Object.hasOwn(rule, 'maxCalls') ||
    keys.some((key) => !['billingScope', 'maxCalls'].includes(key))
  ) {
    throw providerPlanError('AI_EXECUTION_PROVIDER_PLAN_INVALID', 'AI Provider 阶段计划无效');
  }
  const billingScope = String(rule.billingScope || '');
  const maxCalls = Number(rule.maxCalls);
  if (!VALID_BILLING_SCOPES.has(billingScope) || !Number.isSafeInteger(maxCalls) || maxCalls < 0) {
    throw providerPlanError('AI_EXECUTION_PROVIDER_PLAN_INVALID', 'AI Provider 阶段计划无效');
  }
  if (stageType === AI_PROVIDER_STAGE_TYPES.OUTPUT_REPAIR && billingScope !== 'platform') {
    throw providerPlanError('AI_EXECUTION_PROVIDER_PLAN_INVALID', '输出修复阶段必须由平台承担');
  }
  if (stageType !== AI_PROVIDER_STAGE_TYPES.OUTPUT_REPAIR && billingScope !== 'user') {
    throw providerPlanError('AI_EXECUTION_PROVIDER_PLAN_INVALID', '用户主阶段不能标记为平台调用');
  }
  return Object.freeze({ billingScope, maxCalls });
}

export function createAiProviderPlan(rules = {}) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    throw providerPlanError('AI_EXECUTION_PROVIDER_PLAN_INVALID', 'AI Provider 阶段计划无效');
  }
  for (const stageType of Object.keys(rules)) {
    if (!VALID_STAGE_TYPES.has(stageType)) {
      throw providerPlanError('AI_EXECUTION_PROVIDER_PLAN_INVALID', 'AI Provider 阶段计划包含未知阶段');
    }
  }
  const stages = {};
  for (const stageType of Object.values(AI_PROVIDER_STAGE_TYPES)) {
    if (!Object.hasOwn(rules, stageType)) continue;
    const rule = normalizeRule(stageType, rules[stageType]);
    if (rule.maxCalls > 0) stages[stageType] = rule;
  }
  const values = Object.values(stages);
  return Object.freeze({
    stages: Object.freeze(stages),
    maxUserProviderCalls: values
      .filter((rule) => rule.billingScope === 'user')
      .reduce((total, rule) => total + rule.maxCalls, 0),
    maxPlatformProviderCalls: values
      .filter((rule) => rule.billingScope === 'platform')
      .reduce((total, rule) => total + rule.maxCalls, 0),
  });
}

export function normalizeAiProviderPlan(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw providerPlanError('AI_EXECUTION_PROVIDER_PLAN_INVALID', 'AI Provider 阶段计划无效');
  }
  if (!Object.hasOwn(value, 'stages')) return createAiProviderPlan(value);
  const allowedKeys = ['stages', 'maxUserProviderCalls', 'maxPlatformProviderCalls'];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw providerPlanError('AI_EXECUTION_PROVIDER_PLAN_INVALID', 'AI Provider 阶段计划无效');
  }
  const plan = createAiProviderPlan(value.stages);
  for (const key of ['maxUserProviderCalls', 'maxPlatformProviderCalls']) {
    if (Object.hasOwn(value, key) && Number(value[key]) !== plan[key]) {
      throw providerPlanError('AI_EXECUTION_PROVIDER_PLAN_INVALID', 'AI Provider 阶段总上限与阶段规则不一致');
    }
  }
  return plan;
}

export function resolveAiProviderPlanRule(plan, stage) {
  const stageType = classifyAiProviderStage(stage);
  return { stageType, rule: plan?.stages?.[stageType] || null };
}
