import { getFieldContext } from '../fieldContext.js';
import { MALICIOUS_FILE_EXTENSIONS, SENSITIVE_PATHS, SIGNATURE_RULES } from '../rules.js';
import { flattenObject, safeJsonStringify, truncateText } from '../payloadSanitizer.js';
import { resolveRequestFieldPolicy } from '../requestFieldPolicy.js';

const createEvidence = ({ rule, field, value, message, scoreDelta, confidence }) => ({
  ruleCode: rule.code,
  ruleName: rule.name,
  detector: 'signature',
  attackType: rule.attackType,
  severity: rule.severity,
  matchedField: field,
  matchedValuePreview: truncateText(value),
  evidenceMessage: message || `${rule.name} 命中字段 ${field}`,
  scoreDelta: scoreDelta ?? rule.baseScore,
  confidence: confidence ?? rule.confidence,
});

const ENUM_SORT_VALUES_BY_PATH = [
  { pattern: /\/todo\/list\/?$/i, values: new Set(['smart', 'action', 'priority', 'due', 'newest', 'oldest']) },
  { pattern: /\/inbox\/list\/?$/i, values: new Set(['newest', 'oldest']) },
  { pattern: /\/search\/global\/?$/i, values: new Set(['relevance', 'updated', 'name']) },
  { pattern: /\/featureRequest\/listPublic\/?$/i, values: new Set(['updated', 'newest', 'popular']) },
  {
    pattern: /\/bookmark\/queryTagSpaces\/?$/i,
    values: new Set(['default', 'recent', 'resourcedesc', 'nameasc']),
  },
  { pattern: /\/bookmark\/queryTagSpaceResources\/?$/i, values: new Set(['updated', 'added']) },
];

const isKnownSortEnum = (context, item) => {
  const fieldName = String(item.field).split('.').pop();
  if (fieldName?.toLowerCase() !== 'sort') return false;
  const value = String(item.value).toLowerCase();
  return ENUM_SORT_VALUES_BY_PATH.some(
    ({ pattern, values }) => pattern.test(String(context.path || '')) && values.has(value),
  );
};

const COMMUNITY_CHAT_NOTIFICATION_LEVEL_VALUES = new Set(['official', 'mentions_only', 'mentions', 'all']);

const isKnownCommunityChatNotificationLevelEnum = (context, item) =>
  String(context.method || '').toUpperCase() === 'PUT' &&
  /^(?:\/api)?\/community-chat\/settings\/notifications\/?$/i.test(String(context.path || '')) &&
  String(item.field) === 'body.level' &&
  COMMUNITY_CHAT_NOTIFICATION_LEVEL_VALUES.has(String(item.value));

const isRuleApplicable = (rule, context) => {
  if (rule.includedContexts && !rule.includedContexts.includes(context)) {
    return false;
  }
  if (rule.excludedContexts && rule.excludedContexts.includes(context)) {
    return false;
  }
  return true;
};

const isRuleApplicableToField = (rule, field) => {
  if (!rule.fieldPattern) {
    return true;
  }
  return rule.fieldPattern.test(String(field).split('.').pop() || field);
};

const shouldSkipRuleForTrustedField = (requestFieldPolicy, ruleCode) => {
  if (!requestFieldPolicy?.trustedEnvelope) return false;
  if (requestFieldPolicy.skipSignatureRules === '*') return true;
  return requestFieldPolicy.skipSignatureRules.includes(ruleCode);
};

const detectPayloadSignatures = (context) => {
  const fields = [
    ...flattenObject(context.query, 'query'),
    ...flattenObject(context.body, 'body'),
    ...flattenObject(context.params, 'params'),
  ];
  const evidence = [];
  for (const item of fields) {
    const requestFieldPolicy = resolveRequestFieldPolicy(context, item.field);
    const fieldContext =
      !requestFieldPolicy?.trustedEnvelope && requestFieldPolicy?.fallbackContext
        ? requestFieldPolicy.fallbackContext
        : getFieldContext(item.field);
    for (const rule of SIGNATURE_RULES) {
      if (shouldSkipRuleForTrustedField(requestFieldPolicy, rule.code)) {
        continue;
      }
      if (!isRuleApplicable(rule, fieldContext)) {
        continue;
      }
      if (!isRuleApplicableToField(rule, item.field)) {
        continue;
      }
      if (rule.regex.test(String(item.value))) {
        evidence.push(
          createEvidence({
            rule,
            field: item.field,
            value: item.value,
            message: `${rule.name}，字段类型：${fieldContext}`,
          }),
        );
      }
    }
  }
  return evidence;
};

const detectHeaderInjection = (context) => {
  const headerText = safeJsonStringify(context.headersSummary);
  if (!/%0d|%0a|\r|\n/i.test(headerText)) {
    return [];
  }
  const rule = {
    code: 'HEADER_CRLF_INJECTION',
    name: '请求头 CRLF 注入',
    attackType: 'CRLF_INJECTION',
    severity: 'medium',
    baseScore: 35,
    confidence: 80,
  };
  return [
    createEvidence({
      rule,
      field: 'headers',
      value: headerText,
      message: '请求头中出现 CRLF 注入特征',
    }),
  ];
};

