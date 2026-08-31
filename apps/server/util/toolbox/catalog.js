import { createHash } from 'node:crypto';
import {
  getToolboxTool,
  TOOLBOX_PRICING_VERSION,
  TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS,
  TOOLBOX_PROTOCOL_VERSION,
  TOOLBOX_TOOL_INTENTS,
  TOOLBOX_TOOL_CATALOG,
} from '@lightnote/shared/toolbox-protocol';
import { toolboxError } from './errors.js';

export const TOOLBOX_QUOTE_TTL_MS = 10 * 60_000;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._:@/-]{1,128}$/u;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9:_-]{12,64}$/u;
const PAID_PRICE_RANGES = Object.freeze({
  idea_to_draft: Object.freeze({ min: 12, max: 28 }),
  material_to_note: Object.freeze({ min: 8, max: 30 }),
  research_brief: Object.freeze({ min: 20, max: 60 }),
  study_kit: Object.freeze({ min: 18, max: 50 }),
  concept_map: Object.freeze({ min: 15, max: 45 }),
  action_plan: Object.freeze({ min: 10, max: 35 }),
  source_comparison: Object.freeze({ min: 15, max: 50 }),
  knowledge_audit: Object.freeze({ min: 20, max: 60 }),
  ocr_to_text: Object.freeze({ min: 5, max: 30 }),
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((out, key) => {
        out[key] = canonicalize(value[key]);
        return out;
      }, {});
  }
  return value;
}

export function toolboxInputDigest(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export function normalizeToolboxRequestId(value, label = '请求标识') {
  const normalized = String(value || '').trim();
  if (!SAFE_REQUEST_ID_PATTERN.test(normalized)) {
    throw toolboxError('TOOLBOX_REQUEST_ID_INVALID', `${label}无效，请刷新后重试`);
  }
  return normalized;
}

export function normalizeToolboxBillingMedium(toolId, value) {
  const definition = getToolboxTool(toolId);
  if (!definition) throw toolboxError('TOOLBOX_TOOL_NOT_FOUND', '不支持该工具', 404);
  const medium = String(value || definition.billingMedium || '').trim();
  if (medium === 'free' || !definition.billingMedia.includes(medium)) {
    throw toolboxError('TOOLBOX_BILLING_MEDIUM_INVALID', '该工具不支持所选计费方式');
  }
  return medium;
}

function normalizeResourceRefs(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw toolboxError('TOOLBOX_INPUT_INVALID', 'resourceRefs 必须是数组');
  const seen = new Set();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw toolboxError('TOOLBOX_INPUT_INVALID', '资源引用格式无效');
    }
    if (Object.keys(entry).some((key) => !['type', 'id', 'version'].includes(key))) {
      throw toolboxError('TOOLBOX_INPUT_UNKNOWN_FIELD', '资源引用包含未知字段');
    }
    const type = String(entry.type || '').trim();
    const id = String(entry.id || '').trim();
    const version = String(entry.version || '').trim();
    if (!['note', 'bookmark', 'file'].includes(type) || !SAFE_ID_PATTERN.test(id)) {
      throw toolboxError('TOOLBOX_RESOURCE_INVALID', '所选材料格式无效');
    }
    if (version && !SAFE_ID_PATTERN.test(version)) {
      throw toolboxError('TOOLBOX_RESOURCE_INVALID', '所选材料版本格式无效');
    }
    const key = `${type}:${id}`;
    if (seen.has(key)) throw toolboxError('TOOLBOX_RESOURCE_DUPLICATED', '同一材料不能重复选择');
    seen.add(key);
    return Object.freeze({ type, id, ...(version ? { version } : {}) });
  });
}

