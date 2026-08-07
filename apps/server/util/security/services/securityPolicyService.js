import pool from '../../../db/index.js';
import { SECURITY_RULE_CATALOG } from '../rules.js';

const POLICY_CACHE_TTL_MS = 30_000;
const VALID_MODES = new Set(['observe', 'block', 'off']);
const DEFAULT_BLOCK_RULES = new Set([
  'SENSITIVE_PATH_PROBE',
  'MALICIOUS_FILE_UPLOAD',
  'SQL_UNION_SELECT',
  'SQL_STACKED_QUERY',
  'PATH_TRAVERSAL',
  'BRUTE_FORCE',
  'CREDENTIAL_STUFFING',
]);

let cachedSnapshot = null;
let cacheExpiresAt = 0;

const defaultPolicy = (rule) => ({
  ruleCode: rule.code,
  mode: DEFAULT_BLOCK_RULES.has(rule.code) ? 'block' : 'observe',
  scoreOverride: null,
  routePattern: null,
  requestMethod: null,
  fieldPattern: null,
  fieldContext: null,
  version: 1,
});

const wildcardMatches = (pattern, value) => {
  if (!pattern) return true;
  const escaped = String(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(String(value || ''));
};

const policyApplies = (policy, context, evidence) => {
  if (policy.requestMethod && String(policy.requestMethod).toUpperCase() !== String(context.method).toUpperCase()) {
    return false;
  }
  if (policy.routePattern && !wildcardMatches(policy.routePattern, context.path)) return false;
  if (policy.fieldPattern && !wildcardMatches(policy.fieldPattern, evidence.matchedField)) return false;
  if (policy.fieldContext && policy.fieldContext !== evidence.fieldContext) return false;
  return true;
};

const normalizePolicyRow = (row) => ({
  ruleCode: row.rule_code,
  mode: VALID_MODES.has(row.mode) ? row.mode : 'observe',
  scoreOverride: row.score_override == null ? null : Math.max(0, Math.min(100, Number(row.score_override))),
  routePattern: row.route_pattern || null,
  requestMethod: row.request_method || null,
  fieldPattern: row.field_pattern || null,
  fieldContext: row.field_context || null,
  version: Math.max(1, Number(row.version || 1)),
});

const normalizeExceptionRow = (row) => ({
  id: row.id,
  subjectType: row.subject_type,
  subjectValue: row.subject_value,
  ruleCode: row.rule_code || null,
  routePattern: row.route_pattern || null,
  requestMethod: row.request_method || null,
  fieldPattern: row.field_pattern || null,
  effect: row.effect,
  scoreDelta: Number(row.score_delta || 0),
});

const defaultSnapshot = () => ({
  policies: new Map(SECURITY_RULE_CATALOG.map((rule) => [rule.code, [defaultPolicy(rule)]])),
  exceptions: [],
  version: 1,
});

export const clearSecurityPolicyCache = () => {
  cachedSnapshot = null;
  cacheExpiresAt = 0;
};

export const getSecurityPolicySnapshot = async () => {
  if (cachedSnapshot && cacheExpiresAt > Date.now()) return cachedSnapshot;
  const snapshot = defaultSnapshot();
  try {
    const [overrideRows] = await pool.query(
      `SELECT *
       FROM security_rule_overrides
       WHERE enabled = 1 AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY rule_code, version DESC, id DESC`,
    );
    const overridesByRule = new Map();
    for (const row of overrideRows) {
      const policy = normalizePolicyRow(row);
      const current = overridesByRule.get(policy.ruleCode) || [];
      current.push(policy);
      overridesByRule.set(policy.ruleCode, current);
      snapshot.version = Math.max(snapshot.version, policy.version);
    }
    for (const [ruleCode, policies] of overridesByRule) {
      snapshot.policies.set(ruleCode, [...policies, ...(snapshot.policies.get(ruleCode) || [])]);
    }
    const [exceptionRows] = await pool.query(
      `SELECT *
       FROM security_exceptions
       WHERE enabled = 1 AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY id DESC`,
    );
    snapshot.exceptions = exceptionRows.map(normalizeExceptionRow);
  } catch {
    // Schema 尚未就绪或数据库短时不可用时，使用代码内的保守默认策略。
  }
  cachedSnapshot = snapshot;
  cacheExpiresAt = Date.now() + POLICY_CACHE_TTL_MS;
  return snapshot;
};

const exceptionMatches = (exception, context, evidence) => {
  const subjectValue = exception.subjectType === 'user' ? context.userId : context.sourceIp;
  if (!subjectValue || String(subjectValue) !== String(exception.subjectValue)) return false;
  if (exception.ruleCode && exception.ruleCode !== evidence.ruleCode) return false;
  if (exception.requestMethod && String(exception.requestMethod).toUpperCase() !== String(context.method).toUpperCase()) {
    return false;
  }
  if (exception.routePattern && !wildcardMatches(exception.routePattern, context.path)) return false;
  if (exception.fieldPattern && !wildcardMatches(exception.fieldPattern, evidence.matchedField)) return false;
  return true;
};

export const applySecurityPolicies = async ({ context, evidenceList }) => {
  const snapshot = await getSecurityPolicySnapshot();
  const result = [];
  for (const evidence of evidenceList || []) {
    const candidates = snapshot.policies.get(evidence.ruleCode) || [];
    const policy = candidates.find((item) => policyApplies(item, context, evidence)) || {
      mode: 'observe',
      scoreOverride: null,
      version: snapshot.version,
    };
    let mode = policy.mode;
    let scoreDelta = policy.scoreOverride == null ? Number(evidence.scoreDelta || 0) : policy.scoreOverride;
    const matchedExceptions = snapshot.exceptions.filter((item) => exceptionMatches(item, context, evidence));
    if (matchedExceptions.some((item) => item.effect === 'skip_rule')) continue;
    if (matchedExceptions.some((item) => item.effect === 'observe_only')) mode = 'observe';
    for (const exception of matchedExceptions) {
      if (exception.effect === 'score_adjust') scoreDelta += exception.scoreDelta;
    }
    if (mode === 'off') continue;
    result.push({
      ...evidence,
      scoreDelta: Math.max(0, Math.min(100, scoreDelta)),
      policyMode: mode,
      policyVersion: policy.version || snapshot.version,
      exceptionIds: matchedExceptions.map((item) => item.id),
    });
  }
  return { evidenceList: result, policyVersion: snapshot.version };
};

export const getDefaultSecurityRuleMode = (ruleCode) => (DEFAULT_BLOCK_RULES.has(ruleCode) ? 'block' : 'observe');

export const matchesSecurityPolicyPattern = wildcardMatches;