const detectSensitivePath = (context) => {
  const normalizedPath = String(context.path || '').replace(/^\/api\//, '/');
  const matched = SENSITIVE_PATHS.find((item) => item.pattern.test(normalizedPath.replace(/^\//, '')));
  if (!matched) {
    return [];
  }
  const rule = {
    code: 'SENSITIVE_PATH_PROBE',
    name: matched.name,
    attackType: 'SCANNER',
    severity: matched.score >= 50 ? 'high' : 'medium',
    baseScore: matched.score,
    confidence: 86,
  };
  return [
    createEvidence({
      rule,
      field: 'path',
      value: context.path,
      message: `访问常见敏感路径：${context.path}`,
    }),
  ];
};

const detectFileUpload = (context) => {
  const evidence = [];
  const isUploadPath = /\/file\/upload|\/upload$/i.test(context.path);
  for (const file of context.files || []) {
    const filename = file.originalname || file.filename || '';
    if (!MALICIOUS_FILE_EXTENSIONS.test(filename)) {
      continue;
    }
    const rule = {
      code: 'MALICIOUS_FILE_UPLOAD',
      name: '恶意文件上传',
      attackType: 'MALICIOUS_FILE_UPLOAD',
      severity: 'critical',
      baseScore: 86,
      confidence: 88,
    };
    evidence.push(
      createEvidence({
        rule,
        field: 'files.originalname',
        value: filename,
        message: `上传了高风险扩展名文件：${filename}`,
      }),
    );
  }
  // 检查 JSON body 中的 filename（仅限上传接口）
  if (isUploadPath) {
    const bodyName = context.body?.filename || context.body?.fileName || context.body?.originalName;
    if (bodyName && MALICIOUS_FILE_EXTENSIONS.test(bodyName)) {
      const rule = {
        code: 'MALICIOUS_FILE_UPLOAD',
        name: '恶意文件上传',
        attackType: 'MALICIOUS_FILE_UPLOAD',
        severity: 'critical',
        baseScore: 86,
        confidence: 88,
      };
      evidence.push(
        createEvidence({
          rule,
          field: 'body.filename',
          value: bodyName,
          message: `上传了高风险扩展名文件：${bodyName}`,
        }),
      );
    }
  }
  return evidence;
};

const detectParameterAnomaly = (context) => {
  const fields = [...flattenObject(context.query, 'query'), ...flattenObject(context.body, 'body')];
  const evidence = [];
  // 检查超长参数（协议 fuzzing 特征，排除正文类字段）。已登记业务语义的字段使用自己的
  // 权威预算；只有载荷形态和预算同时满足时才跳过通用阈值，畸形或超限输入仍会留下证据。
  const rawSources = [
    ['query', context.query || {}],
    ['body', context.body || {}],
  ];
  let overflowFound = false;
  for (const [scope, values] of rawSources) {
    for (const [key, value] of Object.entries(values)) {
      const field = `${scope}.${key}`;
      const requestFieldPolicy = resolveRequestFieldPolicy(context, field);
      const fieldContext = getFieldContext(field);
      if (!requestFieldPolicy && fieldContext === 'freeText') continue; // 正文内容天然可能很长
      const strVal = String(value ?? '');
      const exceedsGenericLimit = !requestFieldPolicy?.trustedEnvelope && strVal.length > 5000;
      if (requestFieldPolicy?.overBudget || exceedsGenericLimit || key.length > 500) {
        const message = requestFieldPolicy?.overBudget
          ? `参数 ${field} 超出 ${requestFieldPolicy.semantic} 业务上限: value=${requestFieldPolicy.size} limit=${requestFieldPolicy.maxSize} unit=${requestFieldPolicy.sizeUnit}`
          : `参数 ${field} 长度异常: key=${key.length} value=${strVal.length}`;
        const rule = {
          code: 'PARAMETER_OVERFLOW',
          name: '参数溢出',
          attackType: 'PROTOCOL_ANOMALY',
          severity: 'medium',
          baseScore: 22,
          confidence: 80,
        };
        evidence.push(
          createEvidence({
            rule,
            field,
            value: strVal.slice(0, 200),
            message,
          }),
        );
        overflowFound = true;
        break;
      }
    }
    if (overflowFound) break;
  }
  for (const item of fields) {
    const fieldContext = getFieldContext(item.field);
    if (fieldContext !== 'numeric') {
      continue;
    }
    // 部分接口复用了看似数值字段的名称，但实际由服务端枚举白名单严格约束。
    if (isKnownSortEnum(context, item) || isKnownCommunityChatNotificationLevelEnum(context, item)) {
      continue;
    }
    const value = String(item.value);
    if (value && !/^-?\d+(\.\d+)?$/.test(value)) {
      const rule = {
        code: 'NUMERIC_PARAM_ANOMALY',
        name: '数值参数异常',
        attackType: 'PAYLOAD_ANOMALY',
        severity: 'low',
        baseScore: 12,
        confidence: 68,
      };
      evidence.push(
        createEvidence({
          rule,
          field: item.field,
          value,
          message: `数值型字段出现非数值内容：${item.field}`,
        }),
      );
    }
  }
  return evidence;
};

export const detectSignatures = (context) => [
  ...detectSensitivePath(context),
  ...detectPayloadSignatures(context),
  ...detectHeaderInjection(context),
  ...detectFileUpload(context),
  ...detectParameterAnomaly(context),
];