function normalizeSourceIds(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw toolboxError('TOOLBOX_INPUT_INVALID', 'sourceIds 必须是数组');
  const ids = value.map((id) => String(id || '').trim());
  if (ids.some((id) => !SAFE_ID_PATTERN.test(id))) {
    throw toolboxError('TOOLBOX_DOCUMENT_SOURCE_INVALID', '文件引用格式无效');
  }
  if (new Set(ids).size !== ids.length) {
    throw toolboxError('TOOLBOX_DOCUMENT_SOURCE_DUPLICATED', '同一文件不能重复选择');
  }
  return ids;
}

function normalizeOptions(toolId, value) {
  if (value == null) return Object.freeze({});
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw toolboxError('TOOLBOX_OPTIONS_INVALID', '工具选项必须是对象');
  }
  const allowed = new Set(['title', 'question', 'intent', 'detailLevel', 'targetLength']);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length)
    throw toolboxError('TOOLBOX_OPTIONS_UNKNOWN_FIELD', `工具选项包含未知字段：${unknown.join(', ')}`);
  const title = String(value.title || '').trim();
  const question = String(value.question || '').trim();
  const intent = String(value.intent || '').trim();
  const detailLevel = String(value.detailLevel || 'balanced').trim();
  if (title.length > 200) throw toolboxError('TOOLBOX_TITLE_TOO_LONG', '标题最多 200 个字符');
  if (question.length > TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS) {
    throw toolboxError('TOOLBOX_QUESTION_TOO_LONG', `处理要求最多 ${TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS} 个字符`);
  }
  const allowedIntents = TOOLBOX_TOOL_INTENTS[toolId] || [];
  if (intent && !allowedIntents.includes(intent)) {
    throw toolboxError('TOOLBOX_INTENT_INVALID', '不支持该工具工作方式');
  }
  if (!['concise', 'balanced', 'detailed'].includes(detailLevel)) {
    throw toolboxError('TOOLBOX_DETAIL_LEVEL_INVALID', '不支持该输出详细程度');
  }
  let targetLength = null;
  if (value.targetLength != null && value.targetLength !== '') {
    targetLength = Number(value.targetLength);
    if (!Number.isSafeInteger(targetLength) || targetLength < 200 || targetLength > 10_000) {
      throw toolboxError('TOOLBOX_TARGET_LENGTH_INVALID', '目标篇幅必须是 200～10000 之间的整数');
    }
  }
  return Object.freeze({
    ...(title ? { title } : {}),
    ...(question ? { question } : {}),
    ...(intent ? { intent } : {}),
    detailLevel,
    ...(targetLength ? { targetLength } : {}),
  });
}

export function normalizeToolboxInput(toolId, rawInput) {
  const definition = getToolboxTool(toolId);
  if (!definition) throw toolboxError('TOOLBOX_TOOL_NOT_FOUND', '不支持该工具', 404);
  if (definition.executionMode === 'browser') {
    throw toolboxError('TOOLBOX_LOCAL_TOOL_NO_SERVER_JOB', '该工具只在浏览器本地运行，不创建服务端任务');
  }
  if (definition.executionMode === 'service') {
    throw toolboxError('TOOLBOX_FREE_SERVICE_NO_JOB', '该免费工具直接读取当前知识库，不创建报价或异步任务');
  }
  const input = rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput) ? rawInput : {};
  const unknown = Object.keys(input).filter((key) => !['resourceRefs', 'sourceIds', 'options'].includes(key));
  if (unknown.length) throw toolboxError('TOOLBOX_INPUT_UNKNOWN_FIELD', `工具输入包含未知字段：${unknown.join(', ')}`);
  const resourceRefs = normalizeResourceRefs(input.resourceRefs);
  const sourceIds = normalizeSourceIds(input.sourceIds);
  const options = normalizeOptions(toolId, input.options);
  if (definition.input.kind === 'prompt' && !options.question) {
    throw toolboxError('TOOLBOX_QUESTION_REQUIRED', '请输入要展开的主题、想法或目标');
  }
  if (definition.input.kind === 'resources' && sourceIds.length) {
    throw toolboxError('TOOLBOX_INPUT_TYPE_INVALID', '该工具当前只支持轻笺内的资料');
  }
  if (definition.input.kind === 'documents' && resourceRefs.some((ref) => ref.type !== 'file')) {
    throw toolboxError('TOOLBOX_INPUT_TYPE_INVALID', 'OCR 仅支持云文件或本地上传文件');
  }
  const unsupported = resourceRefs.find((ref) => !definition.input.resourceTypes?.includes(ref.type));
  if (unsupported) throw toolboxError('TOOLBOX_INPUT_TYPE_INVALID', `该工具不能处理 ${unsupported.type} 类型材料`);
  const count = resourceRefs.length + sourceIds.length;
  if (count < definition.input.minItems || count > definition.input.maxItems) {
    throw toolboxError(
      'TOOLBOX_INPUT_COUNT_INVALID',
      `该工具需要选择 ${definition.input.minItems}～${definition.input.maxItems} 项材料`,
    );
  }
  return Object.freeze({ resourceRefs: Object.freeze(resourceRefs), sourceIds: Object.freeze(sourceIds), options });
}

export function quoteToolboxPoints(toolId, { itemCount, totalBytes = 0, snapshot = null, options = null } = {}) {
  const count = Math.max(0, Math.floor(Number(itemCount) || 0));
  const sizeMiB = Math.max(0, Number(totalBytes) || 0) / (1024 * 1024);
  const quoteOptions = snapshot?.options || options || {};
  let points;
  if (toolId === 'idea_to_draft') {
    points = quoteOptions.detailLevel === 'concise' ? 12 : quoteOptions.detailLevel === 'detailed' ? 28 : 18;
  } else if (toolId === 'material_to_note') points = 8 + Math.max(0, count - 2) * 3;
  else if (toolId === 'research_brief') points = 20 + Math.max(0, count - 4) * 5;
  else if (toolId === 'study_kit') points = 18 + Math.max(0, count - 2) * 4;
  else if (toolId === 'concept_map') points = 15 + Math.max(0, count - 1) * 3;
  else if (toolId === 'action_plan') points = 10 + Math.max(0, count - 1) * 3;
  else if (toolId === 'source_comparison') points = 15 + Math.max(0, count - 2) * 5;
  else if (toolId === 'knowledge_audit') points = 20 + Math.max(0, count - 2) * 4;
  else if (toolId === 'ocr_to_text') points = 5 + Math.max(0, count - 1) * 2 + Math.ceil(sizeMiB / 2) * 2;
  else throw toolboxError('TOOLBOX_QUOTE_NOT_REQUIRED', '该工具无需服务端报价');
  const range = PAID_PRICE_RANGES[toolId];
  return Math.min(range.max, Math.max(range.min, Math.floor(points)));
}

export function getPublicToolboxCatalog({ disabledToolIds = [] } = {}) {
  const disabled = new Set(disabledToolIds.map(String));
  return {
    protocolVersion: TOOLBOX_PROTOCOL_VERSION,
    pricingVersion: TOOLBOX_PRICING_VERSION,
    chargeRule: 'single_medium_per_execution',
    tools: TOOLBOX_TOOL_CATALOG.map((definition) => ({
      ...definition,
      availability: { enabled: definition.availability.enabled && !disabled.has(definition.id) },
      ...(definition.billingMedium === 'points'
        ? { price: { kind: 'quote', currency: 'points', ...PAID_PRICE_RANGES[definition.id] } }
        : { price: { kind: 'free', currency: null, min: 0, max: 0 } }),
    })),
  };
}

export function getDisabledToolIds(env = process.env) {
  return String(env.TOOLBOX_DISABLED_TOOLS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const toolboxCatalogInternals = Object.freeze({
  PAID_PRICE_RANGES,
  SAFE_ID_PATTERN,
  canonicalize,
  normalizeOptions,
});
